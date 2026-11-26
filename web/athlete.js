// Espace athlète : mon club, mes demandes à accepter, ma licence + QR code, mon parcours, mon historique.
const { el, getJson, actorChip, act, actionButton, fmtDay, addrLink, renderHistory } = LS;

let cfg = null;
let athletes = [];
let role = new URLSearchParams(location.search).get("athlete");
let chosenClub = null; // choix du club conservé entre deux rafraîchissements

function tabs() {
  return el("div", { class: "tabs" }, athletes.map((a) =>
    el("a", { href: `/athlete.html?athlete=${a.role}`, class: a.role === role ? "active" : "" }, a.name)
  ));
}

function licenceCard(row) {
  const l = row.licence;
  const why = l.valid
    ? `Valable jusqu'au ${fmtDay(l.expiresAt)}`
    : { "absente ou révoquée": "Pas de licence en cours.", "non acceptée": "En attente de votre acceptation.", "expirée": "Licence expirée.", "photo non conforme": "Photo non conforme." }[l.reason] || l.reason;
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

// Mon club : l'athlète choisit son club (demande hors chaîne), le club valide ensuite.
function clubCard(row, refresh) {
  const memberships = Object.entries(row.memberships).filter(([, m]) => m);
  const lines = memberships.map(([, m]) =>
    el("div", { class: "club-line" }, el("strong", {}, m.label), " ", el("span", { class: `tag ${m.accepted ? "ok" : "ko"}` }, m.accepted ? "adhérent" : "en attente de mon accord")));

  let ask;
  if (row.request) {
    ask = el("div", { class: "club-line" },
      `Demande envoyée à `, el("strong", {}, row.request.label), " : en attente de la validation du club. ",
      actionButton("Annuler", { danger: true, onClick: () => act("/athlete/cancel-request", { athlete: role }, render), disabled: !cfg.admin }));
  } else {
    const options = Object.entries(cfg.clubs).filter(([k]) => !row.memberships[k]);
    if (!options.length) {
      ask = null;
    } else {
      const select = el("select", { "aria-label": "Choisir un club" }, options.map(([k, c]) => el("option", { value: k }, c.label)));
      if (options.some(([k]) => k === chosenClub)) select.value = chosenClub;
      select.addEventListener("change", () => (chosenClub = select.value));
      ask = el("div", { class: "club-line" }, select,
        actionButton(memberships.length ? "Demander à changer de club" : "Demander à rejoindre", {
          onClick: () => act("/athlete/request", { athlete: role, club: select.value }, render), disabled: !cfg.admin }));
    }
  }
  return el("div", { class: "card" }, lines.length ? lines : el("p", { class: "muted", style: "margin:0 0 10px" }, "Vous n'êtes membre d'aucun club."), ask);
}

function pendingCard(row, refresh) {
  const items = [];
  for (const [club, m] of Object.entries(row.memberships)) {
    if (m && !m.accepted) {
      items.push({
        title: `Adhésion proposée par ${m.label}`,
        call: () => act("/athlete/accept", { athlete: row.role, kind: "membership", club }, refresh),
      });
    }
  }
  if (row.licence.reason === "non acceptée") {
    items.push({
      title: "Licence émise par la fédération",
      call: () => act("/athlete/accept", { athlete: row.role, kind: "licence" }, refresh),
    });
  }
  return el("div", { class: "card" },
    items.length
      ? items.map((it) => el("div", { class: "ask" }, el("strong", {}, it.title), actionButton("Accepter", { onClick: it.call, disabled: !cfg.admin })))
      : el("p", { class: "muted", style: "margin:0" }, "Rien à accepter pour l'instant."),
    el("div", { class: "small muted", style: "margin-top:10px" }, "Personne ne peut rattacher une adhésion ou une licence à votre adresse sans votre accord : tant que vous n'avez pas accepté, elle n'est pas valide.")
  );
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
    tabs(),
    licenceCard(row),
    el("h2", {}, "Mon club"),
    clubCard(row, render),
    el("h2", {}, "À accepter"),
    pendingCard(row, render),
    el("h2", {}, "Mon parcours"),
    pipe,
    el("h2", {}, "Historique"),
    el("div", { class: "card compact-card" }, hist)
  );
}

(async () => {
  [cfg, athletes] = await Promise.all([getJson("/api/config"), getJson("/api/athletes")]);
  if (!athletes.some((a) => a.role === role)) role = athletes[0].role;
  LS.every(5000, () => render().catch(() => {}));
})();
