// Accueil : le parcours de chaque athlète, mis à jour toutes les 5 secondes.
const { el: h, getJson: fetchJson } = LS;

async function renderLive() {
  try {
    const rows = await fetchJson("/api/overview");
    const live = document.getElementById("live");
    live.replaceChildren();
    for (const r of rows) {
      const box = h("div", { class: "card live-row" });
      const pipe = h("div");
      box.append(h("div", { class: "live-name" }, r.name), pipe);
      live.append(box);
      renderPipeline(pipe, r, { compact: true });
    }
  } catch {
    document.getElementById("live").textContent = "Registre indisponible, nouvelle tentative…";
  }
}

(async () => {
  const cfg = await fetchJson("/api/config");
  const footer = document.getElementById("footer");
  footer.append(`Réseau : ${cfg.network} · Fédération émettrice : `);
  footer.append(h("a", { href: cfg.federationLink, target: "_blank", rel: "noopener" }, cfg.federation));
  LS.every(5000, renderLive);
})();
