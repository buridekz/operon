// SterileVoice concept prototype: OR wall board, voice-led time-out, read-back log,
// allergy guard, specialist patch-in and auto-drafted record.
// Every view is a pure function of case time t (seconds), so the same code drives the
// interactive prototype and each frame of the pitch video.

const LINES = [
  // Time-out: a skipped item blocks completion.
  { t: 0.0, who: "sv", text: "Time out. Surgeon, is the site marked?" },
  { t: 1.2, who: "dr", text: "Skip it, let's start." },
  { t: 1.9, who: "alert", text: "Time out not complete: site marking not confirmed." },
  { t: 3.6, who: "dr", text: "Site marked, left thigh. Confirmed." },
  { t: 4.8, who: "sv", text: "Time out complete." },
  // During surgery: read-back, then the allergy guard.
  { t: 7.0, who: "dr", text: "SterileVoice, tourniquet on, left thigh." },
  { t: 7.8, who: "sv", text: "Tourniquet, left thigh, 14:22. Confirm?" },
  { t: 8.9, who: "dr", text: "Confirmed." },
  { t: 9.4, who: "dr", text: "Give ampicillin." },
  { t: 10.0, who: "alert", text: "Caution: penicillin allergy recorded at sign-in." },
  // Specialist patch-in, later in the case.
  { t: 12.6, who: "dr", text: "SterileVoice, call vascular." },
  { t: 13.1, who: "sv", text: "Calling Dr. Valdez, vascular." },
  { t: 13.9, who: "sv", text: "Dr. Valdez: 58-year-old male, left femoral bleed. Tourniquet 22 minutes. Penicillin allergy." },
];
const T = {
  blocked: 1.9, siteOk: 3.6, timeoutDone: 4.8,
  tqLogged: 8.9, allergy: 10.0,
  skip: 12.6, ring: 13.1, connected: 13.7,
};
const CHECKLIST = [
  { item: "Patient & procedure", pre: true },
  { item: "Site marked", pre: false },
  { item: "Antibiotic within 60 min", pre: true },
  { item: "Anticipated critical events", pre: true },
];
const LOG = [
  { at: T.timeoutDone, tm: "14:20", ev: "Time-out complete", ok: "✓ all items" },
  { at: T.tqLogged, tm: "14:22", ev: "Tourniquet on, left thigh", ok: "✓ confirmed" },
  { at: T.allergy, tm: "14:23", ev: "Ampicillin held: allergy", ok: "✓ spoken" },
  { at: T.connected, tm: "14:44", ev: "Vascular consult", ok: "● live" },
];
const RECORD = [
  ["14:20", "Time-out complete · site marking re-confirmed before incision"],
  ["14:22", "Tourniquet on · left thigh · read back, confirmed"],
  ["14:23", "Ampicillin held · penicillin allergy recorded at sign-in"],
  ["14:44", "Vascular consult · Dr. Valdez · briefed from case log"],
  ["15:31", "Tourniquet off · left thigh · read back, confirmed"],
];
const WHO = { dr: "Dr. Santos", sv: "SterileVoice", alert: "SterileVoice · alert" };

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (x) => 1 - Math.pow(1 - clamp(x), 3);
const pad2 = (n) => String(Math.floor(n)).padStart(2, "0");

// ---------- OR wall board ----------
function mountBoard(root) {
  root.innerHTML = `
    <div class="board">
      <div class="bar">
        <div class="room">OR 3 <span>· Trauma · Bed 2</span></div>
        <div class="right"><div class="wave">${"<i></i>".repeat(9)}</div><div class="clock">14:20</div></div>
      </div>
      <div class="cols">
        <div><h5>Live conversation</h5><div class="transcript">
          ${LINES.map((l) => `<div class="tl ${l.who === "alert" ? "sv alert" : l.who}"><span class="who">${WHO[l.who]}</span>${l.text}</div>`).join("")}
        </div></div>
        <div>
          <div class="card ck">
            <div class="ckhead"><span class="k">Time-out checklist</span><span class="badge">In progress</span></div>
            ${CHECKLIST.map((c) => `<div class="ckrow"><span class="mark"></span>${c.item}</div>`).join("")}
          </div>
          <div class="card tq"><div class="k">Tourniquet · left thigh</div><div class="timer">00:00</div></div>
          <h5 class="loghead">Case log</h5>
          <div class="log">${LOG.map((r) => `<div class="row"><span class="tm">${r.tm}</span>${r.ev}<span class="ok">${r.ok}</span></div>`).join("")}</div>
        </div>
      </div>
    </div>`;
}

