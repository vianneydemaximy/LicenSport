/**
 * Demandes d'adhésion : un athlète choisit un club, le club les voit et les valide.
 * C'est de l'état de plateforme HORS CHAÎNE (rien n'est publié sur XRPL tant que le club
 * n'a pas validé). Stocké dans server/data/requests.json (ignoré par Git).
 */
const fs = require("fs");
const path = require("path");
const { ROOT } = require("./config");

const FILE = path.join(ROOT, "server", "data", "requests.json");

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}

/** Club (rôle) auquel l'athlète a adressé une demande, ou null. */
const get = (athleteRole) => load()[athleteRole] || null;

function set(athleteRole, clubRole) {
  const all = load();
  all[athleteRole] = clubRole;
  fs.writeFileSync(FILE, JSON.stringify(all, null, 2));
}

function clear(athleteRole) {
  const all = load();
  delete all[athleteRole];
  fs.writeFileSync(FILE, JSON.stringify(all, null, 2));
}

module.exports = { get, set, clear };
