// Parcours visuel d'une licence : chaque étape indique QUI agit (club, athlète, fédération, organisateur).
// `p` = { membership, licence } renvoyé par l'API. Texte via textContent uniquement.
function renderPipeline(container, p, { compact = false } = {}) {
  const m = p.membership;
  const l = p.licence;
  const licenceExists = l.reason !== "absente ou révoquée";

  const REASON = {
    "absente ou révoquée": "pas de licence en cours",
    "non acceptée": "en attente de l'athlète",
    "expirée": "expirée",
    "photo non conforme": "photo non conforme",
  };
  const ACTOR = { club: "Club", athlete: "Athlète", federation: "Fédération", organizer: "Organisateur" };

  const steps = [
    { actor: "club", title: "Valide l'adhésion", detail: m ? m.label : p.request ? `demande envoyée à ${p.request.label}` : "aucun club", done: !!m },
    { actor: "athlete", title: "Accepte l'adhésion", detail: m && m.accepted ? "consentement donné" : "consentement requis", done: !!m && m.accepted },
    { actor: "federation", title: "Émet la licence", detail: licenceExists ? "licence émise" : "pas encore émise", done: licenceExists },
    { actor: "athlete", title: "Accepte la licence", detail: licenceExists && l.accepted ? "consentement donné" : "consentement requis", done: licenceExists && l.accepted },
    { actor: "organizer", title: "Contrôle de course", detail: l.valid ? "reconnue, quel que soit le club" : REASON[l.reason] || l.reason, done: l.valid },
  ];
  const currentIndex = steps.findIndex((s) => !s.done);

  const wrap = document.createElement("div");
  wrap.className = "pipe" + (compact ? " compact" : "");
  steps.forEach((s, i) => {
    const step = document.createElement("div");
    step.className = "step " + (s.done ? "done" : i === currentIndex ? "current" : "todo");

    const actor = document.createElement("div");
    actor.className = `actor ${s.actor}`;
    actor.textContent = ACTOR[s.actor];

    const badge = document.createElement("div");
    badge.className = "badge";
    badge.textContent = s.done ? "✓" : String(i + 1);

    const title = document.createElement("div");
    title.className = "t";
    title.textContent = s.title;

    const detail = document.createElement("div");
    detail.className = "d";
    detail.textContent = i === currentIndex ? `à faire · ${s.detail}` : s.detail;

    step.append(actor, badge, title, detail);
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
