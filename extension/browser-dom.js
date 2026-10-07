// Executed only in Chrome's isolated world; no arbitrary page-supplied scripts.
export function browserDOM(operation) {
  const sensitive = element => {
    const hint = [element.type, element.name, element.id, element.autocomplete, element.getAttribute('aria-label'), ...Array.from(element.labels || [], label => label.innerText)].join(' ');
    return /password|passcode|one-time|otp|credit.?card|cc-|cvv|cvc|security.?code|secret|api.?key|access.?token|ssn|social.?security/i.test(hint);
  };
  const visible = element => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const state = globalThis.__localCodexBrowserState;
  if (operation.operation === 'read') {
    const snapshot = crypto.randomUUID();
    const refs = new Map();
    const elements = [];
    for (const element of document.querySelectorAll('a[href],button,input,textarea,select,[role="button"],[contenteditable="true"]')) {
      if (!visible(element) || sensitive(element) || element.disabled || ['hidden', 'file'].includes(element.type)) continue;
      const ref = `e${elements.length + 1}`;
      refs.set(ref, { element, signature: element.outerHTML, href: element.href });
      elements.push({ ref, tag: element.tagName.toLowerCase(), type: element.type || '', label: (element.getAttribute('aria-label') || Array.from(element.labels || [], l => l.innerText).join(' ') || element.innerText || element.placeholder || '').slice(0, 200) });
      if (elements.length >= 100) break;
    }
    globalThis.__localCodexBrowserState = { snapshot, refs, url: location.href };
    const text = document.body?.innerText || '';
    return { snapshot, url: location.href, title: document.title.slice(0, 1000), text: text.slice(0, 40000), selectedText: String(getSelection() || '').slice(0, 8000), truncated: text.length > 40000, elements };
  }
  if (!state || state.snapshot !== operation.snapshot || state.url !== location.href) throw new Error('Page changed. Read the page again before acting.');
  if (operation.operation === 'scroll') {
    window.scrollBy({ top: operation.dy, behavior: 'instant' });
    return { scrolled: operation.dy };
  }
  const reference = state.refs.get(operation.ref);
  const element = reference?.element;
  if (!element?.isConnected || !visible(element) || sensitive(element) || element.disabled) throw new Error('Element changed, is unavailable, or is sensitive. Read again.');
  if (element.outerHTML !== reference.signature || element.href !== reference.href) throw new Error('Element content changed since inspection. Read again.');
  if (operation.operation === 'click') {
    const link = element.closest('a[href]');
    if (link && (link.hasAttribute('download') || !/^https?:$/i.test(new URL(link.href).protocol) || new URL(link.href).origin !== location.origin || /\.(zip|dmg|pkg|exe|msi|crx|pdf|csv|xlsx?|docx?|pptx?|tar|gz|7z)$/i.test(new URL(link.href).pathname))) throw new Error('Downloads and cross-origin link clicks are not supported. Use explicit navigation for another website.');
    if (element.tagName === 'INPUT' && ['file', 'password'].includes(element.type)) throw new Error('File and password controls are not supported.');
    // Consume refs before side effects so an uncertain action cannot be replayed.
    globalThis.__localCodexBrowserState = null;
    element.click();
    return { clicked: operation.ref };
  }
  if (operation.operation === 'fill') {
    if (element.readOnly || !['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)) throw new Error('Only ordinary editable input, textarea and select fields are supported.');
    if (element.tagName === 'INPUT' && !['text', 'email', 'search', 'tel', 'url', 'number'].includes(element.type)) throw new Error('This input type is not supported.');
    if (element.tagName === 'SELECT' && !Array.from(element.options).some(option => option.value === operation.text)) throw new Error('Select value is not available.');
    globalThis.__localCodexBrowserState = null;
    const prototype = element.tagName === 'INPUT' ? HTMLInputElement.prototype : element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLSelectElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, operation.text);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { filled: operation.ref };
  }
  throw new Error('Unsupported DOM operation.');
}
