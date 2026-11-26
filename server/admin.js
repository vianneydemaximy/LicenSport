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
const { CREDENTIAL_TYPES, SEASON_END_ISO, CLUB_LABELS, loadWallets, fromRippleTime } = require("../lib/config");
const { issue, accept, revoke, getCredential, verify } = require("../lib/credentials");
const { recordForRole, listAthletes } = require("../lib/offchain");
const requests = require("../lib/requests");

const { CLUB_MEMBER, LICENCE } = CREDENTIAL_TYPES;
const LSF_ACCEPTED = 0x00010000;
const CLUBS = ["clubA", "clubB", "clubC"];
const MOTIFS = ["SUSP_DISCIPLINE", "SUSP_ADMINISTRATIVE"]; // jamais de motif médical sur la chaîne
const SEASON = "2026-2027";
const clubLabel = (role) => CLUB_LABELS[role] || role;
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

function createAdminRouter(getClient, onChange = () => {}) {
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
      onChange();
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

  // Valide une attestation puis enregistre aussitôt la signature de l'athlète : sa demande vaut consentement.
  // (PoC : le serveur signe avec la seed de test de l'athlète. En production : son wallet, par ex. Xaman.)
  async function issueWithConsent(client, issuerWallet, athleteWallet, type, opts) {
    const tx = await issue(client, issuerWallet, athleteWallet.address, type, opts);
    try {
      await accept(client, athleteWallet, issuerWallet.address, type);
    } catch (e) {
      throw new HttpError(500, "Attestation émise, mais le consentement de l'athlète n'a pas pu être enregistré : " + e.message);
    }
    return tx;
  }

  // =================== ATHLÈTE : il initie l'adhésion et la licence ===================
  router.post("/athlete/request", route(async (client, { athlete, club }) => {
    const a = athleteOf(athlete);
    const c = clubOf(club);
    if (await getCredential(client, a.address, c.address, CLUB_MEMBER)) throw new HttpError(409, "Déjà adhérent de ce club.");
    requests.setClub(athlete, club);
    return { label: "Demande d'adhésion envoyée à " + clubLabel(club) };
  }));

  router.post("/athlete/request-licence", route(async (client, { athlete }) => {
    const a = athleteOf(athlete);
    if (await getCredential(client, a.address, wallets.federation.address, LICENCE)) throw new HttpError(409, "Vous avez déjà une licence.");
    let adhesion = false;
    for (const club of CLUBS) if ((await verify(client, a.address, wallets[club].address, CLUB_MEMBER)).valid) adhesion = true;
    if (!adhesion) throw new HttpError(409, "Il faut d'abord être adhérent d'un club.");
    requests.setLicence(athlete);
    return { label: "Demande de licence envoyée à la fédération" };
  }));

  router.post("/athlete/cancel-request", route(async (client, { athlete, what }) => {
    athleteOf(athlete);
    if (what === "licence") requests.clearLicence(athlete);
    else requests.clearClub(athlete);
    return { label: what === "licence" ? "Demande de licence annulée" : "Demande d'adhésion annulée" };
  }));

  // =================== CLUB : valide ou refuse les demandes reçues ===================
  router.post("/club/issue", route(async (client, { club, athlete }) => {
    const c = clubOf(club), a = athleteOf(athlete);
    if (requests.get(athlete).club !== club) throw new HttpError(409, "Cet athlète n'a pas demandé à rejoindre ce club : seul l'athlète peut initier son adhésion.");
    const tx = await issueWithConsent(client, c, a, CLUB_MEMBER, { expiration: SEASON_END_ISO, memo: `adhesion ${SEASON}` });
    requests.clearClub(athlete);
    return done("Adhésion validée par " + clubLabel(club), tx);
  }));

  router.post("/club/decline", route(async (client, { club, athlete }) => {
    clubOf(club);
    athleteOf(athlete);
    if (requests.get(athlete).club === club) requests.clearClub(athlete);
    return { label: "Demande refusée par " + clubLabel(club) };
  }));

  router.post("/club/revoke", route(async (client, { club, athlete }) => {
    const c = clubOf(club), a = athleteOf(athlete);
    return done("Adhésion révoquée par " + clubLabel(club), await revoke(client, c, a.address, c.address, CLUB_MEMBER, "DEPART_CLUB"));
  }));

  // =================== FÉDÉRATION : valide ou refuse les demandes de licence ===================
  router.post("/federation/issue-licence", route(async (client, { athlete }) => {
    const a = athleteOf(athlete);
    if (!requests.get(athlete).licence) throw new HttpError(409, "Cet athlète n'a pas demandé de licence : seul l'athlète peut la demander.");
    // La fédération n'émet que si une adhésion valide existe, émise par un club affilié.
    let adhesion = false;
    for (const club of CLUBS) {
      if ((await verify(client, a.address, wallets[club].address, CLUB_MEMBER)).valid) adhesion = true;
    }
    if (!adhesion) throw new HttpError(409, "Pas d'adhésion valide : un club affilié doit l'avoir validée.");
    const uri = recordForRole(athlete).uri;
    const tx = await issueWithConsent(client, wallets.federation, a, LICENCE, { expiration: SEASON_END_ISO, uri, memo: `licence ${SEASON}` });
    requests.clearLicence(athlete);
    return done("Licence validée par la fédération", tx);
  }));

  router.post("/federation/decline", route(async (client, { athlete }) => {
    athleteOf(athlete);
    requests.clearLicence(athlete);
    return { label: "Demande de licence refusée par la fédération" };
  }));

  router.post("/federation/suspend", route(async (client, { athlete, motif }) => {
    const a = athleteOf(athlete);
    const code = MOTIFS.includes(motif) ? motif : MOTIFS[0];
    return done("Licence suspendue par la fédération", await revoke(client, wallets.federation, a.address, wallets.federation.address, LICENCE, code));
  }));

  // Cas rare (attestation émise sans consentement automatique) : l'athlète peut encore accepter à la main.
  router.post("/athlete/accept", route(async (client, { athlete, kind, club }) => {
    const a = athleteOf(athlete);
    if (kind === "licence") return done("Licence acceptée par l'athlète", await accept(client, a, wallets.federation.address, LICENCE));
    if (kind === "membership") {
      const c = clubOf(club);
      return done("Adhésion acceptée par l'athlète", await accept(client, a, c.address, CLUB_MEMBER));
    }
    throw new HttpError(400, "Type d'attestation inconnu.");
  }));

  // L'athlète n'a jamais à "valider" : sa demande vaut consentement. Si une attestation est restée en attente
  // (essai antérieur, accept interrompu), on enregistre sa signature automatiquement. Une erreur n'est pas retentée avant 60 s.
  const failedAt = new Map();
  router.consentPending = (rows) => serialize(async () => {
    const client = await getClient();
    let changed = false;
    const tryAccept = async (key, athleteWallet, issuerAddress, type) => {
      if (Date.now() - (failedAt.get(key) || 0) < 60000) return;
      try {
        await accept(client, athleteWallet, issuerAddress, type);
        changed = true;
      } catch (e) {
        failedAt.set(key, Date.now());
      }
    };
    for (const r of rows) {
      const a = wallets[r.role];
      if (!a) continue;
      for (const [club, m] of Object.entries(r.memberships)) {
        if (m && !m.accepted) await tryAccept(r.role + club, a, wallets[club].address, CLUB_MEMBER);
      }
      if (r.licence.reason === "non acceptée") await tryAccept(r.role + "licence", a, wallets.federation.address, LICENCE);
    }
    return changed;
  });

  return router;
}

module.exports = { createAdminRouter, MOTIFS, CLUBS };
