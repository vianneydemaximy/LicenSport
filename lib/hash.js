/**
 * Empreintes hors chaîne. Seule l'empreinte (SHA-256) va dans le champ URI du credential,
 * jamais la photo ni le dossier eux-mêmes (RGPD).
 */
const crypto = require("crypto");

function sha256Hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Empreinte unique d'un manifeste { photo, dossier } : une seule valeur à mettre dans l'URI,
 * plus simple à vérifier que deux hashes séparés.
 * `photo` et `dossier` sont eux-mêmes des empreintes (ou des Buffers/strings à hacher).
 */
function manifestHash({ photo, dossier }) {
  return sha256Hex(JSON.stringify({ photo, dossier }));
}

module.exports = { sha256Hex, manifestHash };
