import { captureActivePage } from './capture.js';
import { LiveBrowser } from './browser.js';
import distribution from './distribution.js';
import { GlobalAccess, PAGE_ORIGINS } from './permissions.js';

const $ = id => document.getElementById(id);
const extensionVersion = chrome.runtime.getManifest().version;
const pageOrigins = PAGE_ORIGINS;
const globalAccess = new GlobalAccess(chrome);
$('extensionVersion').textContent = extensionVersion;
$('menuVersion').textContent = `v${extensionVersion}`;
for (const [id, value] of [['downloadLink', distribution.downloadUrl], ['storeLink', distribution.chromeWebStoreUrl]]) {
  // Unpublished/invalid endpoints never become navigable links.
  try { if (typeof value === 'string' && new URL(value).protocol === 'https:') { $(id).href = value; $(id).hidden = false; } } catch {}
}
if (!$('downloadLink').hidden || !$('storeLink').hidden) $('setupAvailability').textContent = 'See the installation instructions and available extension downloads.';
const setupGuidance = 'Run ./install.sh from your Local Codex folder, then codex login if needed. For updates, close the panel, run npm run update and reload the extension in chrome://extensions.';
const panelConflict = message => message.includes('The bridge is open in another panel.');
function connectionGuidance(message) {
  return panelConflict(message)
    ? 'Another Local Codex panel is connected, possibly in a different Chrome window. Close that panel, then reconnect here. No reinstall or sign-in is needed.'
    : `${message} ${setupGuidance}`;
}

let port, connecting = false, connected = false, compatible = false, authenticated = false, busy = false, current = null, page = null, nextId = 1;
const pending = new Map();
let assistantBody = null, itemId = null;
const browser = new LiveBrowser();
let browserApproval = null, startupError = null, models = [];
function endBrowser() {
  browser.disable();
  browserApproval?.resolve(false); browserApproval = null;
  $('browserApproval').hidden = true; $('browserTarget').textContent = '';
}
async function approveBrowser(details) {
  if (await globalAccess.actionsEnabled() && (!details.requestOrigin || await chrome.permissions.contains({ origins: [details.requestOrigin] }))) return true;
  if (browserApproval) return Promise.resolve(false);
  $('browserAction').textContent = `${details.operation.operation.toUpperCase()}\nPage: ${details.pageUrl}\n${details.element ? `Element: ${details.element.label || details.element.ref}\n` : ''}${details.operation.text ? `Text: ${details.operation.text}\n` : ''}${details.destination ? `Destination: ${details.destination}\n` : ''}${details.requestOrigin ? `Website access: ${details.requestOrigin}` : ''}`;
  $('browserApproval').hidden = false;
  $('state').textContent = 'Awaiting browser approval';
  return new Promise(resolve => { browserApproval = { ...details, resolve }; });
}
$('denyBrowser').addEventListener('click', () => {
  browserApproval?.resolve(false); browserApproval = null; $('browserApproval').hidden = true;
});
$('approveBrowser').addEventListener('click', async () => {
  const approval = browserApproval;
  if (!approval) return;
  $('approveBrowser').disabled = true;
  try {
    // Website permissions require this actual user gesture, not a model request.
    const granted = !approval.requestOrigin || await chrome.permissions.request({ origins: [approval.requestOrigin] });
    if (browserApproval === approval) approval.resolve(granted);
  } catch { approval.resolve(false); }
  finally { if (browserApproval === approval) browserApproval = null; $('approveBrowser').disabled = false; $('browserApproval').hidden = true; }
});

