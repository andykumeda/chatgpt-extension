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
  assert.deepEqual(calls[0].target, { tabId: 7 });
  await assert.rejects(captureActivePage(fixture(undefined, 'Cannot access contents of url "https://example.com". Extension manifest must request permission to access this host.').api), /request permission/);
  await assert.rejects(captureActivePage(fixture(undefined, 'Cannot access contents of the page. Extension manifest must request permission to access the respective host.').api), /request permission/);
  await assert.rejects(captureActivePage(fixture('https://example.com', 'Access denied').api), /Access denied/);
  api.scripting.executeScript = async () => []; await assert.rejects(captureActivePage(api), /no page content/);
});
