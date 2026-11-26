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

  const hasMembership = !!m;
  const membershipOk = !!m && m.accepted;
  const steps = [
    { actor: "athlete", title: "Demande l'adhésion", detail: m ? "demande faite" : p.request ? `demande à ${p.request.label}` : "choisir un club", done: hasMembership || !!p.request },
    { actor: "club", title: "Valide l'adhésion", detail: membershipOk ? m.label : m ? "finalisation en cours" : p.request ? "en attente du club" : "après la demande", done: membershipOk },
    { actor: "athlete", title: "Demande la licence", detail: licenceExists ? "demande faite" : p.licenceRequest ? "demande envoyée" : membershipOk ? "à demander" : "après l'adhésion", done: licenceExists || !!p.licenceRequest },
    { actor: "federation", title: "Valide la licence", detail: licenceExists && l.accepted ? "licence émise" : licenceExists ? "finalisation en cours" : p.licenceRequest ? "en attente de la fédération" : "après la demande", done: licenceExists && l.accepted },
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
