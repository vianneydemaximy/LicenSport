/**
 * Crée les 5 comptes Testnet de LicenSport (1 fédération, 2 clubs, 2 sportifs)
 * et écrit leurs seeds dans .env (ignoré par Git).
 * Les adresses publiques vont dans docs/test-addresses.json (versionné, pour le README).
 *
 * À lancer UNE SEULE FOIS par une seule personne, puis partager le .env en privé.
 *   node scripts/setup-accounts.js          -> ne crée que les comptes manquants
 *   node scripts/setup-accounts.js --force  -> recrée tout (nouvelles adresses !)
 */
const fs = require("fs");
const path = require("path");
const xrpl = require("xrpl");
const { ROOT, TESTNET_URL, ROLES, loadEnv, accountLink } = require("../lib/config");

const ENV_FILE = path.join(ROOT, ".env");
const ADDR_FILE = path.join(ROOT, "docs", "test-addresses.json");
const force = process.argv.includes("--force");

function writeEnv(updates) {
  const existing = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/) : [];
  const remaining = { ...updates };
  const lines = existing.map((line) => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m && m[1] in remaining) {
      const out = `${m[1]}=${remaining[m[1]]}`;
      delete remaining[m[1]];
      return out;
    }
    return line;
  });
  for (const [k, v] of Object.entries(remaining)) lines.push(`${k}=${v}`);
  fs.writeFileSync(ENV_FILE, lines.join("\n").replace(/\n*$/, "\n"));
}

async function main() {
  const env = loadEnv();
  const todo = Object.entries(ROLES).filter(([, key]) => force || !env[key]);
  const client = new xrpl.Client(TESTNET_URL);
  await client.connect();

  const seeds = {};
  try {
    for (const [role, key] of todo) {
      process.stdout.write(`Création du compte ${role}... `);
      const { wallet } = await client.fundWallet();
      seeds[key] = wallet.seed;
      console.log(wallet.address); // jamais la seed dans la console
    }
  } finally {
    await client.disconnect();
  }

  if (Object.keys(seeds).length) writeEnv(seeds);

  // Adresses publiques de tous les rôles (nouveaux + existants).
  const all = { ...env, ...seeds };
  const addresses = {};
  for (const [role, key] of Object.entries(ROLES)) {
    const address = xrpl.Wallet.fromSeed(all[key]).address;
    addresses[role] = { address, explorer: accountLink(address) };
  }
  fs.mkdirSync(path.dirname(ADDR_FILE), { recursive: true });
  fs.writeFileSync(
    ADDR_FILE,
    JSON.stringify({ network: "XRPL Testnet", note: "Adresses publiques de test.", accounts: addresses }, null, 2) + "\n"
  );

  console.log(
    todo.length
      ? `\n${todo.length} compte(s) créé(s). Seeds dans .env (NE PAS COMMITER). Adresses dans docs/test-addresses.json.`
      : "\nTous les comptes existent déjà (utilise --force pour les recréer). Adresses mises à jour."
  );
}

main().catch((e) => {
  console.error("Erreur :", e.message);
  console.error("Le faucet Testnet peut être lent ou indisponible : réessaie dans une minute.");
  process.exit(1);
});
