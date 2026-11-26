// Espace fédération : émettre la licence (si l'adhésion est valide) ou la suspendre. Recherche et filtres.
const { el, getJson, actorChip, act, actionButton, addrLink } = LS;

let cfg = null;
let rowsCache = [];
let motifValue = "SUSP_DISCIPLINE";
const list = el("div");
const bar = LS.toolbar({ placeholder: "Rechercher un athlète par nom…", onChange: () => draw() });

function tag(kind, text) {
  return el("span", { class: `tag ${kind}` }, text);
}

/** État pour la fédération : licence valide, en attente de l'athlète, à émettre, ou sans adhésion valide. */
function stateOf(r) {
  if (r.licence.valid) return "licensed";
  if (r.licence.reason === "non acceptée") return "pending";
  if (r.licence.reason === "absente ou révoquée") return Object.values(r.memberships).some((m) => m && m.valid) ? "toissue" : "nomember";
  return "other";
}
const ORDER = { toissue: 0, pending: 1, licensed: 2, nomember: 3, other: 4 };

function person(r, st) {
  const licenceExists = st === "licensed" || st === "pending" || st === "other";
  const status = { licensed: tag("ok", "Licence valide"), pending: tag("ko", "Licence en attente de l'athlète"), toissue: tag("na", "Pas de licence"), nomember: tag("na", "Pas de licence"), other: tag("ko", r.licence.reason) }[st];

  const clubs = Object.entries(cfg.clubs).map(([k, c]) => {
    const m = r.memberships[k];
    return el("span", { class: "inline" }, `${c.label} : `, !m ? tag("na", "non adhérent") : m.valid ? tag("ok", "adhérent") : tag("ko", "en attente"));
  });

  const actions = [];
  if (!licenceExists) {
    actions.push(actionButton("Émettre la licence", { onClick: () => act("/federation/issue-licence", { athlete: r.role }, refresh), disabled: !cfg.admin || st !== "toissue" }));
  } else {
    const motif = el("select", { "aria-label": "Motif de suspension" },
      el("option", { value: "SUSP_DISCIPLINE" }, "Motif : disciplinaire"),
      el("option", { value: "SUSP_ADMINISTRATIVE" }, "Motif : administratif"));
    motif.value = motifValue;
    motif.addEventListener("change", () => (motifValue = motif.value));
    actions.push(motif, actionButton("Suspendre", { danger: true, onClick: () => act("/federation/suspend", { athlete: r.role, motif: motif.value }, refresh), disabled: !cfg.admin }));
  }

  return el("div", { class: "card row" },
    el("img", { src: r.photoUrl, alt: `Photo de ${r.name}`, class: "thumb" }),
    el("div", { class: "row-main" },
      el("div", { class: "person-name" }, r.name),
      status,
      el("div", { class: "small muted" }, clubs),
      st === "nomember" ? el("div", { class: "small muted" }, "Il faut d'abord qu'un club affilié valide l'adhésion et que l'athlète l'accepte.") : null),
    el("div", { class: "person-actions" }, actions));
}

function draw() {
  const withState = rowsCache.map((r) => ({ r, st: stateOf(r) }));
  const count = (...sts) => withState.filter((x) => sts.includes(x.st)).length;
  bar.setFilters([
    { key: "all", label: "Tous", count: withState.length },
    { key: "toissue", label: "À émettre", count: count("toissue") },
    { key: "pending", label: "En attente de l'athlète", count: count("pending") },
    { key: "licensed", label: "Licences valides", count: count("licensed") },
    { key: "nomember", label: "Sans adhésion", count: count("nomember") },
  ]);

  const visible = withState
    .filter((x) => (bar.state.filter === "all" || x.st === bar.state.filter) && bar.matches(x.r.name))
    .sort((a, b) => ORDER[a.st] - ORDER[b.st] || a.r.name.localeCompare(b.r.name));
  const shown = visible.slice(0, bar.state.limit);

  list.replaceChildren(
    ...[...shown.map((x) => person(x.r, x.st)),
    visible.length === 0 ? el("p", { class: "muted" }, "Aucun athlète ne correspond.") : null,
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
  document.getElementById("page").replaceChildren(
    el("h1", {}, "Espace fédération ", actorChip("federation")),
    el("div", { class: "card" },
      el("p", { class: "lead", style: "margin:0 0 8px" }, "La fédération n'émet une licence que si un club affilié a validé l'adhésion et que l'athlète l'a acceptée. Elle peut ensuite la suspendre : tous les contrôles la refusent aussitôt."),
      el("div", { class: "small muted" }, "Fédération : ", addrLink(cfg.federation, cfg.explorer), " · Clubs affiliés : ",
        Object.values(cfg.clubs).map((c, i) => [i ? " · " : "", el("a", { href: c.link, target: "_blank", rel: "noopener" }, c.label)]).flat())),
    el("h2", {}, "Athlètes"),
    el("div", { class: "toolbar" }, bar.input, bar.chips),
    list
  );
  LS.every(5000, () => refresh().catch(() => {}));
})();
