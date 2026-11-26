// Contrôle de course : tous les inscrits, avec leur club et le statut de leur licence.
const REFRESH_MS = 5000;

function el(tag, attrs = {}, text) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

function render(rows) {
  const okCount = rows.filter((r) => r.licence.valid).length;
  const all = okCount === rows.length;
  const summary = document.getElementById("summary");
  summary.className = `status summary ${all ? "ok" : "ko"}`;
  summary.replaceChildren(
    el("div", { class: "big" }, `${okCount} / ${rows.length} licences valides`),
    el("div", { class: "why" }, all ? "Tous les coureurs sont autorisés à prendre le départ." : "Au moins un coureur n'est pas autorisé à prendre le départ.")
  );

  const box = document.getElementById("runners");
  box.replaceChildren();
  for (const r of rows) {
    const card = el("div", { class: "card runner" });
    const top = el("div", { class: "top" });
    top.append(r.licence.holder ? el("img", { src: r.licence.holder.photoUrl, alt: `Photo de ${r.name}` }) : el("div", { class: "noimg" }));

    const info = el("div");
    info.append(el("div", { class: "name" }, r.name));
    const club = el("span", { class: `tag ${r.membership ? "na" : "ko"}` }, r.membership ? r.membership.label : "sans club");
    info.append(club);
    top.append(info);

    const right = el("div", { class: "right" });
    right.append(
      el("div", { class: `go ${r.licence.valid ? "ok" : "ko"}` }, r.licence.valid ? "AUTORISÉ" : "REFUSÉ"),
      el("a", { href: `/verify.html?subject=${r.address}` }, "détail du contrôle")
    );
    top.append(right);
    card.append(top);

    const pipe = el("div");
    renderPipeline(pipe, r, { compact: true });
    card.append(pipe);
    box.append(card);
  }
  document.getElementById("footer").textContent = `Dernier contrôle : ${new Date().toLocaleTimeString("fr-FR")} · actualisation toutes les ${REFRESH_MS / 1000} s`;
}

async function refresh() {
  try {
    const rows = await fetch("/api/course").then((r) => (r.ok ? r.json() : Promise.reject(r)));
    render(rows);
  } catch {
    const s = document.getElementById("summary");
    s.className = "status wait summary";
    s.replaceChildren(el("div", { class: "big" }, "Registre indisponible"), el("div", { class: "why" }, "Nouvelle tentative…"));
  }
}

refresh();
setInterval(refresh, REFRESH_MS);
