import xrpl from "xrpl";
import fs from "fs";

const SERVEURS = [
  "wss://s.altnet.rippletest.net:51233",
  "wss://testnet.xrpl-labs.com",
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

const w1 = await client.fundWallet();   // émetteur / expéditeur
const w2 = await client.fundWallet();   // receveur / détenteur

fs.writeFileSync(".env",
  `SEED_1=${w1.wallet.seed}\nSEED_2=${w2.wallet.seed}\n`);

console.log("Wallet 1 :", w1.wallet.address, "|", w1.balance, "XRP");
console.log("Wallet 2 :", w2.wallet.address, "|", w2.balance, "XRP");
console.log("Seeds enregistrées dans .env (ne pas commiter)");
await client.disconnect();