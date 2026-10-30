export function setupCapabilities({ request, workspace, fail }) {
  const $ = id => document.getElementById(id);
  let items = [], selected = new Map(), prompts = [], activePrompt = null, version = 0;
  const summary = () => { $('selectedCapabilities').textContent = [...selected.values()].map(item => item.label).join(', '); };
  function render() {
    const query = $('capabilitySearch').value.toLocaleLowerCase();
    $('capabilitiesList').replaceChildren();
    for (const item of items.filter(item => `${item.label} ${item.name} ${item.description} ${item.kind}`.toLocaleLowerCase().includes(query))) {
      const label = document.createElement('label'); label.className = 'toggle';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = selected.has(item.path); checkbox.disabled = !item.enabled;
      checkbox.addEventListener('change', () => {
        if (checkbox.checked && selected.size >= 20) { checkbox.checked = false; fail('Choose at most 20 tools per message.'); return; }
        if (checkbox.checked) selected.set(item.path, item); else selected.delete(item.path);
        summary();
      });
      const text = document.createElement('span'); text.textContent = `${item.label} (${item.kind}${item.enabled ? '' : ', disabled in Codex'}) — ${item.description}`;
      label.append(checkbox, text); $('capabilitiesList').append(label);
    }
  }
  async function load() {
    const generation = ++version;
    $('capabilitiesStatus').textContent = 'Loading from Codex…'; $('refreshCapabilities').disabled = true;
    try {
      const catalog = await request('capabilities', workspace());
      if (generation !== version) return;
      items = catalog.items;
      for (const path of selected.keys()) if (!items.some(item => item.path === path && item.enabled)) selected.delete(path);
      summary();
      $('capabilitiesStatus').textContent = [`${items.length} installed plugins, apps and skills.`, ...catalog.warnings].join(' ');
      render();
    } catch (error) { if (generation === version) { items = []; render(); $('capabilitiesStatus').textContent = error.message; } }
    finally { if (generation === version) $('refreshCapabilities').disabled = false; }
  }
  $('openCapabilities').addEventListener('click', () => { $('capabilitiesDialog').showModal(); void load(); });
  $('closeCapabilities').addEventListener('click', () => $('capabilitiesDialog').close());
  $('refreshCapabilities').addEventListener('click', load);
  $('capabilitySearch').addEventListener('input', render);

  function nextPrompt() {
    if (activePrompt || !prompts.length) return;
    activePrompt = prompts.shift();
    const { prompt } = activePrompt;
    $('settingsDialog').close(); $('capabilitiesDialog').close();
    $('toolPromptError').textContent = '';
    const fields = $('toolPromptFields'); fields.replaceChildren();
    if (prompt.mode === 'questions') for (const question of prompt.questions) {
      const label = document.createElement('label'); label.textContent = question.question;
      const input = document.createElement('input'); input.name = question.id; input.maxLength = 4000;
      const list = document.createElement('datalist'); list.id = `tool-options-${fields.children.length}`;
      for (const option of question.options || []) { const value = document.createElement('option'); value.value = option.label; value.label = option.description || option.label; list.append(value); }
      input.setAttribute('list', list.id); label.append(input, list); fields.append(label);
    } else {
      const message = document.createElement('p'); message.textContent = `${prompt.serverName}: ${prompt.message}`; fields.append(message);
      if (prompt.mode === 'url') {
        try {
          const url = new URL(prompt.url);
          if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
          const link = document.createElement('a'); link.href = url.href; link.textContent = `Open ${url.origin} to complete this request`; link.target = '_blank'; link.rel = 'noopener noreferrer'; fields.append(link);
        } catch { const warning = document.createElement('p'); warning.textContent = 'Unsupported authentication URL. Complete sign-in in Codex.'; fields.append(warning); }
      } else {
        const schema = document.createElement('pre'); schema.textContent = JSON.stringify(prompt.schema, null, 2); fields.append(schema);
        const label = document.createElement('label'); label.textContent = 'Form response (JSON object matching the schema above)';
        const input = document.createElement('textarea'); input.name = 'content'; input.value = '{}'; input.maxLength = 16000; label.append(input); fields.append(label);
      }
      const select = document.createElement('select'); select.name = 'action'; select.setAttribute('aria-label', 'Tool request decision');
      for (const value of ['decline', 'accept', 'cancel']) select.append(new Option(value, value));
      fields.append(select);
    }
    $('toolPromptDialog').showModal();
  }
  async function answer(cancel = false) {
    if (!activePrompt) return;
    const message = activePrompt;
    try {
      const data = new FormData($('toolPromptForm'));
      const result = { requestId: message.requestId };
      if (message.prompt.mode === 'questions') result.answers = Object.fromEntries(message.prompt.questions.map(question => [question.id, { answers: cancel ? [] : [String(data.get(question.id) || '')] }]));
      else {
        result.action = cancel ? 'cancel' : data.get('action');
        result.content = result.action === 'accept' && message.prompt.mode !== 'url' ? JSON.parse(data.get('content')) : null;
      }
      await request('toolPromptResult', result);
      if (activePrompt === message) { activePrompt = null; $('toolPromptDialog').close(); nextPrompt(); }
    } catch (error) { $('toolPromptError').textContent = error.message; }
  }
  $('toolPromptForm').addEventListener('submit', event => { event.preventDefault(); void answer(); });
  $('stopToolPrompt').addEventListener('click', () => $('stop').click());
  $('cancelToolPrompt').addEventListener('click', () => { void answer(true); });
  $('toolPromptDialog').addEventListener('cancel', event => { event.preventDefault(); void answer(true); });
  return {
    selected: () => [...selected.keys()],
    clear: () => { selected.clear(); summary(); },
    prompt: message => { prompts.push(message); nextPrompt(); },
    cancelPrompt: () => { prompts = []; activePrompt = null; $('toolPromptDialog').close(); },
  };
}
