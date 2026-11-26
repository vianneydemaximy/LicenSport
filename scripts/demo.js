/**
 * Scénario de démo complet en ligne de commande (npm run demo).
 * Adhésion -> licence -> contrôle -> changement de club -> suspension.
 * Chaque transaction affiche son lien dans l'explorateur Testnet.
 * Rejouable : l'état du sportif 1 est nettoyé au départ.
 */
const xrpl = require("xrpl");
const { TESTNET_URL, CREDENTIAL_TYPES, SEASON_END_ISO, loadWallets } = require("../lib/config");
const { issue, accept, revoke, getCredential, verify, history } = require("../lib/credentials");
const { recordForRole } = require("../lib/offchain");

const { CLUB_MEMBER, LICENCE } = CREDENTIAL_TYPES;
const SEASON = "2026-2027";

const step = (n, title) => console.log(`\n=== ${n}. ${title} ===`);
const show = (label, tx) => console.log(`  ${label}\n    ${tx.link}`);
const showVerify = (label, v) => console.log(`  ${label}\n    ${JSON.stringify(v)}`);

async function main() {
  const w = loadWallets();
  const fed = w.federation.address;
  // Clubs affiliés connus de la fédération : sinon n'importe qui pourrait se déclarer club.
  const affiliatedClubs = [w.clubA.address, w.clubB.address];

  const client = new xrpl.Client(TESTNET_URL);
  await client.connect();
  try {
    step(0, "Remise à zéro du sportif 1");
    const cleanup = [
      [w.clubA, w.clubA.address, CLUB_MEMBER],
      [w.clubB, w.clubB.address, CLUB_MEMBER],
      [w.federation, fed, LICENCE],
    ];
    for (const [signer, issuer, type] of cleanup) {
      if (await getCredential(client, w.athlete1.address, issuer, type)) {
        await revoke(client, signer, w.athlete1.address, issuer, type, "RESET_DEMO");
        console.log(`  ancien credential supprimé (${issuer})`);
      }
    }

    step(1, "Adhésion au club A");
    show("Le club A émet l'adhésion", await issue(client, w.clubA, w.athlete1.address, CLUB_MEMBER, {
      expiration: SEASON_END_ISO, memo: `adhesion ${SEASON}`,
    }));
    show("Le sportif accepte", await accept(client, w.athlete1, w.clubA.address, CLUB_MEMBER));

    step(2, "Émission de la licence par la fédération");
    const adhesion = await verify(client, w.athlete1.address, w.clubA.address, CLUB_MEMBER);
    if (!adhesion.valid || !affiliatedClubs.includes(w.clubA.address)) {
      throw new Error("Adhésion absente ou club non affilié : pas de licence.");
    }
    console.log("  adhésion vérifiée par la fédération : OK");
    // Empreinte de la vraie photo + du dossier (hors chaîne) : seule elle va dans l'URI.
    const uri = recordForRole("athlete1").uri;
    show("La fédération émet la licence", await issue(client, w.federation, w.athlete1.address, LICENCE, {
      expiration: SEASON_END_ISO, uri, memo: `licence ${SEASON}`,
    }));
    show("Le sportif accepte", await accept(client, w.athlete1, fed, LICENCE));

    step(3, "Contrôle le jour J (ce que fait la page de vérification)");
    showVerify("Sportif 1 :", await verify(client, w.athlete1.address, fed, LICENCE, { expectedUri: uri }));
    showVerify("Sportif 2 (sans licence) :", await verify(client, w.athlete2.address, fed, LICENCE));

    step(4, "Changement de club : A -> B");
    show("Le club A révoque l'adhésion", await revoke(client, w.clubA, w.athlete1.address, w.clubA.address, CLUB_MEMBER, "DEPART_CLUB"));
    show("Le club B émet l'adhésion", await issue(client, w.clubB, w.athlete1.address, CLUB_MEMBER, {
      expiration: SEASON_END_ISO, memo: `adhesion ${SEASON}`,
    }));
    show("Le sportif accepte", await accept(client, w.athlete1, w.clubB.address, CLUB_MEMBER));

    step(5, "Suspension par la fédération");
    show("La fédération révoque la licence", await revoke(client, w.federation, w.athlete1.address, fed, LICENCE, "SUSP_DISCIPLINE"));
    showVerify("Contrôle après suspension :", await verify(client, w.athlete1.address, fed, LICENCE, { expectedUri: uri }));

    step(6, "Historique du sportif 1 (lu dans le registre)");
    for (const e of await history(client, w.athlete1.address)) {
      console.log(`  ${e.date}  ${e.action}  ${e.type}  émetteur=${e.issuer}  ${e.memo ?? ""}\n    ${e.link}`);
    }
  } finally {
    await client.disconnect();
  }
}

main().catch((e) => {
  console.error("\nÉchec :", e.message);
  process.exit(1);
});
