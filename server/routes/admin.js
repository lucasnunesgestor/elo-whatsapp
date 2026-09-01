const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { PRESETS, PROVIDER_KEYS } = require('../providers');
const { generateSlug } = require('../lib/slug');
const { callProvider } = require('../lib/httpClient');
const { getByPath } = require('../lib/jsonPath');
const { resolvePath } = require('../lib/util');
const { isConnectedValue } = require('../providers');
const {
  createSession,
  destroySession,
  checkPassword,
  requireAuth,
  cookieOptions,
  COOKIE_NAME,
} = require('../auth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Muitas tentativas. Aguarde alguns minutos.' },
});

const REQUIRED_FIELDS = [
  'name', 'provider', 'baseUrl', 'token',
  'connectPath', 'connectMethod', 'statusPath', 'statusMethod',
  'authHeader', 'qrJsonPath', 'statusJsonPath', 'connectedValue',
];

function toPublicListItem(row) {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    slug: row.slug,
    status: row.status,
    tokenMasked: row.token ? `••••${row.token.slice(-4)}` : '',
    lastError: row.last_error,
    lastErrorAt: row.last_error_at,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

function toFullRecord(row) {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    baseUrl: row.base_url,
    token: row.token,
    instanceName: row.instance_name,
    connectPath: row.connect_path,
    connectMethod: row.connect_method,
    statusPath: row.status_path,
    statusMethod: row.status_method,
    authHeader: row.auth_header,
    authPrefix: row.auth_prefix,
    qrJsonPath: row.qr_json_path,
    statusJsonPath: row.status_json_path,
    connectedValue: row.connected_value,
    extraHeaders: JSON.parse(row.extra_headers || '{}'),
    slug: row.slug,
    status: row.status,
    lastError: row.last_error,
    lastErrorAt: row.last_error_at,
    lastTestedAt: row.last_tested_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// --- auth ---------------------------------------------------------------

router.post('/login', loginLimiter, (req, res) => {
  const { password } = req.body || {};
  if (!checkPassword(password)) {
    return res.status(401).json({ ok: false, error: 'Senha incorreta.' });
  }
  const { token, expires } = createSession();
  res.cookie(COOKIE_NAME, token, cookieOptions());
  res.json({ ok: true, expiresAt: expires.toISOString() });
});

router.post('/logout', (req, res) => {
  destroySession(req.cookies && req.cookies[COOKIE_NAME]);
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ ok: true });
});

router.get('/presets', requireAuth, (req, res) => {
  res.json({ ok: true, presets: PRESETS, providerKeys: PROVIDER_KEYS });
});

// --- clientes -------------------------------------------------------------

router.get('/clients', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM clients ORDER BY created_at DESC').all();
  res.json({ ok: true, clients: rows.map(toPublicListItem) });
});

router.get('/clients/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ ok: false, error: 'Cliente não encontrado.' });
  res.json({ ok: true, client: toFullRecord(row) });
});

router.post('/clients', requireAuth, (req, res) => {
  const b = req.body || {};
  for (const field of REQUIRED_FIELDS) {
    if (!b[field]) return res.status(400).json({ ok: false, error: `Campo obrigatório ausente: ${field}` });
  }
  if (!PROVIDER_KEYS.includes(b.provider)) {
    return res.status(400).json({ ok: false, error: 'Provedor inválido.' });
  }

  const id = crypto.randomUUID();
  let slug;
  do {
    slug = generateSlug(8);
  } while (db.prepare('SELECT 1 FROM clients WHERE slug = ?').get(slug));

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO clients (
      id, name, provider, base_url, token, instance_name,
      connect_path, connect_method, status_path, status_method,
      auth_header, auth_prefix, qr_json_path, status_json_path, connected_value,
      extra_headers, slug, status, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, b.name, b.provider, b.baseUrl, b.token, b.instanceName || '',
    b.connectPath, b.connectMethod, b.statusPath, b.statusMethod,
    b.authHeader, b.authPrefix || '', b.qrJsonPath, b.statusJsonPath, b.connectedValue,
    JSON.stringify(b.extraHeaders || {}), slug, 'pending', now, now
  );

  const row = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  res.status(201).json({ ok: true, client: toFullRecord(row) });
});

