/**
 * API publique de vérification LicenSport (lecture seule).
 * Elle ne détient AUCUNE seed : elle lit le registre XRPL et sert les données hors chaîne.
 * L'émetteur attendu (la fédération) vient de la config, jamais de la requête.
 *   npm start   ->  http://localhost:3000
 */
const os = require("os");
const path = require("path");
const express = require("express");
const QRCode = require("qrcode");
const xrpl = require("xrpl");
const { TESTNET_URL, CREDENTIAL_TYPES, CLUB_LABELS, ROOT, EXPLORER, publicAddresses, accountLink } = require("../lib/config");
const { verify, history } = require("../lib/credentials");
const { recordForAddress, recordForRole, listAthletes } = require("../lib/offchain");
const requests = require("../lib/requests");

const LOCAL = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];

const PORT = process.env.PORT || 3000;
const FEDERATION = publicAddresses().federation;

// Une seule connexion XRPL partagée, rouverte si elle tombe.
let client = null;
let connecting = null;
async function getClient() {
  if (client && client.isConnected()) return client;
  if (!connecting) {
    connecting = (async () => {
      const c = new xrpl.Client(TESTNET_URL);
      c.on("error", () => {});
      await c.connect();
      client = c;
      return c;
    })().finally(() => (connecting = null));
  }
  return connecting;
}

/** Vérifie la licence d'une adresse et renvoie le JSON du contrat d'interface. */
async function verifyLicence(subject) {
  const rec = recordForAddress(subject);
  const result = await verify(await getClient(), subject, FEDERATION, CREDENTIAL_TYPES.LICENCE, {
    expectedUri: rec?.uri,
  });
  return {
    ...result,
    // Nom et photo uniquement si la licence est valide.
    holder: result.valid && rec ? { name: rec.name, photoUrl: `/api/photo/${subject}` } : null,
    checkedAt: new Date().toISOString(),
  };
}


/** Adhésion du sportif dans CHAQUE club : { clubA: état|null, clubB: ..., clubC: ... } (lu dans le registre). */
async function membershipsOf(subject) {
  const client = await getClient();
  const addrs = publicAddresses();
  const out = {};
  for (const [role, label] of Object.entries(CLUB_LABELS)) {
    const v = await verify(client, subject, addrs[role], CREDENTIAL_TYPES.CLUB_MEMBER);
    out[role] =
      v.reason === "absente ou révoquée"
        ? null
        : { club: role, label, accepted: v.accepted, valid: v.valid, expiresAt: v.expiresAt, reason: v.reason };
  }
  return out;
}

/** Tout le parcours d'un sportif : adhésions aux clubs + licence de la fédération. */
async function pipelineOf(subject) {
  const [memberships, licence] = await Promise.all([membershipsOf(subject), verifyLicence(subject)]);
  const all = Object.values(memberships).filter(Boolean);
  // Club "actuel" affiché : une adhésion valide en priorité, sinon la première existante.
  const membership = all.find((m) => m.valid) || all[0] || null;
  return { subject, membership, memberships, licence };
}

/** Vue d'ensemble de tous les sportifs de démonstration (pages fédération, clubs, course). */
let adminRouter = null;

async function computeOverviewRaw() {
  return Promise.all(
    listAthletes().map(async (a) => {
      const p = await pipelineOf(a.address);
      // Demandes en cours (hors chaîne) : elles disparaissent dès que le club / la fédération a validé.
      const asked = requests.get(a.role);
      let askedClub = asked.club;
      if (askedClub && p.memberships[askedClub]) {
        requests.clearClub(a.role);
        askedClub = null;
      }
      let licenceRequest = asked.licence;
      if (licenceRequest && p.licence.reason !== "absente ou révoquée") {
        requests.clearLicence(a.role);
        licenceRequest = false;
      }
      return {
        role: a.role,
        name: a.name,
        address: a.address,
        photoUrl: `/api/people/${a.role}/photo`,
        request: askedClub ? { club: askedClub, label: CLUB_LABELS[askedClub] } : null,
        licenceRequest,
        ...p,
      };
    })
  );
}

async function computeOverview() {
  const rows = await computeOverviewRaw();
  // Mode démo : finalise le consentement des attestations restées en attente, puis relit l'état.
  if (adminRouter && (await adminRouter.consentPending(rows).catch(() => false))) return computeOverviewRaw();
  return rows;
}

// Court cache : plusieurs onglets ouverts ne multiplient pas les requêtes vers le Testnet public.
// Vidé après chaque action admin pour que l'écran reflète aussitôt la nouvelle transaction.
let overviewCache = { at: 0, promise: null };
const invalidateOverview = () => (overviewCache = { at: 0, promise: null });
function overview() {
  if (overviewCache.promise && Date.now() - overviewCache.at < 2500) return overviewCache.promise;
  const promise = computeOverview().catch((e) => {
    invalidateOverview();
    throw e;
  });
  overviewCache = { at: Date.now(), promise };
  return promise;
}

