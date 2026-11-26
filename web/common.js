// Outils communs à toutes les pages (espace de noms LS pour ne pas entrer en conflit avec les autres scripts).
// Tout texte venant du réseau passe par textContent : jamais d'innerHTML.
window.LS = (() => {
  function el(tag, attrs = {}, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) e.append(c);
    return e;
  }

  async function getJson(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Erreur serveur");
    return r.json();
  }

  async function post(path, body) {
    const r = await fetch("/api/admin" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "Erreur serveur");
    return data;
  }

  const short = (a) => (a ? `${a.slice(0, 7)}…${a.slice(-5)}` : "—");
  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString("fr-FR") : "—");
  const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "UTC" }) : "—");

  // ---- Navigation : « Accueil » + un menu déroulant qui indique le profil (catégorie) courant ----
  const GROUPS = [
    { key: "athlete", label: "Athlète", items: [
      { href: "/athlete.html", label: "Mon espace", match: ["/athlete.html"] },
    ] },
    { key: "club", label: "Club", items: [{ href: "/club.html", label: "Espace club", match: ["/club.html"] }] },
    { key: "federation", label: "Fédération", items: [{ href: "/federation.html", label: "Espace fédération", match: ["/federation.html"] }] },
    { key: "organizer", label: "Organisateur", items: [{ href: "/course.html", label: "Contrôle de course", match: ["/course.html"] }] },
  ];
  function renderNav() {
    const nav = document.getElementById("nav");
    if (!nav) return;
    const path = location.pathname;
    const current = GROUPS.find((g) => g.items.some((i) => i.match.includes(path)));
    const home = el("a", { href: "/", class: path === "/" || path === "/index.html" ? "active" : "" }, "Accueil");
    const menu = el("details", { class: "menu" },
      el("summary", { class: "menu-btn " + (current ? current.key : "") }, current ? current.label : "Choisir un profil", el("span", { class: "caret" }, " ▾")),
      el("div", { class: "menu-list" }, GROUPS.map((g) =>
        el("div", { class: "menu-group" },
          el("div", { class: "menu-title " + g.key }, g.label),
          g.items.map((i) => el("a", { href: i.href, class: i.match.includes(path) ? "active" : "" }, i.label))))));
    document.addEventListener("click", (e) => { if (!menu.contains(e.target)) menu.removeAttribute("open"); });
    nav.replaceChildren(home, menu);
  }

  // ---- Choix de la personne / du club dont on agit (mémorisé d'une page à l'autre) ----
  const remember = (k, v) => { try { localStorage.setItem("ls." + k, v); } catch {} };
  const recall = (k) => { try { return localStorage.getItem("ls." + k); } catch { return null; } };
  function profileSwitch(label, options, value, onPick) {
    const select = el("select", { "aria-label": label }, options.map((o) => el("option", { value: o.value }, o.label)));
    select.value = value;
    select.addEventListener("change", () => onPick(select.value));
    return el("div", { class: "actas" }, el("span", {}, label), select);
  }

  // ---- Pastille d'acteur (qui fait l'action) ----
  const ACTORS = { club: "Club", athlete: "Athlète", federation: "Fédération", organizer: "Organisateur" };
  const actorChip = (k) => el("span", { class: `actor ${k}` }, ACTORS[k]);

  // ---- Message d'action (toast) ----
  let toastTimer;
  function toast(text, { link, error } = {}) {
    let t = document.getElementById("toast");
    if (!t) {
      t = el("div", { id: "toast", class: "toast" });
      document.body.append(t);
    }
    t.className = "toast show " + (error ? "ko" : "ok");
    t.replaceChildren(el("strong", {}, error ? "Échec : " : "Fait : "), text + " ");
    if (link) t.append(el("a", { href: link, target: "_blank", rel: "noopener" }, "voir dans l'explorateur"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = "toast"), error ? 9000 : 12000);
  }

  // ---- Exécuter une action (désactive tout pendant la transaction) ----
  let busy = false;
  const isBusy = () => busy;
  async function act(path, body, refresh) {
    if (busy) return;
    busy = true;
    document.body.classList.add("busy");
    try {
      const r = await post(path, body);
      toast(r.label, { link: r.link });
    } catch (e) {
      toast(e.message, { error: true });
    } finally {
      busy = false;
      document.body.classList.remove("busy");
      await refresh();
    }
  }

  /** Bouton d'action ; absent si le serveur est en lecture seule. */
  function actionButton(label, { onClick, disabled, danger } = {}) {
    const b = el("button", { type: "button", class: danger ? "danger" : "" }, label);
    b.disabled = !!disabled;
    b.addEventListener("click", onClick);
    return b;
  }

  // ---- Adresse discrète : courte, en petit, avec l'adresse complète au survol et lien vers l'explorateur ----
  function addrLink(address, explorer) {
    return el("a", { class: "addr-s", href: `${explorer}/accounts/${address}`, target: "_blank", rel: "noopener", title: address }, short(address));
  }

  // ---- Historique compact : 3 lignes, "voir tout" pour déplier ----
  const HIST_NAMES = { CLUB_MEMBER: "Adhésion", LICENCE_2026: "Licence 2026" };
  const HIST_ACTIONS = {
    CredentialCreate: ["validée", "émise"],
    CredentialAccept: ["acceptée", "acceptée"],
    CredentialDelete: ["révoquée", "révoquée"],
  };
  const histOpen = {};
  function renderHistory(container, events, { key = "h", whoOf = short } = {}) {
    const list = [...events].reverse();
    const open = !!histOpen[key];
    const shown = open ? list : list.slice(0, 3);
    const toggle = el("button", { type: "button", class: "link" }, open ? "Réduire" : `Voir tout (${list.length})`);
    toggle.addEventListener("click", () => {
      histOpen[key] = !open;
      renderHistory(container, events, { key, whoOf });
    });
    container.replaceChildren(...[
      list.length
        ? el("ul", { class: "history" }, shown.map((e) => {
            const g = e.type === "LICENCE_2026" ? 1 : 0;
            return el("li", {},
              el("span", { class: "h-when" }, fmtDate(e.date)),
              el("span", { class: "h-what" }, `${HIST_NAMES[e.type] || e.type} ${(HIST_ACTIONS[e.action] || [e.action, e.action])[g]}`),
              el("span", { class: "h-who muted" }, whoOf(e.issuer, e)),
              el("a", { href: e.link, target: "_blank", rel: "noopener", title: "Voir la transaction dans l'explorateur" }, "↗"));
          }))
        : el("p", { class: "muted small" }, "Aucune transaction."),
      list.length > 3 ? toggle : null
    ].filter(Boolean));
  }

  // ---- Barre de recherche + filtres (listes d'athlètes) ----
  const norm = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  function toolbar({ placeholder, onChange }) {
    const state = { q: "", filter: "all", limit: 6 };
    const input = el("input", { type: "search", class: "search", placeholder, "aria-label": placeholder });
    input.addEventListener("input", () => { state.q = input.value; state.limit = 6; onChange(); });
    const chips = el("div", { class: "chips" });
    function setFilters(list) {
      chips.replaceChildren(...list.map((f) => {
        const b = el("button", { type: "button", class: "chip" + (state.filter === f.key ? " active" : "") }, `${f.label} (${f.count})`);
        b.addEventListener("click", () => { state.filter = f.key; state.limit = 6; onChange(); });
        return b;
      }));
    }
    return { state, input, chips, setFilters, matches: (name) => !state.q || norm(name).includes(norm(state.q)) };
  }

  // Rafraîchissement régulier, en évitant de reconstruire la page pendant une transaction.
  function every(ms, fn) {
    fn();
    setInterval(() => !busy && fn(), ms);
  }

  document.addEventListener("DOMContentLoaded", renderNav);
  return { remember, recall, profileSwitch, toolbar, norm, addrLink, renderHistory, el, getJson, post, short, fmtDate, fmtDay, renderNav, actorChip, toast, act, actionButton, every, isBusy };
})();
