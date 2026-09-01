// node:sqlite é nativo do Node (>=22.5, estável o bastante aqui), sem
// binário pra compilar — evita depender de toolchain de build (Visual
// Studio no Windows, build-essential no Linux) só pra guardar cadastro de
// cliente num arquivo local.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'app.db'));
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    base_url TEXT NOT NULL,
    token TEXT NOT NULL,
    instance_name TEXT DEFAULT '',
    connect_path TEXT NOT NULL,
    connect_method TEXT NOT NULL,
    status_path TEXT NOT NULL,
    status_method TEXT NOT NULL,
    auth_header TEXT NOT NULL,
    auth_prefix TEXT DEFAULT '',
    qr_json_path TEXT NOT NULL,
    status_json_path TEXT NOT NULL,
    connected_value TEXT NOT NULL,
    extra_headers TEXT NOT NULL DEFAULT '{}',
    slug TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    last_error TEXT,
    last_error_at TEXT,
    last_tested_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_clients_slug ON clients(slug);
`);

module.exports = db;
