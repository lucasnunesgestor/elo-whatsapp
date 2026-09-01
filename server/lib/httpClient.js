// Toda chamada às APIs de WhatsApp acontece aqui, no servidor — nunca no
// navegador do cliente final. Isso resolve CORS (o provedor só precisa
// aceitar requisições do IP do servidor, não de qualquer navegador) e
// garante que o token da instância nunca trafega até o cliente.
async function callProvider({ baseUrl, path, method, authHeader, authPrefix = '', token, extraHeaders = {} }, { timeoutMs = 10000 } = {}) {
  const url = String(baseUrl).replace(/\/+$/, '') + path;
  const headers = { Accept: 'application/json', ...extraHeaders };
  if (authHeader) headers[authHeader] = `${authPrefix}${token}`;

  const httpMethod = (method || 'GET').toUpperCase();
  if (httpMethod !== 'GET' && httpMethod !== 'HEAD') {
    headers['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: httpMethod,
      headers,
      signal: controller.signal,
      body: httpMethod === 'GET' || httpMethod === 'HEAD' ? undefined : JSON.stringify({}),
    });
    const text = await res.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch (e) {
        json = null;
      }
    }
    return { ok: res.ok, status: res.status, url, method: httpMethod, json, raw: json ? undefined : text };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { callProvider };
