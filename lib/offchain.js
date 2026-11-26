/**
 * Données HORS CHAÎNE (nom, photo, dossier) et calcul de l'empreinte attendue.
 * Rien d'ici n'est publié sur XRPL, sauf l'empreinte finale (champ URI du credential).
 */
const fs = require("fs");
const path = require("path");
const { ROOT, publicAddresses } = require("./config");
const { sha256Hex, manifestHash } = require("./hash");

const DATA_DIR = path.join(ROOT, "server", "data");
const athletes = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "athletes.json"), "utf8"));

/** Fiche d'un sportif par rôle (athlete1...) avec son chemin de photo et son empreinte attendue. */
function recordForRole(role) {
  const rec = athletes[role];
  if (!rec || role.startsWith("_")) return null;
  const photoPath = path.join(DATA_DIR, "photos", rec.photo);
  // L'empreinte est recalculée à partir du fichier actuel : si la photo est remplacée,
  // elle ne correspond plus à celle inscrite sur la chaîne.
  const uri = manifestHash({
    photo: sha256Hex(fs.readFileSync(photoPath)),
    dossier: sha256Hex(JSON.stringify(rec.dossier)),
  });
  return { role, name: rec.name, photoPath, uri };
}

function recordForAddress(address) {
  const role = Object.entries(publicAddresses()).find(([, a]) => a === address)?.[0];
  return role ? recordForRole(role) : null;
}

/** Sportifs de démonstration : [{ role, address, name }]. */
function listAthletes() {
  const addrs = publicAddresses();
  return Object.keys(athletes)
    .filter((r) => !r.startsWith("_") && addrs[r])
    .map((role) => ({ role, address: addrs[role], name: athletes[role].name }));
}

module.exports = { recordForRole, recordForAddress, listAthletes };
