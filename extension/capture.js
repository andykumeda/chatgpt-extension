// Executed for automatic attachment in Chrome's isolated world.
export function capturePage() {
  const text = document.body?.innerText || '';
  const selectedText = window.getSelection()?.toString() || '';
  return {
    url: location.href.slice(0, 8192), title: document.title.slice(0, 1000),
    text: text.slice(0, 40000), selectedText: selectedText.slice(0, 8000),
    truncated: text.length > 40000 || selectedText.length > 8000,
  };
}

export function restrictedPage(value) {
  if (typeof value !== 'string' || !value) return false;
  try {
    const url = new URL(value);
    return !['http:', 'https:'].includes(url.protocol)
      || url.hostname === 'chromewebstore.google.com'
      || (url.hostname === 'chrome.google.com' && /^\/webstore(?:\/|$)/.test(url.pathname));
  } catch { return false; }
}

export async function captureActivePage(api = chrome) {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!Number.isSafeInteger(tab?.id)) throw new Error('No active webpage.');
  // Restricted pages have no attachment; never fall back to another tab or old text.
  if (restrictedPage(tab.url)) return null;
  let frames;
  try {
    frames = await api.scripting.executeScript({ target: { tabId: tab.id }, func: capturePage });
  } catch (error) {
    // Chrome can withhold tab.url even though its scripting error identifies a restricted page.
    if (/Cannot access a chrome:\/\/ URL|Cannot access contents of url ["'](?:chrome|chrome-extension|chrome-search|about):|extensions gallery cannot be scripted/i.test(error.message)) return null;
    throw error;
  }
  const result = frames?.[0]?.result;
  if (!result || typeof result.url !== 'string') throw new Error('Chrome returned no page content.');
  if (restrictedPage(result.url)) return null;
  if (!/^https?:\/\//i.test(result.url)) throw new Error('Only HTTP(S) webpages can be attached.');
  return result;
}
