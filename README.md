# LicenSport

**La licence sportive vérifiable par tous, qui suit le sportif de club en club.**

Projet du Blockchain Challenge XRPL (sujet : Certification). Une fédération émet des licences sous forme de **Credentials XRPL (XLS-70)**. Un arbitre, un organisateur ou un assureur les vérifie en quelques secondes en scannant un QR code, sans accès aux systèmes de la fédération.

- **Réseau** : XRPL **Testnet** uniquement (`wss://s.altnet.rippletest.net:51233`). Aucun smart contract : tout repose sur la brique native Credentials.
- **Explorateur** : <https://testnet.xrpl.org>

## Pourquoi la blockchain

| Critère | Base de données d'une fédération | LicenSport sur XRPL |
|---|---|---|
| Vérification par un tiers | API à négocier avec chaque fédération | Lecture publique du registre, sans compte ni accord |
| Preuve de l'émetteur | Il faut croire le serveur qui répond | Signature de l'adresse publique de la fédération |
| Suspension / révocation | Visible seulement par qui a accès à la base | Publique et datée dès la transaction validée |
| Historique | Modifiable ou perdu par l'administrateur | Inaltérable, consultable dans l'explorateur |
| Consentement du sportif | Aucun | Le sportif accepte sa licence (`CredentialAccept`) |

**Limites assumées** : la blockchain prouve qu'une licence est authentique, pas que la personne présente en est la titulaire (d'où la photo contrôlée par empreinte). Si la fédération émet à tort, la chaîne l'enregistre fidèlement : la confiance dans l'émetteur reste nécessaire, mais elle devient vérifiable. Une suspension supprime le credential ; lever une suspension revient à en émettre un nouveau.

## Architecture

```
Navigateur (web/)  ->  API Express (server/, lecture seule, sans seed)  ->  XRPL Testnet
                              |
                     données hors chaîne (server/data : nom, photo, dossier)
```

| Sur la chaîne | Hors chaîne (serveur) |
|---|---|
| Adresses de la fédération, des clubs, des sportifs | Nom, photo, dossier d'inscription |
| Type d'attestation, date d'expiration | Le certificat médical n'existe nulle part dans le projet (« dossier complet » uniquement) |
| Une empreinte SHA-256 dans le champ `URI` | |

Briques XRPL utilisées : `CredentialCreate`, `CredentialAccept`, `CredentialDelete`, champ `Expiration` (expiration en fin de saison, le 30 juin), champ `URI` (empreinte du manifeste photo + dossier), `Memos` (saison, motif de suspension codé), `ledger_entry` (vérification) et `account_tx` (historique).

Deux types de credentials : `CLUB_MEMBER` (émis par un club affilié) et `LICENCE_2026` (émis par la fédération).

## Sécurité et clés

- Comptes de **test uniquement**, créés par le faucet. Les seeds sont dans `.env`, ignoré par Git. Jamais de seed Mainnet.
- L'API publique ne contient **aucune seed** : elle ne fait que lire le registre.
- L'émetteur attendu (la fédération) est fixé côté serveur, **jamais lu dans la requête** : sinon n'importe qui pourrait se faire passer pour la fédération.
- Les clubs affiliés sont une liste connue de la fédération : elle n'émet une licence que si l'adhésion vient d'un de ces clubs.
- Le nom et la photo ne sont servis que si la licence est valide. Le QR code ne contient qu'une URL avec l'adresse du sportif.
- Dans le PoC, le sportif signe avec une seed de test. **En production** : un wallet non déposé (Xaman) et une multisignature pour le compte de la fédération.

## Installation

Prérequis : Node.js LTS.

```bash
npm install
cp .env.example .env
npm run setup        # crée les 5 comptes Testnet via le faucet et remplit .env
```

Une seule personne lance `npm run setup`, puis partage le `.env` en privé aux autres. Ne pas le relancer avec `--force` sans prévenir l'équipe : les adresses changeraient.

## Lancement

```bash
npm start            # http://localhost:3000
npm run demo         # scénario complet en ligne de commande (~1 min)
npm run check        # test de faisabilité des Credentials sur le Testnet
```

Pour scanner le QR code avec un téléphone (même Wi-Fi) : `PUBLIC_URL=http://<IP-du-PC>:3000 npm start`.

## Adresses de test (Testnet)

| Rôle | Adresse |
|---|---|
| Fédération | [`raTf3i2jq28R4D9oJXVAMo2gG9WXqJvtup`](https://testnet.xrpl.org/accounts/raTf3i2jq28R4D9oJXVAMo2gG9WXqJvtup) |
| Club A | [`rLbSjF3sc2UZf1DL3G4Nf5bTHMR3rEb8tY`](https://testnet.xrpl.org/accounts/rLbSjF3sc2UZf1DL3G4Nf5bTHMR3rEb8tY) |
| Club B | [`rBCxDUmPo4vuFYCwrsPx5xbwPnw6CT1e5a`](https://testnet.xrpl.org/accounts/rBCxDUmPo4vuFYCwrsPx5xbwPnw6CT1e5a) |
| Sportif 1 (Camille Martin, fictif) | [`rMCLSRGnGYBs7djdQhemM5mzFeXdHJnjZR`](https://testnet.xrpl.org/accounts/rMCLSRGnGYBs7djdQhemM5mzFeXdHJnjZR) |
| Sportif 2 (Alex Bernard, fictif) | [`rs69qe1YaUwYWb76zfEQGFLf8dAxADXJrL`](https://testnet.xrpl.org/accounts/rs69qe1YaUwYWb76zfEQGFLf8dAxADXJrL) |

Les données personnelles du dépôt sont fictives.

## Scénario de démonstration

1. **Adhésion** : le club A émet l'attestation « adhérent » (`CredentialCreate`), le sportif l'accepte (`CredentialAccept`).
2. **Licence** : la fédération vérifie l'adhésion et l'affiliation du club, émet la licence avec expiration au 30 juin 2027 et l'empreinte du dossier et de la photo, puis le sportif l'accepte.
3. **Contrôle par QR code** : ouvrir <http://localhost:3000>, scanner ou cliquer sur le sportif 1. La page lit le registre : « LICENCE VALIDE », émetteur reconnu, photo conforme.
4. **Changement de club** : le club A révoque l'adhésion (`CredentialDelete`), le club B en émet une. L'historique reste visible dans la page et dans l'explorateur.
5. **Suspension** : la fédération révoque la licence (`CredentialDelete`, motif en Memo). La page de vérification passe d'elle-même (toutes les 5 s) à « LICENCE NON VALIDE ».

Pour la jouer en direct : `npm start` dans un terminal, la page de vérification ouverte, puis `npm run demo` dans un autre. Chaque transaction affiche son lien dans l'explorateur.

## Structure du dépôt

```
lib/          cœur XRPL : config, credentials (issue, accept, revoke, verify, history), hash, hors chaîne
server/       API Express de vérification (lecture seule) et données hors chaîne fictives
web/          pages de vérification (QR code) et d'accueil
scripts/      setup-accounts, check-credentials, demo
docs/         contrat d'interface, adresses publiques de test
exercises/    exercices de la formation XRPL (hors projet)
```

Le format de réponse de la vérification et les signatures des fonctions sont décrits dans [docs/contrat-interface.md](docs/contrat-interface.md).

## Équipe

Inès Haller, Vianney de Maximy, Amélie Dupouy, Maxence Ribaute-Picard.
