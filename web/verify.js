// Page de vérification : lit l'API (qui lit le registre XRPL) et se rafraîchit toute seule.
// Tout le texte venant du réseau passe par textContent (jamais innerHTML).
const subject = new URLSearchParams(location.search).get("subject");
const REFRESH_MS = 5000;
let federation = null;

function el(tag, attrs = {}, text) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString("fr-FR") : "—");
const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "UTC" }) : "—");
const short = (a) => (a ? `${a.slice(0, 7)}…${a.slice(-5)}` : "—");

function tag(ok, yes, no, na) {
  if (ok === null) return el("span", { class: "tag na" }, na || "non disponible");
  return el("span", { class: `tag ${ok ? "ok" : "ko"}` }, ok ? yes : no);
}

function row(dl, label, node) {
  dl.append(el("dt", {}, label));
  const dd = el("dd");
  dd.append(node);
  dl.append(dd);
}

const REASONS = {
  "absente ou révoquée": "Aucune licence en cours : jamais émise, suspendue ou révoquée par la fédération.",
  "non acceptée": "La licence a été émise mais le sportif ne l'a pas encore acceptée.",
  "expirée": "La licence a dépassé sa date de fin de saison.",
  "photo non conforme": "L'empreinte de la photo ne correspond pas à celle inscrite sur la chaîne.",
};

function renderStatus(v) {
  const box = document.getElementById("status");
  box.className = `status ${v.valid ? "ok" : "ko"}`;
  box.replaceChildren(
    el("div", { class: "big" }, v.valid ? "LICENCE VALIDE" : "LICENCE NON VALIDE"),
    el("div", { class: "why" }, v.valid ? "Émise par la fédération, acceptée, en cours de validité." : REASONS[v.reason] || v.reason)
  );

  const holder = document.getElementById("holder");
  holder.replaceChildren();
  if (v.holder) {
    const card = el("div", { class: "card holder" });
    card.append(el("img", { src: v.holder.photoUrl, alt: `Photo de ${v.holder.name}` }));
    const info = el("div");
    info.append(el("div", { class: "name" }, v.holder.name), el("div", { class: "muted" }, "Titulaire de la licence"));
    card.append(info);
    holder.append(card);
  }

  const dl = document.getElementById("details");
  dl.replaceChildren();
  const issuerOk = federation ? v.issuer === federation : null;
  row(dl, "Sportif (adresse)", el("span", { class: "addr" }, subject));
  row(dl, "Émetteur", el("span", {}, `${short(v.issuer)} `));
  dl.lastChild.append(tag(issuerOk, "fédération reconnue", "émetteur inconnu"));
  row(dl, "Acceptée par le sportif", tag(v.reason === "absente ou révoquée" ? null : v.accepted, "oui", "non", "—"));
  row(dl, "Expirée", tag(v.reason === "absente ou révoquée" ? null : !v.expired, "non", "oui", "—"));
  row(dl, "Valable jusqu'au", el("span", {}, fmtDay(v.expiresAt)));
  row(dl, "Photo (empreinte SHA-256)", tag(v.photoHashOk, "conforme", "NON conforme", "non contrôlée"));
  row(dl, "Dernier contrôle", el("span", {}, fmtDate(v.checkedAt)));
}

const ACTIONS = {
  CredentialCreate: ["émis", "émise"],
  CredentialAccept: ["accepté par le sportif", "acceptée par le sportif"],
  CredentialDelete: ["supprimé (révoqué)", "supprimée (révoquée)"],
};
const NAMES = { CLUB_MEMBER: "Adhésion au club", LICENCE_2026: "Licence 2026" };

function renderHistory(events) {
  const ul = document.getElementById("history");
  ul.replaceChildren();
  if (!events.length) return ul.append(el("li", { class: "muted" }, "Aucune transaction."));
  for (const e of [...events].reverse()) {
    const li = el("li");
    const who = e.issuer === federation ? "fédération" : `club ${short(e.issuer)}`;
    li.append(
      el("strong", {}, `${NAMES[e.type] || e.type} ${(ACTIONS[e.action] || [e.action, e.action])[e.type === "LICENCE_2026" ? 1 : 0]}`),
      el("span", { class: "muted" }, ` · ${who} · ${fmtDate(e.date)}${e.memo ? " · " + e.memo : ""} · `),
      el("a", { href: e.link, target: "_blank", rel: "noopener" }, "voir dans l'explorateur")
    );
    ul.append(li);
  }
}

async function refresh() {
  try {
    const [p, h] = await Promise.all([
      fetch(`/api/pipeline/${subject}`).then((r) => (r.ok ? r.json() : Promise.reject(r))),
      fetch(`/api/history/${subject}`).then((r) => (r.ok ? r.json() : [])),
    ]);
    renderStatus(p.licence);
    renderPipeline(document.getElementById("pipeline"), p);
    renderHistory(h);
  } catch {
    const box = document.getElementById("status");
    box.className = "status wait";
    box.replaceChildren(el("div", { class: "big" }, "Registre indisponible"), el("div", { class: "why" }, "Nouvelle tentative…"));
  }
}

async function main() {
  if (!subject) {
    document.getElementById("status").replaceChildren(el("div", { class: "big" }, "Adresse manquante"));
    return;
  }
  const cfg = await fetch("/api/config").then((r) => r.json());
  federation = cfg.federation;
  document.getElementById("footer").append(`Réseau : ${cfg.network} · contrôle automatique toutes les ${REFRESH_MS / 1000} s`);
  await refresh();
  setInterval(refresh, REFRESH_MS);
}

main();
