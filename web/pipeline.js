// Parcours visuel d'une licence : club -> sportif -> fédération -> sportif -> course.
// `p` = { membership, licence } renvoyé par /api/pipeline/:adresse. Texte via textContent uniquement.
function renderPipeline(container, p, { compact = false } = {}) {
  const m = p.membership;
  const l = p.licence;
  const licenceExists = l.reason !== "absente ou révoquée";

  const REASON = {
    "absente ou révoquée": "pas de licence en cours",
    "non acceptée": "en attente du sportif",
    "expirée": "expirée",
    "photo non conforme": "photo non conforme",
  };

  const steps = [
    { title: "Le club valide l'adhésion", detail: m ? m.label : "aucun club", done: !!m },
    { title: "Le sportif accepte", detail: "l'adhésion", done: !!m && m.accepted },
    { title: "La fédération émet la licence", detail: licenceExists ? "émise" : "pas encore émise", done: licenceExists },
    { title: "Le sportif accepte", detail: "la licence", done: licenceExists && l.accepted },
    { title: "Course : licence reconnue", detail: l.valid ? "quel que soit le club" : REASON[l.reason] || l.reason, done: l.valid },
  ];
  const currentIndex = steps.findIndex((s) => !s.done);

  const wrap = document.createElement("div");
  wrap.className = "pipe" + (compact ? " compact" : "");
  steps.forEach((s, i) => {
    const step = document.createElement("div");
    step.className = "step " + (s.done ? "done" : i === currentIndex ? "current" : "todo");
    const badge = document.createElement("div");
    badge.className = "badge";
    badge.textContent = s.done ? "✓" : String(i + 1);
    const title = document.createElement("div");
    title.className = "t";
    title.textContent = s.title;
    const detail = document.createElement("div");
    detail.className = "d";
    detail.textContent = s.detail;
    step.append(badge, title, detail);
    wrap.append(step);
    if (i < steps.length - 1) {
      const arrow = document.createElement("div");
      arrow.className = "arrow";
      arrow.textContent = "›";
      wrap.append(arrow);
    }
  });
  container.replaceChildren(wrap);
}
