/**
 * Demandes des athlètes (HORS CHAÎNE) : demande d'adhésion à un club, demande de licence à la fédération.
 * La demande vaut consentement : à la validation, la signature de l'athlète (CredentialAccept)
 * est enregistrée automatiquement. Rien n'est publié sur XRPL tant que le club / la fédération n'a pas validé.
 * Stocké dans server/data/requests.json (ignoré par Git) : { athlete1: { club: "clubA", licence: true } }
 */
const fs = require("fs");
const path = require("path");
const { ROOT } = require("./config");

const FILE = path.join(ROOT, "server", "data", "requests.json");

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    // Ancien format : { athlete1: "clubA" }
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === "string" ? { club: v } : v]));
  } catch {
    return {};
  }
}

/** { club: rôle du club ou null, licence: true/false } */
const get = (athleteRole) => ({ club: null, licence: false, ...(load()[athleteRole] || {}) });

function update(athleteRole, patch) {
  const all = load();
  const next = { ...get(athleteRole), ...patch };
  if (!next.club && !next.licence) delete all[athleteRole];
  else all[athleteRole] = next;
  fs.writeFileSync(FILE, JSON.stringify(all, null, 2));
}

module.exports = {
  get,
  setClub: (role, club) => update(role, { club }),
  clearClub: (role) => update(role, { club: null }),
  setLicence: (role) => update(role, { licence: true }),
  clearLicence: (role) => update(role, { licence: false }),
};
