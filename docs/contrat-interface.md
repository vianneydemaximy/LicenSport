# Contrat d'interface LicenSport

Fixé pour que le front, l'API et les scripts XRPL avancent en parallèle.

## Fonctions XRPL (`lib/credentials.js`)

| Fonction | Transaction | Rôle |
|---|---|---|
| `issue(issuerWallet, subject, type, expiration, uri, memo)` | CredentialCreate | Club : adhésion. Fédération : licence. |
| `accept(subjectWallet, issuer, type)` | CredentialAccept | Le sportif consent. |
| `revoke(wallet, subject, issuer, type, motif)` | CredentialDelete | Suspension ou départ d'un club. |
| `verify(subject, issuer, type)` | ledger_entry (lecture seule) | Vérification publique. |
| `history(subject)` | account_tx filtré sur Credential* | Historique de clubs/saisons. |

## Réponse de vérification (`GET /verify/:subject`)

```json
{
  "valid": true,
  "issuer": "r...",
  "accepted": true,
  "expired": false,
  "expiresAt": "2027-06-30T23:59:59.000Z",
  "photoHashOk": true,
  "reason": null
}
```

`reason` vaut `null` si valide, sinon : `"absente ou révoquée"`, `"non acceptée"`, `"expirée"`, `"photo non conforme"`.

Règle de sécurité : l'émetteur attendu (fédération) vient de la config serveur, jamais de la requête.
Le QR code contient uniquement une URL avec l'adresse du sportif.

## Types de credentials

`CLUB_MEMBER` (émis par un club affilié) et `LICENCE_2026` (émis par la fédération). Voir `lib/config.js`.
