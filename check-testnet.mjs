// check-testnet.mjs — lancer avec : node check-testnet.mjs
import xrpl from "xrpl";
const SERVEURS = [
"wss://s.altnet.rippletest.net:51233", // Ripple (principal)
"wss://testnet.xrpl-labs.com", // XRPL Labs (port 443, secours)
];
let client;
for (const url of SERVEURS) {
try {
client = new xrpl.Client(url);
await client.connect();
console.log("Connecté à", url);
break;
} catch (e) { console.log("Échec sur", url, "→ serveur suivant"); }
}
const { wallet, balance } = await client.fundWallet(); // faucet Testnet
const ledger = await client.request({ command: "ledger", ledger_index: "validated" });
console.log("Adresse :", wallet.address, "| Solde :", balance, "XRP");
console.log("Dernier ledger validé :", ledger.result.ledger_index);
await client.disconnect();