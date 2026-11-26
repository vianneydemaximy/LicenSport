// Espace fédération : valide (ou refuse) les demandes de licence des athlètes adhérents, et peut suspendre.
const { el, getJson, actorChip, act, actionButton, addrLink } = LS;

let cfg = null;
let rowsCache = [];
let motifValue = "SUSP_DISCIPLINE";
const list = el("div");
const bar = LS.toolbar({ placeholder: "Rechercher un athlète par nom…", onChange: () => draw() });

function tag(kind, text) {
  return el("span", { class: `tag ${kind}` }, text);
}

/** État vu par la fédération : licence valide, en attente de l'athlète, demande reçue, ou rien. */
function stateOf(r) {
  if (r.licence.valid) return "licensed";
  if (r.licence.reason === "non acceptée") return "pending";
  if (r.licenceRequest) return "request";
  if (r.licence.reason !== "absente ou révoquée") return "other";
  return "none";
}
const ORDER = { request: 0, pending: 1, licensed: 2, other: 3, none: 4 };

function person(r, st) {
  const hasMembership = Object.values(r.memberships).some((m) => m && m.valid);
  const status = { request: tag("ko", "Demande de licence"), pending: tag("ko", "En attente de l'athlète"), licensed: tag("ok", "Licence valide"), other: tag("ko", r.licence.reason), none: tag("na", "Pas de licence") }[st];

  const clubs = Object.entries(cfg.clubs).map(([k, c]) => {
    const m = r.memberships[k];
    return el("span", { class: "inline" }, `${c.label} : `, !m ? tag("na", "non adhérent") : m.valid ? tag("ok", "adhérent") : tag("ko", "en attente"));
  });

  const actions = [];
  if (st === "request") {
    actions.push(
      actionButton("Valider la licence", { onClick: () => act("/federation/issue-licence", { athlete: r.role }, refresh), disabled: !cfg.admin || !hasMembership }),
      actionButton("Refuser", { danger: true, onClick: () => act("/federation/decline", { athlete: r.role }, refresh), disabled: !cfg.admin }));
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
      st === "request" && !hasMembership ? el("div", { class: "small muted" }, "Son adhésion à un club n'est plus valide : la licence ne peut pas être validée.") : null),
    el("div", { class: "person-actions" }, actions));
}

function draw() {
  // La fédération ne voit que les athlètes qui ont demandé une licence ou en détiennent une.
  const withState = rowsCache.map((r) => ({ r, st: stateOf(r) })).filter((x) => x.st !== "none");
  const count = (...sts) => withState.filter((x) => sts.includes(x.st)).length;
  bar.setFilters([
    { key: "all", label: "Tous", count: withState.length },
    { key: "request", label: "Demandes", count: count("request") },
    { key: "pending", label: "En attente de l'athlète", count: count("pending") },
    { key: "licensed", label: "Licences valides", count: count("licensed") },
  ]);

  const visible = withState
    .filter((x) => (bar.state.filter === "all" || x.st === bar.state.filter) && bar.matches(x.r.name))
    .sort((a, b) => ORDER[a.st] - ORDER[b.st] || a.r.name.localeCompare(b.r.name));
  const shown = visible.slice(0, bar.state.limit);

  list.replaceChildren(...[
    ...shown.map((x) => person(x.r, x.st)),
    visible.length === 0 ? el("p", { class: "muted" }, withState.length ? "Aucun athlète ne correspond." : "Aucune demande de licence pour l'instant. Les athlètes adhérents la demandent depuis leur espace.") : null,
    visible.length > shown.length
      ? (() => { const b = el("button", { type: "button", class: "link" }, `Voir plus (${visible.length - shown.length})`); b.addEventListener("click", () => { bar.state.limit += 6; draw(); }); return b; })()
      : null,
  ].filter(Boolean));
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
      el("p", { class: "lead", style: "margin:0 0 8px" }, "Les athlètes adhérents d'un club demandent leur licence. La fédération la valide si l'adhésion est valide, ou la refuse. Elle peut ensuite la suspendre : tous les contrôles la refusent aussitôt."),
      el("div", { class: "small muted" }, "Fédération : ", addrLink(cfg.federation, cfg.explorer), " · Clubs affiliés : ",
        Object.values(cfg.clubs).map((c, i) => [i ? " · " : "", el("a", { href: c.link, target: "_blank", rel: "noopener" }, c.label)]).flat())),
    el("h2", {}, "Demandes et licences"),
    el("div", { class: "toolbar" }, bar.input, bar.chips),
    list
  );
  LS.every(5000, () => refresh().catch(() => {}));
})();
