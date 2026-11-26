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
const { TESTNET_URL, CREDENTIAL_TYPES, ROOT, EXPLORER, publicAddresses, accountLink } = require("../lib/config");
const { verify, history } = require("../lib/credentials");
const { recordForAddress, listAthletes } = require("../lib/offchain");

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

const CLUB_LABELS = { clubA: "Club A", clubB: "Club B" };

/** Club actuel du sportif (adhésion lue dans le registre), ou null. */
async function membershipOf(subject) {
  const client = await getClient();
  const addrs = publicAddresses();
  for (const [role, label] of Object.entries(CLUB_LABELS)) {
    const v = await verify(client, subject, addrs[role], CREDENTIAL_TYPES.CLUB_MEMBER);
    if (v.reason !== "absente ou révoquée") {
      return { club: role, label, accepted: v.accepted, valid: v.valid, expiresAt: v.expiresAt, reason: v.reason };
    }
  }
  return null;
}

/** Tout le parcours d'un sportif : adhésion au club + licence de la fédération. */
async function pipelineOf(subject) {
  const [membership, licence] = await Promise.all([membershipOf(subject), verifyLicence(subject)]);
  return { subject, membership, licence };
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

app.get("/api/config", (req, res) => {
  res.json({ network: "XRPL Testnet", explorer: EXPLORER, federation: FEDERATION, federationLink: accountLink(FEDERATION), baseUrl: baseUrl(req) });
});

// Parcours d'un sportif : adhésion (club) puis licence (fédération).
app.get("/api/pipeline/:subject", async (req, res) => res.json(await pipelineOf(req.params.subject)));

// Contrôle de course : tous les inscrits, quel que soit leur club.
// La vérification ne regarde que la signature de la fédération : le club est affiché à titre d'information.
app.get("/api/course", async (req, res) => {
  const rows = await Promise.all(
    listAthletes().map(async (a) => ({ role: a.role, name: a.name, address: a.address, ...(await pipelineOf(a.address)) }))
  );
  res.json(rows);
});

app.get("/api/athletes", (req, res) => res.json(listAthletes()));

app.get("/api/verify/:subject", async (req, res) => res.json(await verifyLicence(req.params.subject)));

app.get("/api/history/:subject", async (req, res) => res.json(await history(await getClient(), req.params.subject)));

// La photo n'est servie que si la licence est valide (minimisation des données).
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

// Mode administration (démo) : désactivé par défaut. Lancer avec `npm run admin`.
const ADMIN = process.argv.includes("--admin") || process.env.ADMIN === "1";
if (ADMIN) {
  try {
    app.use("/api/admin", require("./admin").createAdminRouter(getClient));
    console.log("Mode ADMIN actif (localhost uniquement) : http://localhost:" + PORT + "/admin.html");
  } catch (e) {
    console.error("Mode admin impossible :", e.message);
    process.exit(1);
  }
} else {
  app.use("/api/admin", (req, res) => res.status(404).json({ error: "Mode admin désactivé. Lancez : npm run admin" }));
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
