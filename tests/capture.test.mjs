import test from 'node:test';
import assert from 'node:assert/strict';
import { captureActivePage, restrictedPage } from '../extension/capture.js';
function fixture(url, error) {
  const calls = [];
  const api = { tabs: { query: async () => [{ id: 7, url }] }, scripting: { executeScript: async args => {
    calls.push(args);
    if (error) throw new Error(error);
    return [{ result: { url: 'https://example.com', title: 'Fresh page', text: 'Fresh text' } }];
  } } };
  return { api, calls };
}
test('restricted Chrome tabs and Web Store have no attachment and never run capture', async () => {
  for (const url of ['chrome://extensions', 'chrome://settings', 'chrome://newtab/', 'chrome-search://local-ntp/local-ntp.html', 'about:blank', 'chrome-extension://example/page.html', 'https://chromewebstore.google.com/detail/example', 'https://chrome.google.com/webstore/detail/example']) {
    const { api, calls } = fixture(url);
    assert.equal(await captureActivePage(api), null); assert.equal(calls.length, 0);
  }
  assert.equal(restrictedPage('https://chrome.google.com/help'), false);
  assert.equal(restrictedPage('https://example.com/chrome://settings'), false);
});
test('restricted scripting errors with withheld tab URL allow chat without page context', async () => {
  for (const error of ['Cannot access a chrome:// URL', 'Cannot access contents of url "chrome://newtab/".', 'The extensions gallery cannot be scripted.']) {
    const { api } = fixture(undefined, error); assert.equal(await captureActivePage(api), null);
  }
});
test('website capture failures and missing results remain errors; ordinary pages attach freshly', async () => {
  const { api, calls } = fixture('https://example.com');
  assert.equal((await captureActivePage(api)).text, 'Fresh text');
  assert.deepEqual(calls[0].target, { tabId: 7, allFrames: true });
  await assert.rejects(captureActivePage(fixture(undefined, 'Cannot access contents of url "https://example.com". Extension manifest must request permission to access this host.').api), /request permission/);
  await assert.rejects(captureActivePage(fixture(undefined, 'Cannot access contents of the page. Extension manifest must request permission to access the respective host.').api), /request permission/);
  await assert.rejects(captureActivePage(fixture('https://example.com', 'Access denied').api), /Access denied/);
  api.scripting.executeScript = async () => []; await assert.rejects(captureActivePage(api), /no page content/);
});

test('page capture does not wait for document idle on a still-loading website', async () => {
  const { api } = fixture('https://example.com');
  api.scripting.executeScript = args => args.injectImmediately
    ? Promise.resolve([{ result: { url: 'https://example.com', text: 'Current DOM' } }])
    : new Promise(() => {}); // Chrome's default waits for document idle.
  let timer;
  try {
    const result = await Promise.race([
      captureActivePage(api),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Capture stuck waiting for page load')), 100); }),
    ]);
    assert.equal(result.text, 'Current DOM');
  } finally { clearTimeout(timer); }
});

test('embedded job and Word frame text reaches context without replacing the outer URL', async () => {
  const { api } = fixture('https://example.com');
  api.scripting.executeScript = async args => [
    { frameId: 0, result: { url: 'https://example.com', title: 'Careers', text: 'Company navigation', selectedText: '', embeddedFrames: 1 } },
    ...(args.target.allFrames ? [{ frameId: 4, result: { url: 'https://jobs.example.com/role', title: 'Job', text: 'Field Automation Engineer', selectedText: 'Selected requirements', embeddedFrames: 1 } },
      { frameId: 9, result: { url: 'https://word.example.com/editor', title: 'Word', text: 'Document requirements', selectedText: '', embeddedFrames: 0 } }] : []),
  ];
  const result = await captureActivePage(api);
  assert.equal(result.url, 'https://example.com');
  assert.match(result.text, /Field Automation Engineer/);
  assert.match(result.text, /Document requirements/);
  assert.match(result.text, /https:\/\/jobs.example.com\/role/);
  assert.match(result.selectedText, /Selected requirements/);
});

test('missing embedded frames are explicitly reported in context', async () => {
  const { api } = fixture('https://example.com');
  api.scripting.executeScript = async () => [{ frameId: 0, result: { url: 'https://example.com', title: 'Word', text: 'Word toolbar', selectedText: '', embeddedFrames: 1 } }];
  const result = await captureActivePage(api);
  assert.match(result.captureWarning, /embedded/);
  assert.match(result.text, /global website access/i);
});

test('embedded context keeps bridge size limits and flags truncation', async () => {
  const { api } = fixture('https://example.com');
  api.scripting.executeScript = async () => [
    { frameId: 0, result: { url: 'https://example.com', title: 'Shell', text: 'x'.repeat(40000), selectedText: '', embeddedFrames: 1 } },
    { frameId: 1, result: { url: 'https://example.com/frame', title: 'Document', text: 'Document body', selectedText: 's'.repeat(8000), embeddedFrames: 0, truncated: true } },
  ];
  const result = await captureActivePage(api);
  assert.match(result.text, /Document body/);
  assert.equal(result.text.length, 40000);
  assert.equal(result.selectedText.length, 8000);
  assert.equal(result.truncated, true);
});

test('injected capture identifies Word partial rendering without reading editor internals', async () => {
  const { capturePage } = await import('../extension/capture.js');
  const { runInNewContext } = await import('node:vm');
  const result = runInNewContext(`(${capturePage.toString()})()`, {
    document: { title: 'Word', body: { innerText: 'Visible document page' }, querySelectorAll: () => [{}, {}], getElementById: id => id === 'WACViewPanel' ? {} : null },
    window: { getSelection: () => 'Selected paragraph' }, location: { href: 'https://word.example.com/editor' },
  });
  assert.equal(result.text, 'Visible document page');
  assert.equal(result.embeddedFrames, 2);
  assert.match(result.captureWarning, /only currently rendered/);
  const { api } = fixture('https://example.com');
  api.scripting.executeScript = async () => [
    { result: { url: 'https://example.com', text: '', selectedText: '', embeddedFrames: 1 } },
    { result: { ...result, url: 'https://word.example.com/editor?access_token=DO_NOT_ATTACH#private' } },
  ];
  const page = await captureActivePage(api);
  assert.match(page.text, /only currently rendered/);
  assert.ok(!page.text.includes('DO_NOT_ATTACH'));
  assert.ok(!page.text.includes('#private'));
});