router.patch('/clients/:id', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ ok: false, error: 'Cliente não encontrado.' });

  const b = req.body || {};
  for (const field of REQUIRED_FIELDS) {
    if (!b[field]) return res.status(400).json({ ok: false, error: `Campo obrigatório ausente: ${field}` });
  }
  if (!PROVIDER_KEYS.includes(b.provider)) {
    return res.status(400).json({ ok: false, error: 'Provedor inválido.' });
  }

  db.prepare(`
    UPDATE clients SET
      name=?, provider=?, base_url=?, token=?, instance_name=?,
      connect_path=?, connect_method=?, status_path=?, status_method=?,
      auth_header=?, auth_prefix=?, qr_json_path=?, status_json_path=?, connected_value=?,
      extra_headers=?, updated_at=?
    WHERE id=?
  `).run(
    b.name, b.provider, b.baseUrl, b.token, b.instanceName || '',
    b.connectPath, b.connectMethod, b.statusPath, b.statusMethod,
    b.authHeader, b.authPrefix || '', b.qrJsonPath, b.statusJsonPath, b.connectedValue,
    JSON.stringify(b.extraHeaders || {}), new Date().toISOString(), req.params.id
  );

  const row = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  res.json({ ok: true, client: toFullRecord(row) });
});

router.delete('/clients/:id', requireAuth, (req, res) => {
  const result = db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ ok: false, error: 'Cliente não encontrado.' });
  res.json({ ok: true });
});

// Reabre a conexão: volta o status pra "pending" para o link voltar a
// mostrar QR code (o link e o slug continuam os mesmos).
router.post('/clients/:id/reactivate', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ ok: false, error: 'Cliente não encontrado.' });
  db.prepare(`
    UPDATE clients SET status='pending', last_error=NULL, last_error_at=NULL, updated_at=?
    WHERE id=?
  `).run(new Date().toISOString(), req.params.id);
  const row = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  res.json({ ok: true, client: toFullRecord(row) });
});

router.post('/clients/:id/disable', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ ok: false, error: 'Cliente não encontrado.' });
  db.prepare(`UPDATE clients SET status='disabled', updated_at=? WHERE id=?`)
    .run(new Date().toISOString(), req.params.id);
  const row = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  res.json({ ok: true, client: toFullRecord(row) });
});

// --- teste de conexão -------------------------------------------------------

router.post('/test-connection', requireAuth, async (req, res) => {
  const cfg = req.body || {};
  if (!cfg.baseUrl || !cfg.token) {
    return res.status(400).json({ ok: false, error: 'URL do servidor e token são obrigatórios.' });
  }

  const instanceName = cfg.instanceName || '';
  const debug = { connect: null, status: null };

  try {
    const connectPath = resolvePath(cfg.connectPath, instanceName);
    const connectRes = await callProvider({
      baseUrl: cfg.baseUrl,
      path: connectPath,
      method: cfg.connectMethod || 'POST',
      authHeader: cfg.authHeader,
      authPrefix: cfg.authPrefix || '',
      token: cfg.token,
      extraHeaders: cfg.extraHeaders || {},
    });
    const qrRaw = getByPath(connectRes.json, cfg.qrJsonPath);
    debug.connect = {
      request: { url: connectRes.url, method: connectRes.method },
      responseStatus: connectRes.status,
      responseOk: connectRes.ok,
      body: connectRes.json ?? connectRes.raw ?? null,
      qrFieldPath: cfg.qrJsonPath,
      qrFound: Boolean(qrRaw),
    };
  } catch (e) {
    debug.connect = { error: e.message };
  }

  try {
    const statusPath = resolvePath(cfg.statusPath, instanceName);
    const statusRes = await callProvider({
      baseUrl: cfg.baseUrl,
      path: statusPath,
      method: cfg.statusMethod || 'GET',
      authHeader: cfg.authHeader,
      authPrefix: cfg.authPrefix || '',
      token: cfg.token,
      extraHeaders: cfg.extraHeaders || {},
    });
    const statusVal = getByPath(statusRes.json, cfg.statusJsonPath);
    debug.status = {
      request: { url: statusRes.url, method: statusRes.method },
      responseStatus: statusRes.status,
      responseOk: statusRes.ok,
      body: statusRes.json ?? statusRes.raw ?? null,
      statusFieldPath: cfg.statusJsonPath,
      statusValueFound: statusVal === undefined ? null : statusVal,
      wouldBeConnected: isConnectedValue(statusVal, cfg.connectedValue),
    };
  } catch (e) {
    debug.status = { error: e.message };
  }

  if (cfg.clientId) {
    db.prepare('UPDATE clients SET last_tested_at=? WHERE id=?').run(new Date().toISOString(), cfg.clientId);
  }

  res.json({ ok: true, debug });
});

module.exports = router;
