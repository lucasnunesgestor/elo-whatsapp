// Servidor falso que imita o formato de resposta da UazAPI o suficiente
// pra testar o fluxo completo (cadastro -> testar conexão -> link público ->
// QR -> conectado) sem precisar de credenciais reais de nenhum provedor.
// Rode com `npm run mock` e cadastre um cliente no admin com:
//   provedor: UazAPI | URL do servidor: http://localhost:4001 | token: qualquer texto
const express = require('express');

const app = express();
app.use(express.json());

const PORT = process.env.MOCK_PORT || 4001;

// 1x1 PNG transparente — só pra ter uma imagem de verdade no <img>.
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

// contagem de chamadas em /instance/status por token, só em memória —
// depois de 3 consultas (~9s com polling de 3s) o mock finge que conectou.
const statusCallsByToken = new Map();

app.post('/instance/connect', (req, res) => {
  res.json({
    connected: false,
    instance: {
      status: 'connecting',
      qrcode: `data:image/png;base64,${TINY_PNG}`,
    },
  });
});

app.get('/instance/status', (req, res) => {
  const token = req.headers['token'] || 'anon';
  const count = (statusCallsByToken.get(token) || 0) + 1;
  statusCallsByToken.set(token, count);
  const connected = count >= 3;
  res.json({
    instance: { status: connected ? 'connected' : 'connecting' },
  });
});

app.listen(PORT, () => {
  console.log(`[mock-provider] estilo UazAPI rodando em http://localhost:${PORT}`);
  console.log('[mock-provider] conecta sozinho após a 3ª checagem de status (~9s de polling)');
});
