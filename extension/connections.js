// One native process owns persistence; panel ports carry independent session IDs.
export function registerPanels(api, makeId = () => crypto.randomUUID()) {
  const panels = new Map();
  let native = null;
  const deliver = (panel, message) => { try { panel.postMessage(message); } catch {} };
  function disconnectPanels(message) {
    for (const panel of [...panels.values()]) {
      deliver(panel, message); panel.disconnect();
    }
    panels.clear();
  }
  function host() {
    if (native) return native;
    const connection = api.runtime.connectNative('com.local_codex.sidepanel');
    native = connection;
    connection.onMessage.addListener(message => {
      if (native !== connection) return;
      const { sessionId, ...payload } = message;
      if (sessionId) {
        const panel = panels.get(sessionId);
        if (panel) deliver(panel, payload);
      } else {
        const error = message.event === 'fatal' ? message.message : 'This bridge does not support multiple panels. Close all Local Codex panels, update the native bridge, and reload the extension.';
        native = null;
        disconnectPanels({ event: 'fatal', message: error });
        connection.disconnect();
      }
    });
    connection.onDisconnect.addListener(() => {
      const error = api.runtime.lastError?.message || 'Native bridge disconnected. Reconnect to resume your chat.';
      if (native !== connection) return;
      native = null;
      disconnectPanels({ event: 'connection', message: error });
    });
    return connection;
  }
  api.runtime.onConnect.addListener(panel => {
    if (panel.name !== 'local-codex-panel' || panel.sender?.id !== api.runtime.id
      || panel.sender?.url !== api.runtime.getURL('panel.html')) { panel.disconnect(); return; }
    const sessionId = makeId();
    panels.set(sessionId, panel);
    panel.onMessage.addListener(message => {
      if (!panels.has(sessionId) || !message || !Number.isSafeInteger(message.id) || typeof message.method !== 'string' || message.method === 'session/close') return;
      try { host().postMessage({ id: message.id, method: message.method, params: message.params, sessionId }); }
      catch { deliver(panel, { id: message.id, error: 'Cannot connect to the native bridge. Reconnect after checking its installation.' }); }
    });
    panel.onDisconnect.addListener(() => {
      if (!panels.delete(sessionId) || !native) return;
      if (panels.size) native.postMessage({ id: 0, method: 'session/close', sessionId });
      else { const connection = native; native = null; connection.disconnect(); }
    });
  });
}