function fail(message) { $('error').textContent = message; $('error').hidden = false; }
function clearError() { $('error').hidden = true; }
function controls() {
  $('send').disabled = !connected || !authenticated || busy || !models.length;
  $('stop').hidden = !busy;
  $('chats').disabled = busy;
  $('newChat').disabled = busy || !connected;
  $('applyWorkspace').disabled = busy || !compatible;
  $('connect').disabled = busy || connecting;
  $('allowBrowser').disabled = busy;
  $('allowEdits').disabled = busy;
  $('model').disabled = busy || !models.length;
  $('effort').disabled = busy || !$('effort').options.length;
  for (const id of ['permissionDuration', 'autoBrowserActions', 'enablePageAccess']) $(id).disabled = busy;
}
function setState(status) { $('state').textContent = status; busy = ['Starting', 'Running', 'Stopping'].includes(status); controls(); }
function request(method, params = {}) {
  if (!port) return Promise.reject(new Error('Connect the local bridge first.'));
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Bridge request timed out. Reconnect and resume the chat before retrying; the request may have completed.'));
    }, 60000);
    pending.set(id, { resolve, reject, timer });
    port.postMessage({ id, method, params });
  });
}
function resetMessages() {
  $('messages').replaceChildren();
  const empty = document.createElement('div'); empty.id = 'empty'; empty.setAttribute('aria-label', 'Start a conversation');
  const mark = document.createElement('img'); mark.className = 'brand-mark'; mark.src = 'icon-128.png'; mark.alt = '';
  empty.append(mark); $('messages').append(empty); assistantBody = null; itemId = null;
}
function appendMessage(role, text) {
  $('empty')?.remove();
  const article = document.createElement('article'); article.className = `message ${role}`;
  const label = document.createElement('div'); label.className = 'role'; label.textContent = role === 'assistant' ? 'Codex' : 'You';
  const body = document.createElement('div'); body.className = 'body'; body.textContent = text;
  article.append(label, body);
  if (role === 'assistant') {
    const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'copy-output';
    const icon = document.createElement('img'); icon.src = 'copy.svg'; icon.alt = ''; icon.width = 18; icon.height = 18;
    copy.append(icon); copy.title = 'Copy response'; copy.setAttribute('aria-label', 'Copy response');
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(body.textContent);
        copy.setAttribute('aria-label', 'Response copied'); copy.title = 'Response copied';
        setTimeout(() => { copy.setAttribute('aria-label', 'Copy response'); copy.title = 'Copy response'; }, 1500);
      } catch { fail('Could not copy this response. Select its text and copy it manually.'); }
    });
    article.append(copy);
  }
  $('messages').append(article);
  $('messages').scrollTop = $('messages').scrollHeight;
  return body;
}
async function refreshChats() {
  const { chats } = await request('list');
  $('chats').replaceChildren(new Option('New chat', ''));
  for (const chat of chats) $('chats').append(new Option(chat.title, chat.id));
  $('chats').value = current?.id || '';
}
function events(message) {
  if (message.event === 'fatal') { startupError = message.message; fail(message.message); return; }
  if (message.event === 'browserRequest') {
    const execute = async () => {
      let success = false, result;
      try {
        if (!busy || message.chatId !== current?.id) throw new Error('This chat has no active browser grant.');
        result = await browser.run(message.operation, approveBrowser); success = true;
      } catch (error) { result = { error: error.message }; }
      if (port) await request('browserResult', { requestId: message.requestId, success, result }).catch(() => {});
      if (busy) $('state').textContent = 'Running';
    };
    void execute(); return;
  }
  if (message.event === 'connection') {
    endBrowser();
    connected = false; authenticated = false; $('connection').textContent = 'Disconnected';
    setState('Interrupted'); fail(message.message); return;
  }
  if (message.event === 'historyStart') { resetMessages(); return; }
  if (message.event === 'historyMessage') {
    if (message.append) $('messages').lastElementChild.querySelector('.body').append(document.createTextNode(message.message.text));
    else appendMessage(message.message.role, message.message.text);
    return;
  }
  if (message.chatId !== current?.id) return;
  if (message.event === 'delta') {
    if (!assistantBody) assistantBody = appendMessage('assistant', '');
    if (itemId && message.itemId !== itemId) assistantBody.append(document.createTextNode('\n\n'));
    itemId = message.itemId;
    assistantBody.append(document.createTextNode(message.text));
    $('messages').scrollTop = $('messages').scrollHeight;
  }
  if (message.event === 'activity') $('state').textContent = message.text;
  if (message.event === 'state') {
    setState(({ running: 'Running', completed: 'Completed', interrupted: 'Interrupted', error: 'Error' })[message.status] || message.status);
    if (message.message) fail(message.message);
    if (!busy) { endBrowser(); refreshChats().catch(error => fail(error.message)); }
  }
}
async function connect() {
  if (connecting) return;
  connecting = true;
  endBrowser(); startupError = null; connected = false; compatible = false; authenticated = false; models = []; controls();
  for (const id of ['appVersion', 'bridgeVersion', 'protocolVersion']) $(id).textContent = 'Not connected';
  clearError();
  if (port) port.disconnect();
  port = chrome.runtime.connect({ name: 'local-codex-panel' });
  const thisPort = port;
  $('connection').textContent = 'Connecting';
  port.onMessage.addListener(message => {
    if (port !== thisPort) return;
    if (message.id !== undefined) {
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id); clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(message.error)); else entry.resolve(message.result);
    } else events(message);
  });
  port.onDisconnect.addListener(() => {
    const runtimeError = chrome.runtime.lastError?.message;
    const error = startupError || runtimeError || 'Native bridge disconnected.';
    if (port !== thisPort) return;
    port = null; connected = false; compatible = false; authenticated = false;
    endBrowser();
    $('connection').textContent = 'Disconnected'; setState('Interrupted');
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error(error)); }
    pending.clear();
    fail(connectionGuidance(error));
  });
  try {
    let compatibility;
    try {
      compatibility = await request('handshake', { protocolVersion: 1, minimumProtocolVersion: 1, extensionVersion });
    } catch (error) {
      if (panelConflict(error.message)) throw new Error(connectionGuidance(error.message));
      throw new Error(`The local bridge could not confirm compatibility: ${error.message} ${setupGuidance}`);
    }
    if (!compatibility || !Number.isSafeInteger(compatibility.protocolVersion)
      || !Number.isSafeInteger(compatibility.minimumProtocolVersion)
      || compatibility.minimumProtocolVersion < 1 || compatibility.minimumProtocolVersion > compatibility.protocolVersion
      || compatibility.protocolVersion < 1 || compatibility.minimumProtocolVersion > 1
      || typeof compatibility.bridgeVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(compatibility.bridgeVersion)) {
      throw new Error(`The local bridge and extension are incompatible. Update both before reconnecting. ${setupGuidance}`);
    }
    $('bridgeVersion').textContent = compatibility.bridgeVersion;
    $('protocolVersion').textContent = String(Math.min(1, compatibility.protocolVersion));
    $('appVersion').textContent = compatibility.appVersion || 'Source installation';
    compatible = true;
    const result = await request('hello');
    connected = true; authenticated = result.authenticated;
    $('connection').textContent = authenticated ? `Connected / ${result.authType || 'provider'}` : 'Sign-in required';
    $('workspace').value = result.workspace;
    if (!authenticated) fail('Run codex login in Terminal, finish Codex sign-in, then reconnect.');
    if (current) await resume(current.id); else setState('Ready');
    await refreshChats();
    const catalog = await request('models'); models = catalog.models;
    $('model').replaceChildren(...models.map(model => new Option(model.displayName, model.model)));
    const preferred = localStorage.getItem('model');
    $('model').value = models.find(model => model.model === preferred)?.model || models.find(model => model.isDefault)?.model || models[0]?.model || '';
    updateEfforts(); controls();
  } catch (error) { connected = false; authenticated = false; models = []; fail(error.message); setState('Error'); }
  finally { connecting = false; controls(); }
}
async function resume(id) {
  clearError(); setState('Starting');
  try {
    const result = await request('resume', { id }); current = result.chat;
    $('chatWorkspace').textContent = `Chat workspace: ${current.workspace}`;
    $('allowEdits').checked = false;
    setState(current.status === 'interrupted' ? 'Interrupted' : 'Ready');
  } catch (error) { current = null; resetMessages(); setState('Error'); fail(error.message); }
}
$('connect').addEventListener('click', connect);
$('workspaceForm').addEventListener('submit', async event => {
  event.preventDefault(); clearError();
  try {
    if (!compatible) throw new Error(`Confirm bridge compatibility before changing the workspace. ${setupGuidance}`);
    const result = await request('setWorkspace', { workspace: $('workspace').value });
    $('workspace').value = result.workspace;
    if (!connected) await connect(); else setState('Workspace saved');
  } catch (error) { fail(error.message); }
});
$('newChat').addEventListener('click', () => {
  endBrowser(); $('allowBrowser').checked = false;
  current = null; $('chats').value = ''; $('chatWorkspace').textContent = ''; $('allowEdits').checked = false; resetMessages(); clearError(); setState('Ready');
});
$('chats').addEventListener('change', () => {
  if ($('chats').value) resume($('chats').value); else $('newChat').click();
});
async function captureCurrentPage() {
  page = null;
  $('currentPageStatus').textContent = 'Checking current page…';
  try {
    await globalAccess.reconcile();
    const result = await captureActivePage();
    if (!result) {
      $('currentPageStatus').textContent = 'No webpage context on this tab.';
      return null;
    }
    page = result;
    $('currentPageStatus').textContent = `${page.title || 'Current page'} · ${page.url}`;
    return page;
  } catch (error) {
    $('currentPageStatus').textContent = 'Current page unavailable. Enable website access or use the toolbar icon.';
    throw new Error(`Cannot access the current page. In App settings → Page context, enable global website access, or click the Local Codex toolbar icon on this website, then send again. ${error.message}`);
  }
}
function updateEfforts() {
  const model = models.find(model => model.model === $('model').value);
  const preferred = localStorage.getItem('effort');
  $('effort').replaceChildren(...(model?.supportedReasoningEfforts || []).map(option => new Option(option.reasoningEffort[0].toUpperCase() + option.reasoningEffort.slice(1), option.reasoningEffort)));
  $('effort').value = model?.supportedReasoningEfforts.find(option => option.reasoningEffort === preferred)?.reasoningEffort || model?.defaultReasoningEffort || '';
  controls();
}
$('model').addEventListener('change', () => { localStorage.setItem('model', $('model').value); updateEfforts(); });
$('effort').addEventListener('change', () => localStorage.setItem('effort', $('effort').value));
function closeMenu() { $('appMenu').hidden = true; $('menuButton').setAttribute('aria-expanded', 'false'); }
$('menuButton').addEventListener('click', () => {
  const open = $('appMenu').hidden; $('appMenu').hidden = !open; $('menuButton').setAttribute('aria-expanded', String(open));
});
async function refreshPageAccess() {
  try {
    await globalAccess.reconcile();
    const enabled = await chrome.permissions.contains({ origins: pageOrigins });
    const mode = await globalAccess.mode();
    const { globalAccess: preference } = await chrome.storage.local.get('globalAccess');
    if (mode !== 'off') {
      $('permissionDuration').value = mode;
      $('autoBrowserActions').checked = preference?.autoActions === true;
    }
    $('pageAccessStatus').textContent = enabled ? `Global website access enabled (${mode === 'session' ? 'this session' : 'permanently'})` : 'Global website access is off';
    $('revokePageAccess').disabled = !enabled;
    $('enablePageAccess').disabled = busy;
  } catch {
    $('pageAccessStatus').textContent = 'Could not check website access';
    $('enablePageAccess').disabled = false;
  }
}
$('enablePageAccess').addEventListener('click', async () => {
  // Request synchronously from this explicit click, before any await loses the user gesture.
  $('enablePageAccess').disabled = true;
  const duration = $('permissionDuration').value, autoActions = $('autoBrowserActions').checked;
  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: pageOrigins });
    if (granted) await globalAccess.save(duration, autoActions);
    await refreshPageAccess();
    if (granted) {
      clearError();
      await captureCurrentPage().catch(error => fail(error.message));
    } else $('pageAccessStatus').textContent = 'Access was not granted. Use the toolbar icon on each new site.';
  } catch (error) {
    if (granted) await globalAccess.revoke().catch(() => {});
    $('enablePageAccess').disabled = busy;
    fail(`Could not enable global access. ${error.message}`);
  }
});
$('revokePageAccess').addEventListener('click', async () => {
  try { endBrowser(); await globalAccess.revoke(); await refreshPageAccess(); $('autoBrowserActions').checked = false; await captureCurrentPage().catch(() => {}); }
  catch (error) { fail(`Could not revoke global access. ${error.message}`); }
});
chrome.permissions.onAdded.addListener(refreshPageAccess);
chrome.permissions.onRemoved.addListener(refreshPageAccess);
$('openSettings').addEventListener('click', () => { closeMenu(); $('settingsDialog').showModal(); void refreshPageAccess(); });
$('closeSettings').addEventListener('click', () => $('settingsDialog').close());
document.addEventListener('click', event => { if (!event.target.closest('.chat-header')) closeMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
$('newChat').addEventListener('click', closeMenu);
$('prompt').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('sendForm').requestSubmit(); }
});
chrome.tabs.onActivated.addListener(() => { if (!busy) captureCurrentPage().catch(() => {}); });
chrome.tabs.onUpdated.addListener((_id, change, tab) => { if (tab.active && change.status === 'complete' && !busy) captureCurrentPage().catch(() => {}); });
window.addEventListener('focus', () => { if (!busy) captureCurrentPage().catch(() => {}); });
$('sendForm').addEventListener('submit', async event => {
  event.preventDefault(); if (busy || !connected || !authenticated) return;
  const text = $('prompt').value.trim(); if (!text) return;
  clearError(); setState('Starting');
  try {
    await captureCurrentPage();
    if (!models.length) throw new Error('Reconnect in App settings to load available models.');
    const browserEnabled = $('allowBrowser').checked || (Boolean(page) && await globalAccess.actionsEnabled());
    if (browserEnabled) {
      if (!page) throw new Error('Live browser access needs an HTTP(S) webpage. Open a website or turn off Live browser this turn in App settings.');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const target = await browser.enable(tab);
      $('browserTarget').textContent = target.title;
    }
    if (!current) {
      const result = await request('new', { workspace: $('workspace').value }); current = result.chat; resetMessages();
      $('chatWorkspace').textContent = `Chat workspace: ${current.workspace}`;
    }
    appendMessage('user', text); assistantBody = null; itemId = null;
    const result = await request('send', { id: current.id, text, page, allowEdits: $('allowEdits').checked, allowBrowser: browserEnabled, model: $('model').value, effort: $('effort').value || null });
    $('prompt').value = ''; $('allowEdits').checked = false; $('allowBrowser').checked = false;
    if (['starting', 'running'].includes(result.status)) setState('Running');
    await refreshChats();
  } catch (error) { endBrowser(); setState('Error'); fail(startupError || error.message); }
});
$('stop').addEventListener('click', async () => {
  endBrowser();
  try { await request('stop'); if (busy) setState('Stopping'); } catch (error) { fail(error.message); }
});
captureCurrentPage().catch(() => {});
connect();
