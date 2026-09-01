(function () {
  const QR_REFRESH_MS = 28000;
  const STATUS_POLL_MS = 3000;

  const app = document.getElementById('app');
  const slug = location.pathname.replace(/^\/c\//, '').replace(/\/$/, '');

  let stopped = false;
  let qrTimer = null;
  let statusTimer = null;
  let secsTimer = null;

  function setInnerHTML(html) {
    app.innerHTML = html;
  }

  function renderShell(statusPillHtml, stageHtml, showSteps) {
    setInnerHTML(`
      <div id="statusRow">${statusPillHtml}</div>
      <div id="stage">${stageHtml}</div>
      ${showSteps ? `
      <ol class="steps">
        <li><span class="n">1</span><span>No celular, abra o <b>WhatsApp</b> e toque em <b>Mais opções</b> (ou Ajustes).</span></li>
        <li><span class="n">2</span><span>Toque em <b>Aparelhos conectados</b> e depois em <b>Conectar um aparelho</b>.</span></li>
        <li><span class="n">3</span><span>Aponte a câmera para o QR code acima. Ele se renova sozinho, não recarregue a página.</span></li>
      </ol>` : ''}
      <footer class="note">Esta página mostra só o status da conexão.</footer>
    `);
  }

  function statusPill(kind, label) {
    return `<span class="status-pill ${kind}"><span class="dot"></span>${label}</span>`;
  }

  function renderInvalid() {
    setInnerHTML(`
      <div class="notice-box err">Este link não existe mais ou nunca existiu. Peça um novo link.</div>
    `);
  }

  function renderLoading() {
    renderShell(statusPill('waiting', 'Carregando'), `
      <div class="qr-frame"><div class="spinner" role="status" aria-label="Carregando"></div></div>
    `, false);
  }

  function renderQr(dataUri) {
    renderShell(statusPill('waiting', 'Aguardando leitura'), `
      <div class="qr-frame"><img src="${dataUri}" alt="QR code para conectar o WhatsApp"></div>
      <div class="refresh-bar" style="margin-top:12px"><div class="refresh-bar-fill" id="fill"></div></div>
      <div class="refresh-label"><span>Renovando sozinho</span><span id="secs">${Math.round(QR_REFRESH_MS / 1000)}s</span></div>
    `, true);
    animateRefreshBar();
  }

  function renderRetrying() {
    renderShell(statusPill('waiting', 'Aguardando servidor'), `
      <div class="qr-frame"><div class="spinner" role="status" aria-label="Tentando novamente"></div></div>
      <div class="notice-box" style="margin-top:12px">Não foi possível carregar o QR code agora. Tentando de novo automaticamente.</div>
    `, true);
  }

  function renderConnected() {
    stopAllTimers();
    setInnerHTML(`
      <div id="statusRow">${statusPill('ok', 'Conectado')}</div>
      <div class="success">
        <div class="badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        </div>
        <div>
          <h1>WhatsApp conectado</h1>
          <p class="sub" style="margin-top:6px">Tudo pronto, este aparelho já está vinculado.</p>
        </div>
      </div>
    `);
  }

  function renderDisabled() {
    stopAllTimers();
    setInnerHTML(`
      <div id="statusRow">${statusPill('waiting', 'Link desativado')}</div>
      <div class="notice-box" style="margin-top:4px">Este link foi desativado. Fale com quem te enviou pra receber um novo.</div>
    `);
  }

  function animateRefreshBar() {
    const fill = app.querySelector('#fill');
    const secsEl = app.querySelector('#secs');
    if (!fill) return;
    fill.style.transition = 'none';
    fill.style.transform = 'scaleX(1)';
    void fill.offsetWidth;
    fill.style.transition = `transform ${QR_REFRESH_MS}ms linear`;
    fill.style.transform = 'scaleX(0)';

    let remaining = Math.round(QR_REFRESH_MS / 1000);
    if (secsTimer) clearInterval(secsTimer);
    secsTimer = setInterval(() => {
      remaining -= 1;
      if (secsEl) secsEl.textContent = Math.max(remaining, 0) + 's';
      if (remaining <= 0) clearInterval(secsTimer);
    }, 1000);
  }

  function stopAllTimers() {
    stopped = true;
    if (qrTimer) clearInterval(qrTimer);
    if (statusTimer) clearInterval(statusTimer);
    if (secsTimer) clearInterval(secsTimer);
  }

  async function fetchJson(path) {
    const res = await fetch(path, { headers: { Accept: 'application/json' } });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  async function loadQr() {
    if (stopped) return;
    const { res, data } = await fetchJson(`/c/${encodeURIComponent(slug)}/qr`);
    if (res.status === 404) { stopAllTimers(); renderInvalid(); return; }
    if (!data.ok) { renderRetrying(); return; }

    if (data.status === 'connected') { renderConnected(); return; }
    if (data.status === 'disabled') { renderDisabled(); return; }
    if (data.qr) { renderQr(data.qr); return; }
    renderRetrying();
  }

  async function checkStatus() {
    if (stopped) return;
    const { res, data } = await fetchJson(`/c/${encodeURIComponent(slug)}/status`);
    if (res.status === 404) { stopAllTimers(); renderInvalid(); return; }
    if (!data.ok) return; // silencioso, próximo poll tenta de novo
    if (data.status === 'connected') renderConnected();
    if (data.status === 'disabled') renderDisabled();
  }

  if (!slug) {
    renderInvalid();
    return;
  }

  renderLoading();
  checkStatus().then(() => {
    if (stopped) return;
    loadQr();
    qrTimer = setInterval(loadQr, QR_REFRESH_MS);
    statusTimer = setInterval(checkStatus, STATUS_POLL_MS);
  });
})();
