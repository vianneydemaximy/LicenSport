/**
 * Cœur XRPL de LicenSport : émettre, accepter, révoquer, vérifier, lire l'historique.
 * Utilisé par la CLI (scripts/demo.js) et, plus tard, par l'API Express.
 * Toutes les fonctions reçoivent un `client` xrpl.js déjà connecté en premier argument.
 */
const xrpl = require("xrpl");
const { toRippleTime, fromRippleTime, txLink } = require("./config");

const LSF_ACCEPTED = 0x00010000; // flag "acceptée" d'un objet Credential

const toHex = (s) => xrpl.convertStringToHex(s);
const fromHex = (h) => xrpl.convertHexToString(h);

/** Signe, soumet et attend la validation. Lève une erreur si le résultat n'est pas tesSUCCESS. */
async function submit(client, wallet, tx, memo) {
  const full = { Account: wallet.address, ...tx };
  if (memo) {
    full.Memos = [
      {
        Memo: {
          MemoType: toHex("licensport"),
          MemoData: toHex(typeof memo === "string" ? memo : JSON.stringify(memo)),
        },
      },
    ];
  }
  const prepared = await client.autofill(full);
  const res = await client.submitAndWait(wallet.sign(prepared).tx_blob);
  const code = res.result.meta.TransactionResult;
  if (code !== "tesSUCCESS") throw new Error(`${tx.TransactionType} a échoué : ${code}`);
  return { hash: res.result.hash, link: txLink(res.result.hash) };
}

/**
 * CredentialCreate : le club émet l'adhésion, la fédération émet la licence.
 * @param expiration  date ISO ou Date (convertie en "Ripple epoch")
 * @param uri         empreinte SHA-256 (texte), stockée en hex dans le champ URI
 */
function issue(client, issuerWallet, subject, type, { expiration, uri, memo } = {}) {
  const tx = { TransactionType: "CredentialCreate", Subject: subject, CredentialType: type };
  if (expiration) tx.Expiration = toRippleTime(expiration);
  if (uri) tx.URI = toHex(uri);
  return submit(client, issuerWallet, tx, memo);
}

/** CredentialAccept : le sportif consent à recevoir l'attestation. */
function accept(client, subjectWallet, issuer, type, memo) {
  return submit(
    client,
    subjectWallet,
    { TransactionType: "CredentialAccept", Issuer: issuer, CredentialType: type },
    memo
  );
}

/** CredentialDelete : suspension (fédération) ou départ d'un club. `motif` est un code court. */
function revoke(client, wallet, subject, issuer, type, motif) {
  return submit(
    client,
    wallet,
    { TransactionType: "CredentialDelete", Subject: subject, Issuer: issuer, CredentialType: type },
    motif
  );
}

/** Lit l'objet Credential dans le registre, ou null s'il n'existe pas (jamais émis ou révoqué). */
async function getCredential(client, subject, issuer, type) {
  try {
    const r = await client.request({
      command: "ledger_entry",
      credential: { subject, issuer, credential_type: type },
      ledger_index: "validated",
    });
    return r.result.node;
  } catch (e) {
    if (e?.data?.error === "entryNotFound" || /entryNotFound/.test(e?.message || "")) return null;
    throw e;
  }
}

/**
 * Vérification publique. Ne lit que le registre.
 * `issuer` doit venir de la config serveur (adresse de la fédération), jamais d'une requête.
 * `opts.expectedUri` : empreinte attendue (calculée hors chaîne) pour contrôler la photo.
 */
async function verify(client, subject, issuer, type, opts = {}) {
  const node = await getCredential(client, subject, issuer, type);
  if (!node) {
    return {
      valid: false, issuer, accepted: false, expired: false,
      expiresAt: null, photoHashOk: null, reason: "absente ou révoquée",
    };
  }

  // Une credential expirée reste dans le ledger : on compare nous-mêmes à l'heure du dernier ledger validé.
  const ledger = await client.request({ command: "ledger", ledger_index: "validated" });
  const now = ledger.result.ledger.close_time; // déjà en "Ripple epoch"

  const accepted = (node.Flags & LSF_ACCEPTED) !== 0;
  const expired = node.Expiration !== undefined && node.Expiration <= now;
  const uri = node.URI ? fromHex(node.URI) : null;
  const photoHashOk = opts.expectedUri === undefined ? null : uri === opts.expectedUri;

  let reason = null;
  if (!accepted) reason = "non acceptée";
  else if (expired) reason = "expirée";
  else if (photoHashOk === false) reason = "photo non conforme";

  return {
    valid: reason === null,
    issuer,
    accepted,
    expired,
    expiresAt: node.Expiration !== undefined ? fromRippleTime(node.Expiration).toISOString() : null,
    photoHashOk,
    reason,
  };
}

/**
 * Historique d'un sportif : transactions Credential* réussies, lues dans account_tx.
 * Nécessaire car après un CredentialDelete l'objet disparaît de l'état courant.
 */
async function history(client, subject) {
  const events = [];
  let marker;
  do {
    const r = await client.request({ command: "account_tx", account: subject, limit: 200, marker });
    for (const t of r.result.transactions) {
      const tx = t.tx_json ?? t.tx;
      if (!tx || !tx.TransactionType.startsWith("Credential")) continue;
      if (t.meta?.TransactionResult !== "tesSUCCESS") continue;
      const hash = t.hash ?? tx.hash;
      const memo = tx.Memos?.[0]?.Memo?.MemoData;
      events.push({
        action: tx.TransactionType,
        type: tx.CredentialType ? fromHex(tx.CredentialType) : null,
        issuer: tx.Issuer ?? tx.Account,
        subject: tx.Subject ?? tx.Account,
        memo: memo ? fromHex(memo) : null,
        date: t.close_time_iso ?? (tx.date !== undefined ? fromRippleTime(tx.date).toISOString() : null),
        hash,
        link: txLink(hash),
      });
    }
    marker = r.result.marker;
  } while (marker);
  return events.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

module.exports = { issue, accept, revoke, getCredential, verify, history };
