const crypto = require('crypto');

// Slug curto, aleatório e não sequencial — o link público depende só disso
// para não ser adivinhável, já que não carrega token nem identificador
// previsível do cliente.
function generateSlug(length = 8) {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

module.exports = { generateSlug };
