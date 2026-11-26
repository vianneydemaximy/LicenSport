/**
 * Test de faisabilité : les Credentials (XLS-70) fonctionnent-ils sur le Testnet ?
 * Club A émet CLUB_MEMBER -> sportif 1 accepte -> lecture ledger_entry -> suppression.
 * Re-jouable : le credential est supprimé à la fin (les transactions restent visibles
 * dans l'explorateur).
 *   node scripts/check-credentials.js
 */
const xrpl = require("xrpl");
const { TESTNET_URL, CREDENTIAL_TYPES, SEASON_END_ISO, loadWallets, toRippleTime, txLink } = require("../lib/config");

async function send(client, wallet, tx, label) {
  const prepared = await client.autofill({ Account: wallet.address, ...tx });
  const res = await client.submitAndWait(wallet.sign(prepared).tx_blob);
  const code = res.result.meta.TransactionResult;
  console.log(`${code === "tesSUCCESS" ? "OK " : "KO "} ${label} -> ${code}\n    ${txLink(res.result.hash)}`);
  if (code !== "tesSUCCESS") throw new Error(`${label} a échoué : ${code}`);
}

async function main() {
  const { clubA, athlete1 } = loadWallets();
  const type = CREDENTIAL_TYPES.CLUB_MEMBER;
  const client = new xrpl.Client(TESTNET_URL);
  await client.connect();
  try {
    await send(client, clubA, {
      TransactionType: "CredentialCreate",
      Subject: athlete1.address,
      CredentialType: type,
      Expiration: toRippleTime(SEASON_END_ISO),
    }, "CredentialCreate (club -> sportif)");

    await send(client, athlete1, {
      TransactionType: "CredentialAccept",
      Issuer: clubA.address,
      CredentialType: type,
    }, "CredentialAccept (sportif)");

    const r = await client.request({
      command: "ledger_entry",
      credential: { subject: athlete1.address, issuer: clubA.address, credential_type: type },
      ledger_index: "validated",
    });
    console.log("ledger_entry : Flags =", r.result.node.Flags, "(65536 = acceptée), Expiration =", r.result.node.Expiration);

    await send(client, clubA, {
      TransactionType: "CredentialDelete",
      Subject: athlete1.address,
      CredentialType: type,
    }, "CredentialDelete (nettoyage)");

    console.log("\nLes Credentials fonctionnent sur le Testnet.");
  } finally {
    await client.disconnect();
  }
}

main().catch((e) => {
  console.error("\nÉchec :", e.message);
  process.exit(1);
});
