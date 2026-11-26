import xrpl from "xrpl";

const emetteur = xrpl.Wallet.fromSeed(process.env.SEED_1);
const receveur = xrpl.Wallet.fromSeed(process.env.SEED_2);

console.log("Émetteur :", emetteur.address);
console.log("Receveur :", receveur.address);
