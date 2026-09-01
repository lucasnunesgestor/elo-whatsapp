(function () {
  const app = document.getElementById('app');

  const state = {
    view: 'boot', // boot | login | list | form
    clients: [],
    presets: null,
    providerKeys: [],
    editing: null, // registro completo em edição, ou null pra criação
    loginError: '',
    formError: '',
    testing: false,
    testResult: null,
    justCreatedLink: null,
  };

  const STATUS_LABEL = { pending: 'Aguardando', connected: 'Conectado', disabled: 'Desativado' };

  async function api(path, options) {
    const res = await fetch(path, {
      method: (options && options.method) || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: options && options.body ? JSON.stringify(options.body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* sem corpo */ }
    return { res, data };
  }

  // --- boot / auth ----------------------------------------------------------

  async function boot() {
    const { res } = await api('/admin/api/me');
    if (res.status === 401) {
      state.view = 'login';
      render();
      return;
    }
    await loadPresets();
    await loadClients();
    state.view = 'list';
    render();
  }

  async function loadPresets() {
    const { data } = await api('/admin/api/presets');
    if (data.ok) { state.presets = data.presets; state.providerKeys = data.providerKeys; }
  }

  async function loadClients() {
    const { data } = await api('/admin/api/clients');
    if (data.ok) state.clients = data.clients;
  }

  async function handleLogin(password) {
    state.loginError = '';
    const { res, data } = await api('/admin/api/login', { method: 'POST', body: { password } });
    if (!data.ok) {
      state.loginError = data.error || 'Não foi possível entrar.';
      render();
      return;
    }
    await loadPresets();
    await loadClients();
    state.view = 'list';
    render();
  }

  async function handleLogout() {
    await api('/admin/api/logout', { method: 'POST' });
    state.view = 'login';
    state.clients = [];
    render();
  }

  // --- render root ------------------------------------------------------------

  function render() {
    if (state.view === 'boot') { app.innerHTML = ''; return; }
    if (state.view === 'login') return renderLogin();
    return renderShell();
  }

  function renderLogin() {
    app.innerHTML = `
      <div class="login-wrap">
        <form class="login-card" id="loginForm">
          <div class="brand"><span class="mark">E</span> ELO WHATSAPP</div>
          <div>
            <h1>Entrar no painel</h1>
            <p class="sub">Acesso restrito. Só quem sabe a senha do admin cadastra e gerencia links de cliente.</p>
          </div>
          ${state.loginError ? `<div class="banner err">${escapeHtml(state.loginError)}</div>` : ''}
          <div class="field">
            <label for="password">Senha</label>
            <input type="password" id="password" autocomplete="current-password" autofocus>
          </div>
          <button type="submit" class="btn-primary">Entrar</button>
        </form>
      </div>
    `;
    app.querySelector('#loginForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const password = app.querySelector('#password').value;
      handleLogin(password);
    });
  }

  function renderShell() {
    app.innerHTML = `
      <div class="topbar">
        <div class="brand"><span class="mark">E</span> ELO WHATSAPP</div>
        <button class="btn-ghost btn-sm" id="logoutBtn">Sair</button>
      </div>
      <div class="shell" id="shell"></div>
    `;
    app.querySelector('#logoutBtn').addEventListener('click', handleLogout);
    const shell = app.querySelector('#shell');
    if (state.view === 'list') renderList(shell);
    if (state.view === 'form') renderForm(shell);
  }

  // --- lista de clientes -----------------------------------------------------

  function renderList(container) {
    const rows = state.clients.map((c) => `
      <tr>
        <td>${escapeHtml(c.name)}</td>
        <td class="mono">${labelForProvider(c.provider)}</td>
        <td><span class="pill ${c.status}"><span class="dot"></span>${STATUS_LABEL[c.status] || c.status}</span></td>
        <td>
          <div class="row">
            <button class="btn-secondary btn-sm" data-action="copy" data-slug="${c.slug}">Copiar link</button>
            <button class="btn-ghost btn-sm" data-action="edit" data-id="${c.id}">Editar</button>
            ${c.status !== 'pending' ? `<button class="btn-ghost btn-sm" data-action="reactivate" data-id="${c.id}">Reativar</button>` : ''}
            ${c.status === 'pending' ? `<button class="btn-ghost btn-sm" data-action="disable" data-id="${c.id}">Desativar</button>` : ''}
            <button class="btn-danger btn-sm" data-action="delete" data-id="${c.id}">Excluir</button>
          </div>
        </td>
      </tr>
    `).join('');

    container.innerHTML = `
      <div class="row between">
        <div>
          <h1>Clientes</h1>
          <p class="sub">Cada cliente tem uma instância e um link público próprio.</p>
        </div>
        <button class="btn-primary" id="newBtn">Novo cliente</button>
      </div>
      <div class="card">
        ${state.clients.length === 0
          ? `<div class="empty">Nenhum cliente cadastrado ainda. Clique em "Novo cliente" pra começar.</div>`
          : `<div class="table-wrap"><table>
              <thead><tr><th>Nome</th><th>Provedor</th><th>Status</th><th>Ações</th></tr></thead>
              <tbody>${rows}</tbody>
            </table></div>`
        }
      </div>
    `;

    container.querySelector('#newBtn').addEventListener('click', () => {
      state.editing = null;
      state.testResult = null;
      state.formError = '';
      state.justCreatedLink = null;
      state.view = 'form';
      render();
    });

    container.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => onListAction(btn.dataset.action, btn.dataset));
    });
  }

  async function onListAction(action, dataset) {
    if (action === 'copy') {
      const link = `${location.origin}/c/${dataset.slug}`;
      copyToClipboard(link);
      return;
    }
    if (action === 'edit') {
      const { data } = await api(`/admin/api/clients/${dataset.id}`);
      if (data.ok) {
        state.editing = data.client;
        state.testResult = null;
        state.formError = '';
        state.justCreatedLink = null;
        state.view = 'form';
        render();
      }
      return;
    }
    if (action === 'reactivate') {
      await api(`/admin/api/clients/${dataset.id}/reactivate`, { method: 'POST' });
      await loadClients();
      render();
      return;
    }
    if (action === 'disable') {
      await api(`/admin/api/clients/${dataset.id}/disable`, { method: 'POST' });
      await loadClients();
      render();
      return;
    }
    if (action === 'delete') {
      if (!confirm('Excluir este cliente? O link público para de funcionar imediatamente.')) return;
      await api(`/admin/api/clients/${dataset.id}`, { method: 'DELETE' });
      await loadClients();
      render();
      return;
    }
  }

  function labelForProvider(key) {
    return (state.presets && state.presets[key] && state.presets[key].label) || key;
  }

  // --- formulário de cliente ---------------------------------------------------

  function renderForm(container) {
    const c = state.editing || {};
    const provider = c.provider || 'uazapi';
    const preset = (state.presets && state.presets[provider]) || {};

    const val = (field, fallback) => (c[field] !== undefined && c[field] !== '' ? c[field] : (fallback !== undefined ? fallback : ''));

    container.innerHTML = `
      <div class="row between">
        <div>
          <h1>${state.editing ? 'Editar cliente' : 'Novo cliente'}</h1>
          <p class="sub">Confira com "Testar conexão" antes de gerar o link. Trocar o provedor reescreve os campos de endpoint abaixo com o preset dele.</p>
        </div>
        <button class="btn-ghost" id="backBtn">Voltar</button>
      </div>

      ${state.formError ? `<div class="banner err">${escapeHtml(state.formError)}</div>` : ''}
      ${state.justCreatedLink ? `
        <div class="card">
          <h2>Link do cliente</h2>
          <p class="sub" style="margin:8px 0 12px">Envie esse link pra ele. Nenhum token aparece nele, e ele não vê o painel admin.</p>
          <div class="link-row">
            <input type="text" id="createdLink" readonly value="${state.justCreatedLink}">
            <button class="btn-secondary" id="copyCreatedBtn">Copiar</button>
          </div>
        </div>
      ` : ''}

      <form class="card" id="clientForm">
        <div class="form-grid">
          <div class="section-title span-2">Identificação</div>
          <div class="field">
            <label for="f-name">Nome do cliente</label>
            <input type="text" id="f-name" value="${escapeAttr(val('name'))}" placeholder="Ex: Clínica Aurora" required>
          </div>
          <div class="field">
            <label for="f-provider">Provedor</label>
            <select id="f-provider">
              ${state.providerKeys.map((k) => `<option value="${k}" ${k === provider ? 'selected' : ''}>${state.presets[k].label}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="f-baseUrl">URL do servidor</label>
            <input type="url" id="f-baseUrl" value="${escapeAttr(val('baseUrl'))}" placeholder="https://sua-instancia.exemplo.com" required>
          </div>
          <div class="field">
            <label for="f-token">Token da instância</label>
            <input type="text" id="f-token" value="${escapeAttr(val('token'))}" placeholder="token gerado pelo provedor" required>
          </div>
          <div class="field span-2">
            <label for="f-instanceName">Nome da instância <span style="text-transform:none;font-weight:400">(exigido pela Evolution API, entra no lugar de {instance} nos paths)</span></label>
            <input type="text" id="f-instanceName" value="${escapeAttr(val('instanceName'))}" placeholder="opcional para UazAPI/Wuzapi">
          </div>

          <div class="section-title span-2">Endpoints</div>
          <div class="field">
            <label for="f-connectMethod">Conectar / gerar QR</label>
            <div class="method-pair">
              <select id="f-connectMethod">
                <option value="GET" ${val('connectMethod', preset.connectMethod) === 'GET' ? 'selected' : ''}>GET</option>
                <option value="POST" ${val('connectMethod', preset.connectMethod) === 'POST' ? 'selected' : ''}>POST</option>
              </select>
              <input type="text" id="f-connectPath" value="${escapeAttr(val('connectPath', preset.connectPath))}" placeholder="/instance/connect">
            </div>
          </div>
          <div class="field">
            <label for="f-statusMethod">Status da conexão</label>
            <div class="method-pair">
              <select id="f-statusMethod">
                <option value="GET" ${val('statusMethod', preset.statusMethod) === 'GET' ? 'selected' : ''}>GET</option>
                <option value="POST" ${val('statusMethod', preset.statusMethod) === 'POST' ? 'selected' : ''}>POST</option>
              </select>
              <input type="text" id="f-statusPath" value="${escapeAttr(val('statusPath', preset.statusPath))}" placeholder="/instance/status">
            </div>
          </div>

          <div class="section-title span-2">Autenticação</div>
          <div class="field">
            <label for="f-authHeader">Nome do header</label>
            <input type="text" id="f-authHeader" value="${escapeAttr(val('authHeader', preset.authHeader))}" placeholder="token">
          </div>
          <div class="field">
            <label for="f-authPrefix">Prefixo do valor <span style="text-transform:none;font-weight:400">(opcional, ex: "Bearer ")</span></label>
            <input type="text" id="f-authPrefix" value="${escapeAttr(val('authPrefix', preset.authPrefix))}" placeholder="">
          </div>

          <div class="section-title span-2">Mapeamento da resposta (JSON)</div>
          <div class="field">
            <label for="f-qrJsonPath">Caminho do QR code</label>
            <input type="text" id="f-qrJsonPath" value="${escapeAttr(val('qrJsonPath', preset.qrJsonPath))}" placeholder="instance.qrcode">
            <p class="field-hint">Caminho dentro do JSON de resposta do endpoint de conectar. Ex: "instance.qrcode" lê data.instance.qrcode.</p>
          </div>
          <div class="field">
            <label for="f-statusJsonPath">Caminho do status</label>
            <input type="text" id="f-statusJsonPath" value="${escapeAttr(val('statusJsonPath', preset.statusJsonPath))}" placeholder="instance.status">
          </div>
          <div class="field span-2">
            <label for="f-connectedValue">Valor que significa "conectado"</label>
            <input type="text" id="f-connectedValue" value="${escapeAttr(val('connectedValue', preset.connectedValue))}" placeholder="connected">
            <p class="field-hint">Comparado (sem diferenciar maiúsculas) com o valor lido no caminho de status acima. Para campos booleanos, use "true".</p>
          </div>

          <div class="section-title span-2">Headers extras <span style="text-transform:none;font-weight:400">(opcional)</span></div>
          <div class="field span-2">
            <label for="f-extraHeaders">JSON de headers adicionais</label>
            <textarea id="f-extraHeaders" placeholder='{"X-Algo": "valor"}'>${escapeHtml(JSON.stringify(val('extraHeaders', {}) || {}, null, 2))}</textarea>
          </div>
        </div>

        <div class="row" style="margin-top:18px">
          <button type="button" class="btn-secondary" id="testBtn" ${state.testing ? 'disabled' : ''}>${state.testing ? 'Testando…' : 'Testar conexão'}</button>
          <button type="submit" class="btn-primary">${state.editing ? 'Salvar alterações' : 'Salvar e gerar link'}</button>
        </div>
      </form>

      ${state.testResult ? renderTestResult(state.testResult) : ''}
    `;

    container.querySelector('#backBtn').addEventListener('click', () => {
      state.view = 'list';
      render();
    });

    container.querySelector('#f-provider').addEventListener('change', (e) => {
      const key = e.target.value;
      const p = state.presets[key];
      state.editing = {
        ...(state.editing || {}),
        provider: key,
        connectPath: p.connectPath,
        connectMethod: p.connectMethod,
        statusPath: p.statusPath,
        statusMethod: p.statusMethod,
        authHeader: p.authHeader,
        authPrefix: p.authPrefix,
        qrJsonPath: p.qrJsonPath,
        statusJsonPath: p.statusJsonPath,
        connectedValue: p.connectedValue,
      };
      render();
    });

    container.querySelector('#testBtn').addEventListener('click', () => runTest(container));
    container.querySelector('#clientForm').addEventListener('submit', (e) => {
      e.preventDefault();
      saveClient(container);
    });

    const copyCreatedBtn = container.querySelector('#copyCreatedBtn');
    if (copyCreatedBtn) {
      copyCreatedBtn.addEventListener('click', () => copyToClipboard(state.justCreatedLink));
    }
  }

  function readFormValues(container) {
    let extraHeaders = {};
    const rawExtra = container.querySelector('#f-extraHeaders').value.trim();
    if (rawExtra) {
      try { extraHeaders = JSON.parse(rawExtra); } catch (e) { throw new Error('Headers extras precisam ser um JSON válido.'); }
    }
    return {
      name: container.querySelector('#f-name').value.trim(),
      provider: container.querySelector('#f-provider').value,
      baseUrl: container.querySelector('#f-baseUrl').value.trim(),
      token: container.querySelector('#f-token').value.trim(),
      instanceName: container.querySelector('#f-instanceName').value.trim(),
      connectPath: container.querySelector('#f-connectPath').value.trim(),
      connectMethod: container.querySelector('#f-connectMethod').value,
      statusPath: container.querySelector('#f-statusPath').value.trim(),
      statusMethod: container.querySelector('#f-statusMethod').value,
      authHeader: container.querySelector('#f-authHeader').value.trim(),
      authPrefix: container.querySelector('#f-authPrefix').value,
      qrJsonPath: container.querySelector('#f-qrJsonPath').value.trim(),
      statusJsonPath: container.querySelector('#f-statusJsonPath').value.trim(),
      connectedValue: container.querySelector('#f-connectedValue').value.trim(),
      extraHeaders,
    };
  }

  async function runTest(container) {
    state.formError = '';
    let values;
    try {
      values = readFormValues(container);
    } catch (e) {
      state.formError = e.message;
      render();
      return;
    }
    if (state.editing && state.editing.id) values.clientId = state.editing.id;

    state.testing = true;
    render();
    const { data } = await api('/admin/api/test-connection', { method: 'POST', body: values });
    state.testing = false;
    state.testResult = data.ok ? data.debug : { error: data.error || 'Falha ao testar.' };
    render();
  }

  function renderTestResult(result) {
    if (result.error) {
      return `<div class="banner err" style="margin-top:16px">${escapeHtml(result.error)}</div>`;
    }
    const connectOk = result.connect && !result.connect.error;
    const statusOk = result.status && !result.status.error;
    const qrFound = connectOk && result.connect.qrFound;
    const wouldConnect = statusOk && result.status.wouldBeConnected;

    return `
      <div class="card" style="margin-top:16px">
        <h2>Resultado do teste</h2>
        <div class="test-summary">
          <span class="pill ${qrFound ? 'connected' : 'disabled'}"><span class="dot"></span>QR encontrado: ${qrFound ? 'sim' : 'não'}</span>
          <span class="pill ${wouldConnect ? 'connected' : 'disabled'}"><span class="dot"></span>Status leria como conectado: ${wouldConnect ? 'sim' : 'não'}</span>
        </div>
        <details class="debug" style="margin-top:14px" open>
          <summary>Resposta bruta — conectar</summary>
          <pre>${escapeHtml(JSON.stringify(result.connect, null, 2))}</pre>
        </details>
        <details class="debug" style="margin-top:10px">
          <summary>Resposta bruta — status</summary>
          <pre>${escapeHtml(JSON.stringify(result.status, null, 2))}</pre>
        </details>
      </div>
    `;
  }

  async function saveClient(container) {
    state.formError = '';
    let values;
    try {
      values = readFormValues(container);
    } catch (e) {
      state.formError = e.message;
      render();
      return;
    }

    const isEdit = Boolean(state.editing && state.editing.id);
    const { data } = await api(
      isEdit ? `/admin/api/clients/${state.editing.id}` : '/admin/api/clients',
      { method: isEdit ? 'PATCH' : 'POST', body: values }
    );

    if (!data.ok) {
      state.formError = data.error || 'Não foi possível salvar.';
      render();
      return;
    }

    await loadClients();
    state.editing = data.client;
    state.testResult = null;
    if (!isEdit) {
      state.justCreatedLink = `${location.origin}/c/${data.client.slug}`;
    }
    render();
  }

  // --- utilidades -----------------------------------------------------------

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }
  function escapeAttr(str) { return escapeHtml(str); }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
  }

  boot();
})();
