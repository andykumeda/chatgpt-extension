import { capturePage } from './capture.js';
import { LiveBrowser } from './browser.js';

const $ = id => document.getElementById(id);
let port, connected = false, authenticated = false, busy = false, current = null, page = null, nextId = 1;
const pending = new Map();
let assistantBody = null, itemId = null;
const browser = new LiveBrowser();
let browserApproval = null, startupError = null;
function endBrowser() {
  browser.disable();
  browserApproval?.resolve(false); browserApproval = null;
  $('browserApproval').hidden = true; $('browserTarget').textContent = '';
}
function approveBrowser(details) {
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
  $('send').disabled = !connected || !authenticated || busy;
  $('stop').hidden = !busy;
  $('chats').disabled = busy;
  $('newChat').disabled = busy || !connected;
  $('applyWorkspace').disabled = busy;
  $('connect').disabled = busy;
  $('allowBrowser').disabled = busy;
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
function resetMessages() { $('messages').replaceChildren(); assistantBody = null; itemId = null; }
function appendMessage(role, text, attachment) {
  const article = document.createElement('article'); article.className = `message ${role}`;
  const label = document.createElement('div'); label.className = 'role'; label.textContent = role === 'assistant' ? 'Codex' : 'You';
  const body = document.createElement('div'); body.className = 'body'; body.textContent = text;
  article.append(label, body);
  if (attachment) {
    const source = document.createElement('div'); source.className = 'source'; source.textContent = `Attached: ${attachment.title || attachment.url}`; article.append(source);
  }
  $('messages').append(article);
  $('messages').scrollTop = $('messages').scrollHeight;
  return body;
}
async function refreshChats() {
  const { chats } = await request('list');
  $('chats').replaceChildren(new Option('New conversation', ''));
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
    else appendMessage(message.message.role, message.message.text, message.message.page);
    return;
  }
  if (message.chatId !== current?.id) return;
  if (message.event === 'delta') {
    if (!assistantBody) assistantBody = appendMessage('assistant', '', null);
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
  endBrowser(); startupError = null;
  clearError();
  if (port) port.disconnect();
  port = chrome.runtime.connectNative('com.local_codex.sidepanel');
  const thisPort = port;
  $('connection').textContent = 'Connecting';
  port.onMessage.addListener(message => {
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
    port = null; connected = false; authenticated = false;
    endBrowser();
    $('connection').textContent = 'Disconnected'; setState('Interrupted');
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error(error)); }
    pending.clear();
    fail(`${error} Install the native host, then click Connect. Close any other Local Codex panel first.`);
  });
  try {
    const result = await request('hello');
    connected = true; authenticated = result.authenticated;
    $('connection').textContent = authenticated ? `Connected / ${result.authType || 'provider'}` : 'Sign-in required';
    $('workspace').value = result.workspace;
    if (!authenticated) fail('Run codex login in Terminal, finish Codex sign-in, then reconnect.');
    if (current) await resume(current.id); else setState('Ready');
    await refreshChats(); controls();
  } catch (error) { fail(error.message); setState('Error'); }
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
$('attachPage').addEventListener('click', async () => {
  clearError();
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active webpage.');
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: capturePage });
    if (!/^https?:\/\//i.test(result.url)) throw new Error('Only HTTP(S) webpages can be attached.');
    page = result;
    $('pageTitle').textContent = page.title || 'Untitled page'; $('pageUrl').textContent = page.url;
    $('pageSummary').textContent = `${page.text.length.toLocaleString()} characters${page.truncated ? ' (truncated)' : ''}${page.selectedText ? ' / selection included' : ''}`;
    $('pagePreview').textContent = `${page.selectedText ? `Selection:\n${page.selectedText}\n\n` : ''}${page.text}`;
    $('attachment').hidden = false;
  } catch (error) { fail(`Cannot capture this page. Click the Local Codex toolbar icon on the current HTTP(S) tab to grant access, then attach again. Chrome internal pages and the Web Store are restricted. ${error.message}`); }
});
$('removePage').addEventListener('click', () => { page = null; $('attachment').hidden = true; });
$('sendForm').addEventListener('submit', async event => {
  event.preventDefault(); if (busy || !connected || !authenticated) return;
  const text = $('prompt').value.trim(); if (!text) return;
  clearError(); setState('Starting');
  try {
    if ($('allowBrowser').checked) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const target = await browser.enable(tab);
      $('browserTarget').textContent = target.title;
    }
    if (!current) {
      const result = await request('new', { workspace: $('workspace').value }); current = result.chat; resetMessages();
      $('chatWorkspace').textContent = `Chat workspace: ${current.workspace}`;
    }
    appendMessage('user', text, page); assistantBody = null; itemId = null;
    const result = await request('send', { id: current.id, text, page, allowEdits: $('allowEdits').checked, allowBrowser: $('allowBrowser').checked });
    $('prompt').value = ''; $('removePage').click(); $('allowEdits').checked = false; $('allowBrowser').checked = false;
    if (['starting', 'running'].includes(result.status)) setState('Running');
    await refreshChats();
  } catch (error) { endBrowser(); setState('Error'); fail(startupError || error.message); }
});
$('stop').addEventListener('click', async () => {
  endBrowser();
  try { await request('stop'); if (busy) setState('Stopping'); } catch (error) { fail(error.message); }
});
connect();
