// Espace athlète : c'est LUI qui demande son adhésion puis sa licence. Il suit ensuite le parcours.
const { el, getJson, actorChip, act, actionButton, fmtDay, addrLink, renderHistory, profileSwitch, remember, recall } = LS;

let cfg = null;
let athletes = [];
let role = new URLSearchParams(location.search).get("athlete") || recall("athlete");
let chosenClub = null; // choix du club conservé entre deux rafraîchissements

function licenceCard(row) {
  const l = row.licence;
  const why = l.valid
    ? `Valable jusqu'au ${fmtDay(l.expiresAt)}`
    : { "absente ou révoquée": "Pas de licence en cours.", "non acceptée": "En attente de votre accord.", "expirée": "Licence expirée.", "photo non conforme": "Photo non conforme." }[l.reason] || l.reason;
  return el("div", { class: "card licence" },
    el("div", { class: "licence-main" },
      el("img", { src: row.photoUrl, alt: `Photo de ${row.name}`, class: "mine" }),
      el("div", {},
        el("div", { class: "holder-name" }, row.name),
        el("div", { class: `verdict ${l.valid ? "ok" : "ko"}` }, l.valid ? "Licence valide" : "Licence non valide"),
        el("div", { class: "muted" }, why),
        el("div", { class: "small muted" }, "Adresse : ", addrLink(row.address, cfg.explorer)))),
    el("div", { class: "licence-qr" },
      el("img", { class: "qr", src: `/api/qr/${row.address}`, alt: `QR code de ${row.name}` }),
      el("a", { class: "btn", href: `/verify.html?subject=${row.address}` }, "Vue du contrôleur"),
      el("div", { class: "tiny muted", title: `Le QR code ouvre ${cfg.baseUrl}` }, "* même Wi-Fi requis")
    )
  );
}

// Étape 1 : je choisis mon club et je demande l'adhésion (hors chaîne). Le club valide ensuite.
function clubCard(row) {
  const memberships = Object.entries(row.memberships).filter(([, m]) => m);
  const lines = memberships.map(([club, m]) => {
    return el("div", { class: "club-line" }, el("strong", {}, m.label), " ", el("span", { class: `tag ${m.accepted ? "ok" : "ko"}` }, m.accepted ? "adhérent" : "finalisation en cours"));
  });

  let ask = null;
  if (row.request) {
    ask = el("div", { class: "club-line" },
      "Demande envoyée à ", el("strong", {}, row.request.label), " : en attente de la validation du club. ",
      actionButton("Annuler", { danger: true, onClick: () => act("/athlete/cancel-request", { athlete: role, what: "club" }, render), disabled: !cfg.admin }));
  } else {
    const options = Object.entries(cfg.clubs).filter(([k]) => !row.memberships[k]);
    if (options.length) {
      const select = el("select", { "aria-label": "Choisir un club" }, options.map(([k, c]) => el("option", { value: k }, c.label)));
      if (options.some(([k]) => k === chosenClub)) select.value = chosenClub;
      select.addEventListener("change", () => (chosenClub = select.value));
      ask = el("div", { class: "club-line" }, select,
        actionButton(memberships.length ? "Demander à changer de club" : "Demander l'adhésion", {
          onClick: () => act("/athlete/request", { athlete: role, club: select.value }, render), disabled: !cfg.admin }));
    }
  }
  return el("div", { class: "card" },
    lines.length ? lines : el("p", { class: "muted", style: "margin:0 0 10px" }, "Vous n'êtes membre d'aucun club."),
    ask);
}

// Étape 2 : une fois adhérent, je demande ma licence. La fédération valide ensuite.
function licenceRequestCard(row) {
  const l = row.licence;
  const hasMembership = Object.values(row.memberships).some((m) => m && m.valid);
  let body;
  if (l.valid) {
    body = el("p", { style: "margin:0" }, "Votre licence est valide jusqu'au ", el("strong", {}, fmtDay(l.expiresAt)), ".");
  } else if (l.reason === "non acceptée") {
    body = el("p", { style: "margin:0" }, "Licence validée : finalisation en cours…");
  } else if (row.licenceRequest) {
    body = el("div", { class: "club-line" }, "Demande envoyée à la fédération : en attente de sa validation. ",
      actionButton("Annuler", { danger: true, onClick: () => act("/athlete/cancel-request", { athlete: role, what: "licence" }, render), disabled: !cfg.admin }));
  } else if (hasMembership) {
    body = el("div", { class: "club-line" }, "Votre adhésion est validée. ",
      actionButton("Demander ma licence", { onClick: () => act("/athlete/request-licence", { athlete: role }, render), disabled: !cfg.admin }));
  } else {
    body = el("p", { class: "muted", style: "margin:0" }, "Disponible dès qu'un club aura validé votre adhésion.");
  }
  return el("div", { class: "card" }, body,
    el("div", { class: "small muted", style: "margin-top:10px" }, "En faisant une demande, vous donnez votre accord : votre signature est enregistrée automatiquement quand le club ou la fédération valide."));
}

async function render() {
  const rows = await getJson("/api/overview");
  const row = rows.find((r) => r.role === role);
  const events = await getJson(`/api/history/${row.address}`).catch(() => []);

  const whoOf = (addr) => (addr === cfg.federation ? "Fédération" : Object.values(cfg.clubs).find((c) => c.address === addr)?.label || "Club");
  const hist = el("div");
  renderHistory(hist, events, { key: "athlete-" + role, whoOf });
  const pipe = el("div");
  renderPipeline(pipe, row);

  document.getElementById("page").replaceChildren(
    el("h1", {}, "Espace athlète ", actorChip("athlete")),
    profileSwitch("Vous agissez en tant que", athletes.map((a) => ({ value: a.role, label: a.name })), role, (v) => { remember("athlete", v); location.search = `?athlete=${v}`; }),
    licenceCard(row),
    el("h2", {}, "1 · Mon club"),
    clubCard(row),
    el("h2", {}, "2 · Ma licence"),
    licenceRequestCard(row),
    el("h2", {}, "Mon parcours"),
    pipe,
    el("h2", {}, "Historique"),
    el("div", { class: "card compact-card" }, hist)
  );
}

(async () => {
  [cfg, athletes] = await Promise.all([getJson("/api/config"), getJson("/api/athletes")]);
  if (!athletes.some((a) => a.role === role)) role = athletes[0].role;
  remember("athlete", role);
  LS.every(5000, () => render().catch(() => {}));
})();
