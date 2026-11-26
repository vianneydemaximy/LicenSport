/**
 * Configuration et constantes partagées par la CLI, l'API et les tests.
 * Un seul endroit où l'on définit réseau, types de credentials, dates et wallets.
 */
const fs = require("fs");
const path = require("path");
const xrpl = require("xrpl");

const ROOT = path.join(__dirname, "..");
const TESTNET_URL = "wss://s.altnet.rippletest.net:51233";
const EXPLORER = "https://testnet.xrpl.org";

// XRPL compte le temps en secondes depuis le 1er janvier 2000, pas 1970.
const RIPPLE_EPOCH_OFFSET = 946684800;

// Types de credentials (hex, 64 octets max). Texte lisible dans l'explorateur.
const CREDENTIAL_TYPES = {
  CLUB_MEMBER: xrpl.convertStringToHex("CLUB_MEMBER"),
  LICENCE: xrpl.convertStringToHex("LICENCE_2026"),
};

// Saison 2026-2027 : la licence expire le 30 juin 2027 (fin de journée UTC).
const SEASON_END_ISO = "2027-06-30T23:59:59Z";

// Rôle -> variable d'environnement contenant la seed (voir .env.example).
const ROLES = {
  federation: "FEDERATION_SEED",
  clubA: "CLUB_A_SEED",
  clubB: "CLUB_B_SEED",
  athlete1: "ATHLETE_1_SEED",
  athlete2: "ATHLETE_2_SEED",
  athlete3: "ATHLETE_3_SEED",
  athlete4: "ATHLETE_4_SEED",
};

// Noms (fictifs) des clubs affichés dans l'interface. Les rôles techniques restent clubA / clubB.
const CLUB_LABELS = { clubA: "AC Belvédère", clubB: "Racing Club des Rives" };

function toRippleTime(date) {
  return Math.floor(new Date(date).getTime() / 1000) - RIPPLE_EPOCH_OFFSET;
}

function fromRippleTime(rippleSeconds) {
  return new Date((rippleSeconds + RIPPLE_EPOCH_OFFSET) * 1000);
}

/** Lit .env sans dépendance externe (lignes CLE=valeur). */
function loadEnv(file = path.join(ROOT, ".env")) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

/** Retourne { federation, clubA, ... } sous forme de Wallet xrpl.js. */
function loadWallets() {
  const env = { ...loadEnv(), ...process.env };
  const wallets = {};
  for (const [role, key] of Object.entries(ROLES)) {
    if (!env[key]) {
      throw new Error(`${key} manquante dans .env. Lance d'abord : node scripts/setup-accounts.js`);
    }
    wallets[role] = xrpl.Wallet.fromSeed(env[key]);
  }
  return wallets;
}

/**
 * Adresses PUBLIQUES par rôle (docs/test-addresses.json). Le serveur de vérification n'a
 * besoin que de celles-ci : il ne touche jamais aux seeds.
 */
function publicAddresses() {
  const file = path.join(ROOT, "docs", "test-addresses.json");
  const { accounts } = JSON.parse(fs.readFileSync(file, "utf8"));
  return Object.fromEntries(Object.entries(accounts).map(([role, a]) => [role, a.address]));
}

const txLink = (hash) => `${EXPLORER}/transactions/${hash}`;
const accountLink = (address) => `${EXPLORER}/accounts/${address}`;

module.exports = {
  ROOT,
  TESTNET_URL,
  EXPLORER,
  RIPPLE_EPOCH_OFFSET,
  CREDENTIAL_TYPES,
  SEASON_END_ISO,
  ROLES,
  CLUB_LABELS,
  toRippleTime,
  fromRippleTime,
  loadEnv,
  loadWallets,
  publicAddresses,
  txLink,
  accountLink,
};
