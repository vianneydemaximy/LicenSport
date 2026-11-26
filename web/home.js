// Page d'accueil : liste des sportifs de démonstration avec leur QR code.
function el(tag, attrs = {}, text) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

async function main() {
  const [athletes, cfg] = await Promise.all([
    fetch("/api/athletes").then((r) => r.json()),
    fetch("/api/config").then((r) => r.json()),
  ]);

  const grid = document.getElementById("athletes");
  grid.replaceChildren();
  for (const a of athletes) {
    const card = el("div", { class: "card athlete" });
    card.append(
      el("h2", {}, a.name),
      el("img", { class: "qr", src: `/api/qr/${a.address}`, alt: `QR code de ${a.name}` }),
      el("div", { class: "addr" }, a.address),
      el("a", { class: "btn", href: `/verify.html?subject=${a.address}` }, "Contrôler la licence")
    );
    grid.append(card);
  }

  const phone = document.getElementById("phone");
  phone.hidden = false;
  phone.textContent = `Les QR codes ouvrent ${cfg.baseUrl}. Pour les scanner avec un téléphone, il doit être sur le même Wi-Fi que cet ordinateur.`;

  const footer = document.getElementById("footer");
  footer.append(`Réseau : ${cfg.network} · Fédération émettrice : `);
  footer.append(el("a", { href: cfg.federationLink, target: "_blank", rel: "noopener" }, cfg.federation));
}

main().catch(() => {
  document.getElementById("athletes").textContent = "Impossible de charger les données.";
});
