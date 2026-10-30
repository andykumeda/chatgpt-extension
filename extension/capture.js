// Executed for automatic attachment in Chrome's isolated world.
export function capturePage() {
  const text = document.body?.innerText || '';
  const selectedText = window.getSelection()?.toString() || '';
  return {
    url: location.href.slice(0, 8192), title: document.title.slice(0, 1000),
    text: text.slice(0, 40000), selectedText: selectedText.slice(0, 8000),
    truncated: text.length > 40000 || selectedText.length > 8000,
    embeddedFrames: document.querySelectorAll('iframe, frame').length,
    captureWarning: document.getElementById('WACViewPanel')
      ? 'Word context includes only currently rendered document pages, not necessarily the entire document. Scroll to the relevant pages and send again, or provide the full document text for a complete review.'
      : '',
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
    // Capture the current DOM even when a site keeps its load event pending.
    frames = await api.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: capturePage, injectImmediately: true });
  } catch (error) {
    // Chrome can withhold tab.url even though its scripting error identifies a restricted page.
    if (/Cannot access a chrome:\/\/ URL|Cannot access contents of url ["'](?:chrome|chrome-extension|chrome-search|about):|extensions gallery cannot be scripted/i.test(error.message)) return null;
    throw error;
  }
  const result = frames?.[0]?.result;
  if (!result || typeof result.url !== 'string') throw new Error('Chrome returned no page content.');
  if (restrictedPage(result.url)) return null;
  if (!/^https?:\/\//i.test(result.url)) throw new Error('Only HTTP(S) webpages can be attached.');
  const captured = frames.map(frame => frame.result).filter(frame => frame && typeof frame.url === 'string');
  const missingFrames = captured.reduce((count, frame) => count + (frame.embeddedFrames || 0), 0) > captured.length - 1;
  const accessWarning = missingFrames
    ? 'Some embedded content is unavailable. Enable global website access in App settings → Page context to include embedded websites, then send again. If a document viewer still exposes no text, use its accessible reading view or paste the document text.'
    : '';
  const captureWarning = [...new Set([accessWarning, ...captured.map(frame => frame.captureWarning)].filter(Boolean))].join(' ');
  // Put embedded documents before navigation so a long outer page cannot crowd them out.
  const embedded = captured.slice(1).filter(frame => /^(https?:\/\/|about:(blank|srcdoc)$)/i.test(frame.url));
  const text = [captureWarning, ...embedded.filter(frame => frame.text).map(frame => {
    const url = new URL(frame.url);
    return `Embedded page: ${frame.title || ''}\n${url.origin}${url.pathname}\n${frame.text}`;
  }), result.text].filter(Boolean).join('\n\n');
  const selectedText = [result.selectedText, ...embedded.map(frame => frame.selectedText)].filter(Boolean).join('\n\n');
  return {
    ...result, text: text.slice(0, 40000), selectedText: selectedText.slice(0, 8000), captureWarning,
    truncated: captured.some(frame => frame.truncated) || text.length > 40000 || selectedText.length > 8000,
  };
}
