// Espace club : demandes d'adhésion reçues, adhérents, recherche d'un athlète.
const { el, getJson, actorChip, act, actionButton, addrLink, profileSwitch, remember, recall } = LS;

let cfg = null;
let club = new URLSearchParams(location.search).get("club") || recall("club");
let rowsCache = [];
const list = el("div");
const bar = LS.toolbar({ placeholder: "Rechercher un athlète par nom…", onChange: () => draw() });

/** État de l'athlète vis-à-vis de CE club. */
function stateOf(r) {
  const m = r.memberships[club];
  if (m) return m.accepted ? "member" : "pending";
  return r.request && r.request.club === club ? "request" : "none";
}
const ORDER = { request: 0, pending: 1, member: 2, none: 3 };

function tag(kind, text) {
  return el("span", { class: `tag ${kind}` }, text);
}

function person(r, st) {
  const statusTag = { member: tag("ok", "Adhérent"), pending: tag("ko", "En attente de l'athlète"), request: tag("ko", "Demande d'adhésion"), none: tag("na", "Pas adhérent") }[st];
  const buttons = [];
  if (st === "request") {
    buttons.push(actionButton("Valider l'adhésion", { onClick: () => act("/club/issue", { club, athlete: r.role }, refresh), disabled: !cfg.admin }));
    buttons.push(actionButton("Refuser", { danger: true, onClick: () => act("/club/decline", { club, athlete: r.role }, refresh), disabled: !cfg.admin }));
  } else {
    buttons.push(actionButton(st === "member" ? "Révoquer (départ)" : "Annuler", { danger: true, onClick: () => act("/club/revoke", { club, athlete: r.role }, refresh), disabled: !cfg.admin }));
  }
  const otherClub = Object.entries(r.memberships).find(([k, m]) => k !== club && m && m.accepted);
  return el("div", { class: "card row" },
    el("img", { src: r.photoUrl, alt: `Photo de ${r.name}`, class: "thumb" }),
    el("div", { class: "row-main" },
      el("div", { class: "person-name" }, r.name),
      el("div", {}, statusTag, " ", r.licence.valid ? tag("ok", "Licence valide") : tag("na", "Sans licence valide")),
      otherClub ? el("div", { class: "small muted" }, `Adhérent aussi de ${otherClub[1].label}.`) : null),
    el("div", { class: "person-actions" }, buttons));
}

function draw() {
  // Un club ne voit que les athlètes liés à lui : demandeurs, adhésions en attente, adhérents.
  const withState = rowsCache.map((r) => ({ r, st: stateOf(r) })).filter((x) => x.st !== "none");
  const count = (st) => withState.filter((x) => x.st === st).length;
  bar.setFilters([
    { key: "all", label: "Tous", count: withState.length },
    { key: "request", label: "Demandes", count: count("request") },
    { key: "pending", label: "En attente de l'athlète", count: count("pending") },
    { key: "member", label: "Adhérents", count: count("member") },
  ]);

  const visible = withState
    .filter((x) => (bar.state.filter === "all" || x.st === bar.state.filter) && bar.matches(x.r.name))
    .sort((a, b) => ORDER[a.st] - ORDER[b.st] || a.r.name.localeCompare(b.r.name));

  const shown = visible.slice(0, bar.state.limit);
  list.replaceChildren(
    ...[...shown.map((x) => person(x.r, x.st)),
    visible.length === 0 ? el("p", { class: "muted" }, withState.length ? "Aucun athlète ne correspond." : "Aucune demande ni adhérent pour l'instant. Les athlètes demandent à rejoindre le club depuis leur espace.") : null,
    visible.length > shown.length
      ? (() => { const b = el("button", { type: "button", class: "link" }, `Voir plus (${visible.length - shown.length})`); b.addEventListener("click", () => { bar.state.limit += 6; draw(); }); return b; })()
      : null].filter(Boolean)
  );
}

async function refresh() {
  rowsCache = await getJson("/api/overview");
  draw();
}

(async () => {
  cfg = await getJson("/api/config");
  if (!cfg.clubs[club]) club = Object.keys(cfg.clubs)[0];
  remember("club", club);
  const info = cfg.clubs[club];

  // Le cadre (recherche, filtres) est construit une seule fois : seule la liste est rafraîchie,
  // pour ne pas perdre le texte saisi ni le focus.
  document.getElementById("page").replaceChildren(
    el("h1", {}, info.label + " ", actorChip("club")),
    profileSwitch("Vous agissez en tant que", Object.entries(cfg.clubs).map(([k, c]) => ({ value: k, label: c.label })), club, (v) => { remember("club", v); location.search = `?club=${v}`; }),
    el("div", { class: "card" },
      el("p", { class: "lead", style: "margin:0 0 8px" }, "C'est l'athlète qui choisit son club et envoie une demande. Le club la valide ou la refuse ; en cas de validation, la signature de l'athlète (son consentement) est enregistrée automatiquement."),
      el("div", { class: "small muted" }, "Adresse du club : ", addrLink(info.address, cfg.explorer))),
    el("h2", {}, "Demandes et adhérents"),
    el("div", { class: "toolbar" }, bar.input, bar.chips),
    list
  );
  LS.every(5000, () => refresh().catch(() => {}));
})();
