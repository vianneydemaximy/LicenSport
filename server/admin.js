/**
 * Routes d'ADMINISTRATION de la démo : émettre, accepter, révoquer depuis le navigateur.
 * Ces routes signent des transactions, donc elles ont besoin des seeds (.env).
 * Garde-fous :
 *  - désactivées par défaut (npm run admin) ;
 *  - acceptées uniquement depuis localhost ;
 *  - le navigateur n'envoie que des NOMS de rôles (clubA, athlete1...), jamais de clé ;
 *  - les seeds ne quittent jamais le serveur.
 * En production : wallet non déposé (Xaman) pour le sportif, multisignature pour la fédération.
 */
const express = require("express");
const { CREDENTIAL_TYPES, SEASON_END_ISO, loadWallets, fromRippleTime } = require("../lib/config");
const { issue, accept, revoke, getCredential, verify } = require("../lib/credentials");
const { recordForRole, listAthletes } = require("../lib/offchain");

const { CLUB_MEMBER, LICENCE } = CREDENTIAL_TYPES;
const LSF_ACCEPTED = 0x00010000;
const CLUBS = ["clubA", "clubB"];
const MOTIFS = ["SUSP_DISCIPLINE", "SUSP_ADMINISTRATIVE"]; // jamais de motif médical sur la chaîne
const SEASON = "2026-2027";
const LOCAL = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function friendly(e) {
  if (e.status) return e.message;
  if (/tecDUPLICATE/.test(e.message)) return "Déjà émis : cette attestation existe déjà.";
  if (/tecNO_ENTRY/.test(e.message)) return "Introuvable : déjà supprimée ou jamais émise.";
  return e.message;
}

function createAdminRouter(getClient) {
  const wallets = loadWallets();
  const athleteRoles = listAthletes().map((a) => a.role);
  const router = express.Router();

  // Localhost uniquement, et pas de requête venue d'une autre origine (anti-CSRF).
  router.use((req, res, next) => {
    if (!LOCAL.includes(req.socket.remoteAddress)) return res.status(403).json({ error: "Réservé à localhost." });
    const origin = req.get("origin");
    if (origin && origin !== `${req.protocol}://${req.get("host")}`) return res.status(403).json({ error: "Origine refusée." });
    next();
  });
  router.use(express.json());

  // Les transactions d'un même compte doivent partir l'une après l'autre.
  let chain = Promise.resolve();
  const serialize = (fn) => {
    const run = chain.then(fn);
    chain = run.catch(() => {});
    return run;
  };

  const athleteOf = (role) => {
    if (!athleteRoles.includes(role)) throw new HttpError(400, "Sportif inconnu.");
    return wallets[role];
  };
  const clubOf = (role) => {
    if (!CLUBS.includes(role)) throw new HttpError(400, "Club inconnu.");
    return wallets[role];
  };
  const done = (label, tx) => ({ label, hash: tx.hash, link: tx.link });

  const route = (handler) => async (req, res) => {
    try {
      const out = await serialize(async () => handler(await getClient(), req.body || {}));
      res.json({ ok: true, ...out });
    } catch (e) {
      res.status(e.status || 400).json({ error: friendly(e) });
    }
  };

  const stateOf = (node) =>
    node
      ? { accepted: (node.Flags & LSF_ACCEPTED) !== 0, expiresAt: node.Expiration ? fromRippleTime(node.Expiration).toISOString() : null }
      : null;

  // État d'un sportif : permet à la page d'activer les bons boutons.
  router.get("/status/:athlete", async (req, res) => {
    try {
      const a = athleteOf(req.params.athlete);
      const client = await getClient();
      const memberships = {};
      for (const club of CLUBS) memberships[club] = stateOf(await getCredential(client, a.address, wallets[club].address, CLUB_MEMBER));
      const licence = stateOf(await getCredential(client, a.address, wallets.federation.address, LICENCE));
      res.json({ address: a.address, memberships, licence });
    } catch (e) {
      res.status(e.status || 502).json({ error: friendly(e) });
    }
  });

  // --- Club ---
  router.post("/club/issue", route(async (client, { club, athlete }) => {
    const c = clubOf(club), a = athleteOf(athlete);
    return done("Adhésion émise par " + club, await issue(client, c, a.address, CLUB_MEMBER, { expiration: SEASON_END_ISO, memo: `adhesion ${SEASON}` }));
  }));

  router.post("/club/revoke", route(async (client, { club, athlete }) => {
    const c = clubOf(club), a = athleteOf(athlete);
    return done("Adhésion révoquée par " + club, await revoke(client, c, a.address, c.address, CLUB_MEMBER, "DEPART_CLUB"));
  }));

  // --- Fédération ---
  router.post("/federation/issue-licence", route(async (client, { athlete }) => {
    const a = athleteOf(athlete);
    // La fédération n'émet que si une adhésion valide existe, émise par un club affilié.
    let adhesion = false;
    for (const club of CLUBS) {
      if ((await verify(client, a.address, wallets[club].address, CLUB_MEMBER)).valid) adhesion = true;
    }
    if (!adhesion) throw new HttpError(409, "Pas d'adhésion valide : un club affilié doit l'émettre et le sportif l'accepter.");
    const uri = recordForRole(athlete).uri;
    return done("Licence émise par la fédération", await issue(client, wallets.federation, a.address, LICENCE, { expiration: SEASON_END_ISO, uri, memo: `licence ${SEASON}` }));
  }));

  router.post("/federation/suspend", route(async (client, { athlete, motif }) => {
    const a = athleteOf(athlete);
    const code = MOTIFS.includes(motif) ? motif : MOTIFS[0];
    return done("Licence suspendue par la fédération", await revoke(client, wallets.federation, a.address, wallets.federation.address, LICENCE, code));
  }));

  // --- Sportif : il signe lui-même son acceptation ---
  router.post("/athlete/accept", route(async (client, { athlete, kind, club }) => {
    const a = athleteOf(athlete);
    if (kind === "licence") {
      return done("Licence acceptée par le sportif", await accept(client, a, wallets.federation.address, LICENCE));
    }
    if (kind === "membership") {
      const c = clubOf(club);
      return done("Adhésion acceptée par le sportif", await accept(client, a, c.address, CLUB_MEMBER));
    }
    throw new HttpError(400, "Type d'attestation inconnu.");
  }));

  return router;
}

module.exports = { createAdminRouter, MOTIFS, CLUBS };
