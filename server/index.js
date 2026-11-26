/**
 * API publique de vérification LicenSport (lecture seule).
 * Elle ne détient AUCUNE seed : elle lit le registre XRPL et sert les données hors chaîne.
 * L'émetteur attendu (la fédération) vient de la config, jamais de la requête.
 *   npm start   ->  http://localhost:3000
 */
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

const app = express();

app.param("subject", (req, res, next, value) => {
  if (!xrpl.isValidClassicAddress(value)) return res.status(400).json({ error: "adresse invalide" });
  next();
});

app.get("/api/config", (req, res) => {
  res.json({ network: "XRPL Testnet", explorer: EXPLORER, federation: FEDERATION, federationLink: accountLink(FEDERATION) });
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
  const base = process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
  const svg = await QRCode.toString(`${base}/verify.html?subject=${req.params.subject}`, { type: "svg", margin: 1 });
  res.type("image/svg+xml").send(svg);
});

app.use(express.static(path.join(ROOT, "web")));

app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(502).json({ error: "Registre XRPL indisponible, réessayez." });
});

app.listen(PORT, () => console.log(`LicenSport : http://localhost:${PORT}  (fédération ${FEDERATION})`));