function renderBoard(root, t) {
  let last = null;
  const tl = root.querySelectorAll(".tl");
  LINES.forEach((l, i) => {
    const p = t >= l.t ? ease((t - l.t) / 0.35) : 0;
    tl[i].style.opacity = p;
    tl[i].style.transform = `translateY(${(1 - p) * 10}px)`;
    if (t >= l.t) last = l;
  });
  const shown = LINES.filter((l) => t >= l.t).length;
  // Only lines already spoken take up space; keep the newest five.
  tl.forEach((n, i) => n.classList.toggle("gone", i < shown - 5 || t < LINES[i].t));

  root.querySelector(".clock").textContent = t >= T.skip ? "14:44" : t >= 7.0 ? "14:22" : "14:20";

  const talking = last && t - last.t < 1.5;
  root.querySelectorAll(".wave i").forEach((b, i) => {
    const h = talking ? 0.25 + 0.75 * Math.abs(Math.sin(t * (7 + i * 1.3) + i * 2.1)) : 0.15 + 0.05 * Math.sin(t * 2 + i);
    b.style.setProperty("--h", h.toFixed(3));
    b.style.background = !talking ? "" : last.who === "dr" ? "var(--dr)" : last.who === "alert" ? "var(--amber)" : "";
  });

  // Checklist: site marking is pending, blocked, then confirmed.
  const blocked = t >= T.blocked && t < T.siteOk;
  const done = t >= T.timeoutDone;
  const badge = root.querySelector(".badge");
  badge.textContent = done ? "Complete" : blocked ? "Blocked" : "In progress";
  badge.className = "badge" + (done ? " ok" : blocked ? " warn" : "");
  root.querySelectorAll(".ckrow").forEach((n, i) => {
    const c = CHECKLIST[i];
    const ok = c.pre || t >= T.siteOk;
    n.className = "ckrow" + (ok ? " ok" : !c.pre && blocked ? " warn" : " pending");
    n.querySelector(".mark").textContent = ok ? "✓" : blocked ? "!" : "…";
  });

  const tq = root.querySelector(".tq");
  tq.classList.toggle("on", t >= T.tqLogged);
  const secs = t < T.tqLogged ? 0 : t >= T.skip ? 22 * 60 + (t - T.skip) : t - T.tqLogged;
  tq.querySelector(".timer").textContent = `${pad2(secs / 60)}:${pad2(secs % 60)}`;

  root.querySelectorAll(".log .row").forEach((n, i) => { n.style.opacity = ease((t - LOG[i].at) / 0.4); });
}

// ---------- Specialist's phone call ----------
function mountCall(root) {
  root.innerHTML = `
    <div class="call">
      <div class="callhead"><div><div class="cname">Dr. Valdez</div><div class="crole">Vascular surgery · on call</div></div><div class="cstate">Incoming</div></div>
      <div class="cfrom">SterileVoice · OR 3 is calling</div>
      <div class="cwave">${"<i></i>".repeat(24)}</div>
      <div class="brief"><span class="who">SterileVoice briefing</span>58-year-old male, left femoral bleed. Tourniquet 22 minutes. Penicillin allergy.</div>
    </div>`;
}
function renderCall(root, t) {
  const c = root.querySelector(".call");
  const live = t >= T.connected;
  const ringing = t >= T.ring && !live;
  c.classList.toggle("ringing", ringing);
  c.classList.toggle("live", live);
  root.querySelector(".cstate").textContent = live ? `Connected ${pad2((t - T.connected) / 60)}:${pad2((t - T.connected) % 60)}` : ringing ? "Ringing…" : "Incoming";
  c.style.transform = ringing ? `translateX(${Math.sin(t * 60) * 3}px)` : "";
  root.querySelectorAll(".cwave i").forEach((b, i) => {
    const speaking = t >= 13.9;
    const h = speaking ? 0.2 + 0.8 * Math.abs(Math.sin(t * (6 + (i % 7)) + i)) : 0.1;
    b.style.setProperty("--h", h.toFixed(3));
  });
  const p = ease((t - 13.9) / 0.4);
  const brief = root.querySelector(".brief");
  brief.style.opacity = p;
  brief.style.transform = `translateY(${(1 - p) * 10}px)`;
}

// ---------- Operative record ----------
function mountRecord(root) {
  root.innerHTML = `
    <div class="record">
      <div class="rh"><div class="rt">Operative record · draft</div><div class="rs">OR 3 · Bed 2</div></div>
      ${RECORD.map(([tm, ev]) => `<div class="rr"><span class="tm">${tm}</span><span>${ev}</span></div>`).join("")}
      <div class="stamp">Ready for surgeon sign-off · no keystrokes</div>
    </div>`;
}
function renderRecord(root, t) {
  root.querySelectorAll(".rr").forEach((n, i) => {
    const p = ease((t - 0.2 - i * 0.18) / 0.35);
    n.style.opacity = p;
    n.style.transform = `translateX(${(1 - p) * -12}px)`;
  });
  root.querySelector(".stamp").style.opacity = ease((t - 1.2) / 0.35);
}

window.SV = { LINES, T, mountBoard, renderBoard, mountCall, renderCall, mountRecord, renderRecord, ease, clamp };
