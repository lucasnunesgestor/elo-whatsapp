function resolvePath(template, instanceName) {
  return String(template || '').replace('{instance}', encodeURIComponent(instanceName || ''));
}

// Normaliza o valor extraído da resposta do provedor para um data URI de
// imagem que o <img> do frontend consegue exibir direto, aceitando tanto
// "data:image/png;base64,..." já pronto quanto base64 cru.
function toDataUri(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.startsWith('data:image')) return trimmed;
  const looksLikeBase64 = /^[A-Za-z0-9+/=\s]+$/.test(trimmed) && trimmed.replace(/\s+/g, '').length > 40;
  if (looksLikeBase64) return `data:image/png;base64,${trimmed.replace(/\s+/g, '')}`;
  return null;
}

module.exports = { resolvePath, toDataUri };
