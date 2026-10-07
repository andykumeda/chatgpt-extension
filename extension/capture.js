// Executed only by the panel's explicit capture command, in Chrome's isolated world.
export function capturePage() {
  const text = document.body?.innerText || '';
  const selectedText = window.getSelection()?.toString() || '';
  return {
    url: location.href.slice(0, 8192), title: document.title.slice(0, 1000),
    text: text.slice(0, 40000), selectedText: selectedText.slice(0, 8000),
    truncated: text.length > 40000 || selectedText.length > 8000,
  };
}
