// Page de gestion de la démo. Le navigateur n'envoie que des noms de rôles ; le serveur signe.
const $ = (id) => document.getElementById(id);
const buttons = [...document.querySelectorAll("button")];
let athletes = [];
let state = null;

function el(tag, attrs = {}, text) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

async function api(path, body) {
  const r = await fetch("/api/admin" + path, body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : undefined);
  const data = await r.json().catch(() => ({}));
  if (r.status === 404) $("disabled").hidden = false;
  if (!r.ok) throw new Error(data.error || "Erreur serveur");
  return data;
}

function log(text, link, isError) {
  const ul = $("log");
  if (ul.firstChild && ul.firstChild.classList.contains("muted")) ul.replaceChildren();
  const li = el("li");
  li.append(el("span", { class: `tag ${isError ? "ko" : "ok"}` }, isError ? "échec" : "ok"), el("span", {}, " " + new Date().toLocaleTimeString("fr-FR") + " · " + text + " "));
  if (link) li.append(el("a", { href: link, target: "_blank", rel: "noopener" }, "voir dans l'explorateur"));
  ul.prepend(li);
}

function stateTag(s) {
  if (!s) return el("span", { class: "tag na" }, "aucune");
  return s.accepted ? el("span", { class: "tag ok" }, "acceptée") : el("span", { class: "tag ko" }, "émise, en attente d'acceptation");
}

function render() {
  const dl = $("state");
  dl.replaceChildren();
  const rows = [
    ["Adhésion club A", state.memberships.clubA],
    ["Adhésion club B", state.memberships.clubB],
    ["Licence 2026-2027", state.licence],
  ];
  for (const [label, s] of rows) {
    dl.append(el("dt", {}, label));
    const dd = el("dd");
    dd.append(stateTag(s));
    dl.append(dd);
  }

  const club = $("club").value;
  const m = state.memberships[club];
  const anyMembership = Object.values(state.memberships).some((s) => s && s.accepted);
  $("btnIssueMembership").disabled = !!m;
  $("btnRevokeMembership").disabled = !m;
  $("btnAcceptMembership").disabled = !m || m.accepted;
  $("btnIssueLicence").disabled = !!state.licence || !anyMembership;
  $("btnSuspend").disabled = !state.licence;
  $("btnAcceptLicence").disabled = !state.licence || state.licence.accepted;
}

async function refresh() {
  try {
    state = await api("/status/" + $("athlete").value);
    $("verifyLink").href = "/verify.html?subject=" + state.address;
    render();
    // Parcours visuel lu dans le registre (peut être un peu en retard sur l'état ci-dessus).
    fetch("/api/pipeline/" + state.address).then((r) => r.json()).then((p) => renderPipeline($("pipeline"), p)).catch(() => {});
  } catch (e) {
    log(e.message, null, true);
  }
}

async function run(path, body) {
  buttons.forEach((b) => (b.disabled = true));
  try {
    const r = await api(path, { athlete: $("athlete").value, club: $("club").value, motif: $("motif").value, ...body });
    log(r.label, r.link);
  } catch (e) {
    log(e.message, null, true);
  }
  await refresh();
}

async function main() {
  athletes = await fetch("/api/athletes").then((r) => r.json());
  for (const a of athletes) $("athlete").append(el("option", { value: a.role }, a.name));
  $("athlete").addEventListener("change", refresh);
  $("club").addEventListener("change", () => state && render());

  $("btnIssueMembership").onclick = () => run("/club/issue");
  $("btnRevokeMembership").onclick = () => run("/club/revoke");
  $("btnIssueLicence").onclick = () => run("/federation/issue-licence");
  $("btnSuspend").onclick = () => run("/federation/suspend");
  $("btnAcceptMembership").onclick = () => run("/athlete/accept", { kind: "membership" });
  $("btnAcceptLicence").onclick = () => run("/athlete/accept", { kind: "licence" });

  await refresh();
}

main();
