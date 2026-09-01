// Le um valor de um objeto por um caminho tipo "instance.status" ou
// "items[0].qrcode". Usado para extrair QR code e status de respostas de
// APIs de provedores diferentes sem precisar de código por provedor.
function getByPath(obj, pathStr) {
  if (!pathStr || obj === undefined || obj === null) return undefined;
  return String(pathStr)
    .split('.')
    .reduce((acc, rawKey) => {
      if (acc === undefined || acc === null) return undefined;
      const match = rawKey.match(/^([^[]+)(\[(\d+)\])?$/);
      if (!match) return acc[rawKey];
      let val = acc[match[1]];
      if (match[3] !== undefined) {
        val = val ? val[Number(match[3])] : undefined;
      }
      return val;
    }, obj);
}

module.exports = { getByPath };
