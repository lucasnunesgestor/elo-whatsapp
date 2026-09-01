require('dotenv').config();

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');

require('./db'); // garante que as tabelas existem antes de subir o servidor

const adminRoutes = require('./routes/admin');
const publicRoutes = require('./routes/public');

if (!process.env.ADMIN_PASSWORD) {
  console.warn('[elo-whatsapp] ADMIN_PASSWORD não definido em .env — o login do admin vai sempre falhar.');
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // necessário atrás de Nginx/reverse proxy para cookie Secure funcionar

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

app.use('/admin/api', adminRoutes);
app.use('/c', publicRoutes);

app.use('/shared', express.static(path.join(__dirname, '..', 'public', 'shared')));
app.use('/admin/assets', express.static(path.join(__dirname, '..', 'public', 'admin')));
app.use('/client/assets', express.static(path.join(__dirname, '..', 'public', 'client')));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'index.html'));
});

app.get('/', (req, res) => res.redirect('/admin'));

app.use((req, res) => res.status(404).json({ ok: false, error: 'not_found' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[elo-whatsapp] rodando em http://localhost:${PORT}`);
  console.log(`[elo-whatsapp] painel admin em http://localhost:${PORT}/admin`);
});