/** Adresse IP du PC sur le réseau local (Wi-Fi), pour que les téléphones puissent atteindre le serveur. */
function lanIp() {
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
  const rank = (ip) => (/^192\.168\./.test(ip) ? 0 : /^10\./.test(ip) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3);
  return ips.sort((a, b) => rank(a) - rank(b))[0] || null;
}

/** URL de base mise dans les QR codes : localhost est inutilisable depuis un téléphone. */
function baseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, "");
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(req.hostname);
  const ip = lanIp();
  return local && ip ? `http://${ip}:${PORT}` : `${req.protocol}://${req.get("host")}`;
}

const app = express();

app.param("subject", (req, res, next, value) => {
  if (!xrpl.isValidClassicAddress(value)) return res.status(400).json({ error: "adresse invalide" });
  next();
});

// Mode administration (démo) : permet d'émettre, accepter et révoquer depuis le navigateur (localhost uniquement).
// `npm start` l'active ; `npm run public` lance la version en lecture seule, sans aucune seed.
const ADMIN = !process.argv.includes("--public") && process.env.ADMIN !== "0";

app.get("/api/config", (req, res) => {
  const addrs = publicAddresses();
  res.json({
    network: "XRPL Testnet",
    explorer: EXPLORER,
    federation: FEDERATION,
    federationLink: accountLink(FEDERATION),
    clubs: Object.fromEntries(Object.entries(CLUB_LABELS).map(([role, label]) => [role, { label, address: addrs[role], link: accountLink(addrs[role]) }])),
    baseUrl: baseUrl(req),
    admin: ADMIN,
  });
});

// Parcours d'un sportif : adhésion (club) puis licence (fédération).
app.get("/api/pipeline/:subject", async (req, res) => res.json(await pipelineOf(req.params.subject)));

// Contrôle de course : tous les inscrits, quel que soit leur club.
// La vérification ne regarde que la signature de la fédération : le club est affiché à titre d'information.
app.get("/api/course", async (req, res) => res.json(await overview()));
app.get("/api/overview", async (req, res) => res.json(await overview()));

app.get("/api/athletes", (req, res) => res.json(listAthletes()));

app.get("/api/verify/:subject", async (req, res) => res.json(await verifyLicence(req.params.subject)));

app.get("/api/history/:subject", async (req, res) => res.json(await history(await getClient(), req.params.subject)));

// Photo "interne" pour les espaces athlète, club, fédération et course : connus de la plateforme,
// uniquement depuis localhost. Le contrôle public (QR code) ne voit la photo que si la licence est valide.
app.get("/api/people/:role/photo", (req, res) => {
  if (!LOCAL.includes(req.socket.remoteAddress)) return res.status(403).end();
  const rec = recordForRole(req.params.role);
  if (!rec) return res.status(404).end();
  res.sendFile(rec.photoPath);
});

// La photo publique n'est servie que si la licence est valide (minimisation des données).
app.get("/api/photo/:subject", async (req, res) => {
  const rec = recordForAddress(req.params.subject);
  const v = await verifyLicence(req.params.subject);
  if (!rec || !v.valid) return res.status(404).end();
  res.sendFile(rec.photoPath);
});

// QR code : une simple URL avec l'adresse du sportif, aucune donnée personnelle.
// Derrière un téléphone, définir PUBLIC_URL (ex. http://192.168.1.20:3000).
app.get("/api/qr/:subject", async (req, res) => {
  const svg = await QRCode.toString(`${baseUrl(req)}/verify.html?subject=${req.params.subject}`, { type: "svg", margin: 1 });
  res.type("image/svg+xml").send(svg);
});

if (ADMIN) {
  try {
    adminRouter = require("./admin").createAdminRouter(getClient, invalidateOverview);
    app.use("/api/admin", adminRouter);
    console.log("Mode DEMO actif : actions fédération, clubs et athlètes possibles depuis localhost uniquement.");
  } catch (e) {
    console.error("Mode démo impossible (seeds manquantes dans .env ?) :", e.message);
    process.exit(1);
  }
} else {
  console.log("Mode PUBLIC (lecture seule) : aucune seed chargée.");
  app.use("/api/admin", (req, res) => res.status(404).json({ error: "Mode lecture seule. Lancez : npm start" }));
}

app.use(express.static(path.join(ROOT, "web")));

app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(502).json({ error: "Registre XRPL indisponible, réessayez." });
});

app.listen(PORT, () => {
  console.log(`LicenSport : http://localhost:${PORT}  (fédération ${FEDERATION})`);
  const ip = lanIp();
  if (ip) console.log(`Téléphone (même Wi-Fi) : http://${ip}:${PORT}  <- les QR codes pointent ici`);
});
