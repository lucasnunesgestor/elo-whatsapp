const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { callProvider } = require('../lib/httpClient');
const { getByPath } = require('../lib/jsonPath');
const { resolvePath, toDataUri } = require('../lib/util');
const { isConnectedValue } = require('../providers');

const router = express.Router();

// Limites generosos o bastante pro polling normal (QR a cada ~28s, status a
// cada 3s) mas que seguram abuso de um slug vazado.
const qrLimiter = rateLimit({ windowMs: 60_000, max: 15, standardHeaders: true, legacyHeaders: false });
const statusLimiter = rateLimit({ windowMs: 60_000, max: 40, standardHeaders: true, legacyHeaders: false });

function getClientBySlug(slug) {
  return db.prepare('SELECT * FROM clients WHERE slug = ?').get(slug);
}

function markError(id, message) {
  db.prepare('UPDATE clients SET last_error=?, last_error_at=? WHERE id=?')
    .run(String(message).slice(0, 500), new Date().toISOString(), id);
}

function markConnected(id) {
  db.prepare("UPDATE clients SET status='connected', updated_at=? WHERE id=?")
    .run(new Date().toISOString(), id);
}

// Página do cliente: mesmo HTML pra qualquer slug, o estado é resolvido no
// navegador chamando /qr e /status. Slug inválido também recebe essa mesma
// página — ela mostra "link inválido" ao ver o 404 dessas rotas, em vez de
// vazar se o formato do slug existe ou não.
router.get('/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'client', 'index.html'));
});

router.get('/:slug/qr', qrLimiter, async (req, res) => {
  const client = getClientBySlug(req.params.slug);
  if (!client) return res.status(404).json({ ok: false, error: 'not_found' });

  if (client.status !== 'pending') {
    return res.json({ ok: true, status: client.status, qr: null });
  }

  try {
    const connectPath = resolvePath(client.connect_path, client.instance_name);
    const result = await callProvider({
      baseUrl: client.base_url,
      path: connectPath,
      method: client.connect_method,
      authHeader: client.auth_header,
      authPrefix: client.auth_prefix,
      token: client.token,
      extraHeaders: JSON.parse(client.extra_headers || '{}'),
    });

    const qrRaw = getByPath(result.json, client.qr_json_path);
    const qr = toDataUri(qrRaw);

    if (!qr) {
      markError(client.id, `QR não encontrado em "${client.qr_json_path}" (HTTP ${result.status})`);
      return res.json({ ok: true, status: 'pending', qr: null, retry: true });
    }

    return res.json({ ok: true, status: 'pending', qr });
  } catch (e) {
    markError(client.id, e.message);
    return res.json({ ok: true, status: 'pending', qr: null, retry: true });
  }
});

router.get('/:slug/status', statusLimiter, async (req, res) => {
  const client = getClientBySlug(req.params.slug);
  if (!client) return res.status(404).json({ ok: false, error: 'not_found' });

  if (client.status === 'connected') return res.json({ ok: true, status: 'connected' });
  if (client.status === 'disabled') return res.json({ ok: true, status: 'disabled' });

  try {
    const statusPath = resolvePath(client.status_path, client.instance_name);
    const result = await callProvider({
      baseUrl: client.base_url,
      path: statusPath,
      method: client.status_method,
      authHeader: client.auth_header,
      authPrefix: client.auth_prefix,
      token: client.token,
      extraHeaders: JSON.parse(client.extra_headers || '{}'),
    });

    const value = getByPath(result.json, client.status_json_path);
    if (isConnectedValue(value, client.connected_value)) {
      markConnected(client.id);
      return res.json({ ok: true, status: 'connected' });
    }

    return res.json({ ok: true, status: 'pending' });
  } catch (e) {
    markError(client.id, e.message);
    return res.json({ ok: true, status: 'pending' });
  }
});

module.exports = router;
