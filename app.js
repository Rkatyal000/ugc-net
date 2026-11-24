/* UGC-NET practice test — single-page app, no dependencies.
   State lives in localStorage so a refresh never loses answers or time. */
(function () {
  "use strict";

  const PAPERS = window.PAPERS;
  const SESSION_KEY = "ugcnet.session.v1";
  const HISTORY_KEY = "ugcnet.history.v1";
  const QUALIFY_PCT = 40; // NTA minimum aggregate for General/EWS (35% for reserved categories)
  const LETTERS = ["A", "B", "C", "D"];

  const TIPS = {
    "Teaching Aptitude": "Revise levels of teaching (memory, understanding, reflective), learner-centred methods, and formative vs summative evaluation.",
    "Research Aptitude": "Revise sampling types, variables, hypothesis, Type I/II errors, p-values, validity/reliability and research ethics. This unit carries the most questions.",
    "Communication": "Revise the communication process, types of barriers (semantic, physical, psychological), and directions of organisational communication.",
    "Logical Reasoning": "Practise syllogisms with Venn diagrams, conditional statements (converse/inverse/contrapositive) and tautology/contradiction.",
    "Data Interpretation": "Practise mean/median/mode, SD, correlation, and choosing the right chart. Do 10 timed DI sets a week.",
    "ICT": "Revise internet protocols (HTTP/HTTPS/FTP/SMTP), cyber-security terms, e-learning platforms (MOOCs, SWAYAM, LMS) and abbreviations.",
    "People, Development & Environment": "Revise sustainable development, biodiversity levels, greenhouse gases, renewable energy and environmental principles/summits.",
    "Higher Education System": "Revise UGC/NAAC/AICTE roles, NEP 2020 key provisions (5+3+3+4, multidisciplinary HEIs), and GER definitions.",
    "Chronology & Diplomatic History": "Build a single timeline sheet (1648 → today) of treaties, wars, summits and organisations; revise it daily.",
    "Books, Authors & Thinkers": "Make flashcards of author → book → core idea for realists, liberals, constructivists, critical and postcolonial thinkers.",
    "IR Theories & Concepts": "Compare each theory on: unit of analysis, view of anarchy, role of institutions, and key thinkers. Use a comparison table.",
    "International Organisations & Law": "Revise UN Charter articles, UN organs, ICJ vs ICC, arms-control treaties (NPT/CTBT/Tlatelolco) and regional bodies with HQs and years.",
    "Strategic & Security Studies": "Revise Clausewitz, Mahan, deterrence (punishment vs denial), compellence, MAD and second-strike logic.",
    "India's Foreign Policy & Indo-Pacific": "Revise non-alignment → strategic autonomy, Look/Act East, Gujral Doctrine, QUAD and Indo-Pacific frameworks.",
    "Current Affairs 2026": "Read a monthly current-affairs compilation for summits, bilateral dialogues (2+2), hosts and themes of the last 12 months.",
  };

  const app = document.getElementById("app");
  let session = load(SESSION_KEY);
  let tickHandle = null;
  let lastTick = 0;
  let reviewFilter = { paper: "all", status: "all", section: "all" };

  // ---------- utils ----------
  function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function save() { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function fmtClock(ms) {
    const t = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return (h ? h + ":" : "") + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }
  function fmtDur(sec) {
    sec = Math.round(sec);
    const m = Math.floor(sec / 60), s = sec % 60;
    return m ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
  }
  function pct(a, b) { return b ? Math.round((a / b) * 1000) / 10 : 0; }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffledIdx(rand) {
    const a = [0, 1, 2, 3];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function sectionsOf(paper) {
    const seen = [];
    paper.questions.forEach(q => { if (!seen.includes(q.section)) seen.push(q.section); });
    return seen;
  }
  function level(p) { return p >= 75 ? "strong" : p >= 50 ? "moderate" : "weak"; }
  const LEVEL_LABEL = { strong: "Strong", moderate: "Average", weak: "Needs work" };
  const LEVEL_COLOR = { strong: "var(--ok)", moderate: "#d98a00", weak: "var(--bad)" };

  // ---------- session lifecycle ----------
  function newSession(name, mode) {
    const order = mode === "full" ? ["paper1", "paper2"] : [mode];
    const rand = mulberry32((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    const papers = {};
    order.forEach(id => {
      const perm = {};
      PAPERS[id].questions.forEach(q => { perm[q.n] = shuffledIdx(rand); });
      papers[id] = { status: "pending", answers: {}, marked: {}, visited: {}, time: {}, cur: 0, perm };
    });
    session = { name, mode, order, idx: 0, papers, createdAt: Date.now(), phase: "ready" };
    save();
  }

  function curId() { return session.order[session.idx]; }
  function curPaper() { return PAPERS[curId()]; }
  function curState() { return session.papers[curId()]; }

  function startPaper() {
    const st = curState();
    st.status = "running";
    st.startedAt = Date.now();
    st.endsAt = st.startedAt + curPaper().minutes * 60 * 1000;
    st.visited[curPaper().questions[st.cur].n] = true;
    session.phase = "exam";
    save();
    render();
  }

  function submitPaper(auto) {
    const st = curState();
    if (st.status !== "running") return;
    const title = curPaper().title;
    st.status = "done";
    st.submittedAt = Math.min(Date.now(), st.endsAt);
    st.auto = !!auto;
    stopTick();
    if (session.idx < session.order.length - 1) {
      session.idx++;
      session.phase = "between";
    } else {
      session.phase = "result";
      session.finishedAt = Date.now();
      recordHistory();
    }
    save();
    closeModal();
    render();
    if (auto) toast(`Time is up — ${title} was submitted automatically.`);
  }

  // ---------- timer ----------
  function startTick() {
    stopTick();
    lastTick = lastTick || Date.now();
    tickHandle = setInterval(tick, 250);
    tick();
  }
  function stopTick() { if (tickHandle) clearInterval(tickHandle); tickHandle = null; }
  function tick() {
    const st = curState();
    if (!st || st.status !== "running") return stopTick();
    const now = Date.now();
    const q = curPaper().questions[st.cur];
    // per-question time tracking (capped so a sleeping laptop doesn't inflate it)
    const dt = Math.min(now - lastTick, 5000) / 1000;
    lastTick = now;
    st.time[q.n] = (st.time[q.n] || 0) + dt;
    const left = st.endsAt - now;
    const el = document.getElementById("timer");
    if (el) {
      document.getElementById("timer-txt").textContent = fmtClock(left);
      el.className = "timer" + (left <= 60000 ? " crit" : left <= 10 * 60000 ? " low" : "");
    }
    if (!st.warned10 && left <= 10 * 60000 && left > 60000) { st.warned10 = true; toast("10 minutes left for this paper."); }
    if (!st.warned1 && left <= 60000 && left > 0 && curPaper().minutes > 1) { st.warned1 = true; toast("1 minute left — the paper will submit automatically."); }
    if (left <= 0) return submitPaper(true);
    if (Math.floor(now / 1000) % 3 === 0) save();
  }

  // ---------- scoring ----------
  function scorePaper(id) {
    const P = PAPERS[id], st = session.papers[id];
    const bySec = {};
    sectionsOf(P).forEach(s => (bySec[s] = { name: s, total: 0, correct: 0, wrong: 0, skipped: 0, time: 0 }));
    let correct = 0, wrong = 0, skipped = 0, time = 0;
    const items = P.questions.map(q => {
      const a = st.answers[q.n];
      const status = a === undefined ? "s" : a === q.answer ? "c" : "w";
      const s = bySec[q.section];
      s.total++; s.time += st.time[q.n] || 0; time += st.time[q.n] || 0;
      if (status === "c") { correct++; s.correct++; } else if (status === "w") { wrong++; s.wrong++; } else { skipped++; s.skipped++; }
      return { q, a, status, marked: !!st.marked[q.n], t: st.time[q.n] || 0 };
    });
    const sections = Object.values(bySec).map(s => ({ ...s, pct: pct(s.correct, s.total), attempted: s.correct + s.wrong,
      acc: pct(s.correct, s.correct + s.wrong), avgT: s.total ? s.time / s.total : 0 }));
    return {
      id, P, st, items, sections, correct, wrong, skipped, total: P.questions.length,
      marks: correct * P.marksPerQ, maxMarks: P.questions.length * P.marksPerQ,
      used: ((st.submittedAt || Date.now()) - (st.startedAt || Date.now())) / 1000,
    };
  }

  function recordHistory() {
    const h = load(HISTORY_KEY) || [];
    const res = session.order.map(scorePaper);
    const marks = res.reduce((a, r) => a + r.marks, 0), max = res.reduce((a, r) => a + r.maxMarks, 0);
    h.push({
      at: Date.now(), name: session.name, mode: session.mode, marks, max,
      papers: res.map(r => ({ id: r.id, marks: r.marks, max: r.maxMarks })),
    });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-30)));
  }

  // ---------- rendering ----------
  function render() {
    stopTick();
    window.onbeforeunload = null;
    if (!session || session.phase === "home") return renderHome();
    if (session.phase === "ready" || session.phase === "between") return renderReady();
    if (session.phase === "exam") {
      // resumed after the deadline (tab closed / laptop slept) → submit now
      if (Date.now() >= curState().endsAt) return submitPaper(true);
      return renderExam();
    }
    if (session.phase === "result") return renderResult();
    renderHome();
  }

  function renderHome() {
    const h = (load(HISTORY_KEY) || []).slice().reverse();
    const inProgress = session && session.phase !== "result" && session.phase !== "home";
    const p1 = PAPERS.paper1, p2 = PAPERS.paper2;
    const best = h.length ? Math.max(...h.map(r => pct(r.marks, r.max))) : null;
    app.innerHTML = `
    ${navbar()}
    <header class="hero-band">
      <div class="hero-inner">
        <div class="hero-copy">
          <span class="eyebrow"><span class="dot"></span>December 2026 cycle · Full-length mock</span>
          <h1>Practise UGC-NET the way the <em>real exam</em> feels.</h1>
          <p class="lead">Paper I and Paper II (Code 90 — Political Science) on a real exam clock. The paper submits automatically when time runs out, and you get a section-by-section report on what to work on next.</p>
          <div class="hero-stats">
            <div><b>150</b><span>Questions</span></div>
            <div><b>300</b><span>Marks</span></div>
            <div><b>3 hrs</b><span>Duration</span></div>
            <div><b>0</b><span>Negative marking</span></div>
          </div>
        </div>
        <div class="hero-panel">
          ${inProgress ? `
            <div class="panel-ico warn">${ICON.clock}</div>
            <h3>Test in progress</h3>
            <p class="muted">${esc(session.name)} · ${esc(curPaper().title)} · ${session.phase === "exam" ? "the timer is still running" : "not started yet"}</p>
            <button class="btn primary lg block" data-act="resume">Resume test</button>
            <button class="btn ghost block" data-act="abandon">Discard and start over</button>
          ` : `
            <h3>Start your mock test</h3>
            <p class="muted small">Enter your name. It appears on your result.</p>
            <label class="field" for="nm">Your name</label>
            <input id="nm" class="text" placeholder="e.g. Priya Sharma" maxlength="60" autocomplete="name" value="${esc((h[0] && h[0].name) || "")}" />
            <button class="btn primary lg block" data-act="start" data-mode="full">${ICON.play} Start full test · 3 hrs</button>
            <div class="split">
              <button class="btn soft" data-act="start" data-mode="paper1">Paper I · 1 hr</button>
              <button class="btn soft" data-act="start" data-mode="paper2">Paper II · 2 hrs</button>
            </div>
            ${best !== null ? `<p class="small muted center" style="margin:12px 0 0">Your best so far: <b>${best}%</b> across ${h.length} attempt${h.length > 1 ? "s" : ""}</p>` : ""}
          `}
        </div>
      </div>
    </header>

    <main class="wrap stack">
      <section>
        <div class="sec-title"><h2>The two papers</h2><p class="muted">Taken one after the other, with a separate clock for each.</p></div>
        <div class="grid2">
          ${[p1, p2].map((p, k) => `
          <article class="paper-card accent-${k + 1}">
            <div class="pc-top">
              <span class="pc-num">${k ? "II" : "I"}</span>
              <div><div class="pc-label">${esc(p.title)}</div><h3>${esc(p.subtitle)}</h3></div>
            </div>
            <div class="facts">
              <div><b>${p.questions.length}</b><span>Questions</span></div>
              <div><b>${p.questions.length * p.marksPerQ}</b><span>Marks</span></div>
              <div><b>${p.minutes / 60} hr${p.minutes > 60 ? "s" : ""}</b><span>Time limit</span></div>
            </div>
            <div class="chips">${sectionsOf(p).map(s => `<span class="chip">${esc(s)}</span>`).join("")}</div>
          </article>`).join("")}
        </div>
      </section>

      <section>
        <div class="sec-title"><h2>How it works</h2></div>
        <div class="steps">
          <div class="step"><span class="step-ico">${ICON.clock}</span><h4>Timed like the real exam</h4><p>Paper I gets 1 hour and Paper II gets 2 hours. You get warnings at 10 minutes and at 1 minute left, and the paper submits automatically at zero.</p></div>
          <div class="step"><span class="step-ico">${ICON.flag}</span><h4>Mark &amp; revisit</h4><p>The question palette shows what you've answered, skipped and marked for review. Answers are saved as you go, even if the page is refreshed.</p></div>
          <div class="step"><span class="step-ico">${ICON.chart}</span><h4>Know where to improve</h4><p>See your score for every section, your strong and weak areas, time per question, and a review of every answer with its explanation.</p></div>
        </div>
      </section>

      <section class="card">
        <h3>${ICON.info} Exam rules</h3>
        <ul class="rules">
          <li>Every question carries <b>2 marks</b>. There is <b>no negative marking</b>, so answer every question.</li>
          <li>Paper II starts when Paper I is submitted. You can't go back to a paper after submitting it.</li>
          <li>Answered questions that are also marked for review are still counted.</li>
          <li>Progress is saved in this browser. If the page is closed, the timer keeps running.</li>
          <li>Options are shuffled on every attempt, so a retake is a fresh test.</li>
        </ul>
      </section>

      ${h.length ? `
      <section class="card">
        <h3>${ICON.chart} Your previous attempts</h3>
        ${historyTable(h)}
      </section>` : ""}
    </main>
    ${footer()}`;
    bindCommon();
    const nm = document.getElementById("nm");
    if (nm) nm.onkeydown = e => { if (e.key === "Enter") act("start", { dataset: { mode: "full" } }); };
  }

  function navbar(right) {
    return `<nav class="nav"><div class="nav-inner">
      <a class="logo" href="#" data-act="${session && session.phase === "exam" ? "" : "home"}"><span class="logo-mark">N</span><span>NET<b>Prep</b></span></a>
      <div class="nav-right">${right || `<span class="small muted hide-sm">UGC-NET · Paper I + Code 90</span>`}</div>
    </div></nav>`;
  }
  function footer() {
    return `<footer class="foot no-print">Practice material for UGC-NET preparation. This is not an official NTA paper. Your answers stay in your own browser.</footer>`;
  }

  const ICON = {
    clock: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    flag: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4h11l-2 4 2 4H5"/></svg>',
    chart: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    info: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    play: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    grid: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  };

  function historyTable(h) {
    return `<table class="tbl"><thead><tr><th>Date</th><th>Name</th><th>Test</th>
      <th class="num">Paper I</th><th class="num">Paper II</th><th class="num">Total</th><th class="num">%</th></tr></thead><tbody>
      ${h.map(r => {
        const g = id => { const p = r.papers.find(x => x.id === id); return p ? `${p.marks}/${p.max}` : "—"; };
        return `<tr><td>${new Date(r.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</td><td>${esc(r.name)}</td>
          <td>${r.mode === "full" ? "Full test" : r.mode === "paper1" ? "Paper I" : "Paper II"}</td>
          <td class="num">${g("paper1")}</td><td class="num">${g("paper2")}</td><td class="num"><b>${r.marks}/${r.max}</b></td>
          <td class="num">${pct(r.marks, r.max)}%</td></tr>`;
      }).join("")}</tbody></table>`;
  }

  function renderReady() {
    const P = curPaper();
    const between = session.phase === "between";
    const prev = between ? scorePaper(session.order[session.idx - 1]) : null;
    const stepper = session.order.length > 1 ? `<div class="stepper">${session.order.map((id, i) => `
      <div class="stp ${i < session.idx ? "done" : i === session.idx ? "now" : ""}"><span>${i < session.idx ? "✓" : i + 1}</span>${esc(PAPERS[id].title)} · ${PAPERS[id].minutes / 60} hr${PAPERS[id].minutes > 60 ? "s" : ""}</div>`).join('<i class="stp-line"></i>')}
      <i class="stp-line"></i><div class="stp"><span>★</span>Result</div></div>` : "";
    app.innerHTML = `
    ${navbar(`<span class="small muted">${esc(session.name)}</span>`)}
    <div class="wrap stack narrow">
      ${stepper}
      ${between ? `<div class="notice ok">
        <b>${esc(prev.P.title)} submitted${prev.st.auto ? " automatically (time up)" : ""}.</b>
        You answered ${prev.correct + prev.wrong} of ${prev.total} questions. Your full result will be shown after ${esc(P.title)}.
      </div>` : ""}
      <div class="card ready-card">
        <span class="badge">${esc(P.title)}${session.order.length > 1 ? ` · part ${session.idx + 1} of ${session.order.length}` : ""}</span>
        <h2 style="margin-top:.6em">${esc(P.subtitle)}</h2>
        <div class="facts">
          <div><b>${P.questions.length}</b><span>Questions</span></div>
          <div><b>${P.questions.length * P.marksPerQ}</b><span>Marks</span></div>
          <div><b>${P.minutes} min</b><span>Time limit</span></div>
        </div>
        <p class="muted">The timer starts when you press the button below. The paper submits automatically when the time is over.</p>
        <p class="small muted kbd-line">Shortcuts: <b>1–4</b> or <b>A–D</b> to choose an option · <b>→</b>/<b>N</b> save &amp; next · <b>←</b>/<b>P</b> previous · <b>M</b> mark for review</p>
        <div class="actions-row" style="margin-top:16px">
          <button class="btn primary lg" data-act="begin">${ICON.play} Start ${esc(P.title)} now</button>
          ${between ? "" : `<button class="btn" data-act="home">Back</button>`}
        </div>
      </div>
    </div>`;
    bindCommon();
  }

  function qStatus(st, n) {
    const a = st.answers[n] !== undefined, m = !!st.marked[n];
    if (a && m) return "am";
    if (m) return "m";
    if (a) return "a";
    if (st.visited[n]) return "na";
    return "nv";
  }

  function renderExam() {
    const P = curPaper(), st = curState();
    const q = P.questions[st.cur];
    st.visited[q.n] = true;
    const perm = st.perm[q.n];
    const counts = { a: 0, na: 0, m: 0, am: 0, nv: 0 };
    P.questions.forEach(x => counts[qStatus(st, x.n)]++);
    const secs = sectionsOf(P);
    app.innerHTML = `
    <div class="exam" id="exam">
      <div class="topbar">
        <div class="tb-left">
          <span class="logo-mark sm">N</span>
          <div><div class="title">${esc(P.title)} <span class="hide-sm">· ${esc(P.subtitle)}</span></div><div class="who">${esc(session.name)}</div></div>
        </div>
        <div class="tb-right">
          <button class="btn pal-toggle" data-act="toggle-pal" aria-label="Show question palette">${ICON.grid}<span>${counts.a + counts.am}/${P.questions.length}</span></button>
          <span id="timer" class="timer">${ICON.clock}<span id="timer-txt">${fmtClock(st.endsAt - Date.now())}</span></span>
        </div>
        <div class="tb-progress" title="${counts.a + counts.am} of ${P.questions.length} answered"><i style="width:${pct(counts.a + counts.am, P.questions.length)}%"></i></div>
      </div>
      <div class="exam-body">
        <div class="card qpanel">
          <div class="qhead">
            <span class="qno"><span class="qno-big">Q${st.cur + 1}</span><span class="muted small"> of ${P.questions.length}</span></span>
            <span class="badge">${esc(q.section)}</span>
            <span class="marks-pill">+${P.marksPerQ} · no negative</span>
          </div>
          <div class="qtext">${esc(q.q)}</div>
          <div role="radiogroup" aria-label="Options">
            ${perm.map((orig, i) => `
              <button class="opt ${st.answers[q.n] === orig ? "sel" : ""}" role="radio" aria-checked="${st.answers[q.n] === orig}" data-act="pick" data-orig="${orig}">
                <span class="key">${LETTERS[i]}</span><span>${esc(q.options[orig])}</span>
              </button>`).join("")}
          </div>
          <div class="qactions">
            <div class="grp">
              <button class="btn mark" data-act="mark">${ICON.flag}<span>${st.marked[q.n] ? "Unmark review" : "Mark & next"}</span></button>
              <button class="btn" data-act="clear" ${st.answers[q.n] === undefined ? "disabled" : ""}>Clear response</button>
            </div>
            <div class="grp">
              <button class="btn" data-act="prev" ${st.cur === 0 ? "disabled" : ""}>← Prev</button>
              <button class="btn primary" data-act="next">${st.cur === P.questions.length - 1 ? "Save" : "Save & next →"}</button>
            </div>
          </div>
          <div class="kbd-hint hide-sm">Keys: 1–4 / A–D choose · → or N next · ← or P previous · M mark</div>
        </div>
        <div class="pal-backdrop" data-act="toggle-pal"></div>
        <div class="side" id="side">
          <div class="card" style="padding:16px">
            <div class="counts">
              <div><b>${counts.a + counts.am}</b>Answered</div>
              <div><b>${counts.na}</b>Not answered</div>
              <div><b>${counts.m + counts.am}</b>Marked</div>
              <div><b>${counts.nv}</b>Not visited</div>
            </div>
          </div>
          <div class="card" style="padding:16px">
            <div class="legend">
              <span><i class="st-a">✓</i>Answered</span>
              <span><i class="st-na">!</i>Not answered</span>
              <span><i class="st-m">?</i>Marked</span>
              <span><i class="st-am" style="position:relative">✓</i>Answered + marked</span>
              <span><i class="st-nv" style="border:1px solid var(--line)"></i>Not visited</span>
            </div>
            <div class="palette-scroll">
              ${secs.map(s => `
                <div class="palette-sec">${esc(s)}</div>
                <div class="palette">
                  ${P.questions.map((x, i) => x.section !== s ? "" :
                    `<button class="pbtn st-${qStatus(st, x.n)} ${i === st.cur ? "cur" : ""}" data-act="goto" data-i="${i}" title="Q${i + 1}">${i + 1}</button>`).join("")}
                </div>`).join("")}
            </div>
          </div>
          <button class="btn danger lg" data-act="ask-submit">Submit ${esc(P.title)}</button>
        </div>
      </div>
    </div>`;
    bindCommon();
    window.onbeforeunload = e => { e.preventDefault(); e.returnValue = ""; };
    startTick();
  }

  function go(i) {
    const P = curPaper(), st = curState();
    st.cur = Math.max(0, Math.min(P.questions.length - 1, i));
    save();
    renderExam();
  }

  function askSubmit() {
    const P = curPaper(), st = curState();
    let ans = 0, mk = 0;
    P.questions.forEach(q => { if (st.answers[q.n] !== undefined) ans++; if (st.marked[q.n]) mk++; });
    const left = P.questions.length - ans;
    modal(`
      <h3>Submit ${esc(P.title)}?</h3>
      <p>You have answered <b>${ans}</b> of ${P.questions.length} questions${mk ? ` and marked <b>${mk}</b> for review` : ""}.</p>
      ${left ? `<p style="color:var(--bad)"><b>${left} question${left > 1 ? "s are" : " is"} unanswered.</b> There is no negative marking, so it is better to attempt them.</p>` : ""}
      <p class="muted small">Time remaining: ${fmtClock(st.endsAt - Date.now())}. You cannot return to this paper after submitting.</p>
      <div class="btns"><button class="btn" data-act="close-modal">Keep working</button>
      <button class="btn danger" data-act="submit">Yes, submit</button></div>`);
  }

  // ---------- results ----------
  function renderResult() {
    const res = session.order.map(scorePaper);
    const marks = res.reduce((a, r) => a + r.marks, 0);
    const max = res.reduce((a, r) => a + r.maxMarks, 0);
    const P = pct(marks, max);
    const pass = P >= QUALIFY_PCT;
    const correct = res.reduce((a, r) => a + r.correct, 0);
    const wrong = res.reduce((a, r) => a + r.wrong, 0);
    const skipped = res.reduce((a, r) => a + r.skipped, 0);
    const allSecs = res.flatMap(r => r.sections.map(s => ({ ...s, paper: r.P.title })));
    const ranked = allSecs.slice().sort((a, b) => a.pct - b.pct);
    const weak = ranked.filter(s => level(s.pct) === "weak");
    const mid = ranked.filter(s => level(s.pct) === "moderate");
    const strong = ranked.filter(s => level(s.pct) === "strong").reverse();
    const h = (load(HISTORY_KEY) || []).slice().reverse();

    app.innerHTML = `
    ${navbar(`<div class="actions-row no-print"><button class="btn ghost" data-act="home">Home</button><button class="btn ghost hide-sm" data-act="print">Print / PDF</button>
        <button class="btn primary" data-act="retake">New attempt</button></div>`)}
    <div class="wrap stack">
      <div class="card result-hero">
        <div class="score-hero">
          <div class="ring" style="--p:${P};--ring:${pass ? "var(--ok)" : "var(--bad)"}"><div><div><b>${marks}</b><span>out of ${max}</span></div></div></div>
          <div>
            <span class="badge">Result · ${new Date(session.finishedAt || Date.now()).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
            <h1 style="margin:.4em 0 .2em">${esc(session.name)}, you scored ${P}%</h1>
            <span class="verdict ${pass ? "pass" : "fail"}">${pass ? "Above" : "Below"} the ${QUALIFY_PCT}% qualifying mark</span>
            <p class="small muted" style="margin:.6em 0 0">UGC-NET minimum aggregate: ${QUALIFY_PCT}% for General/EWS, 35% for reserved categories. Final cut-offs for JRF and Assistant Professor are higher and vary each cycle.</p>
            <div class="kpis">
              <div class="kpi"><b style="color:var(--ok)">${correct}</b><span>Correct</span></div>
              <div class="kpi"><b style="color:var(--bad)">${wrong}</b><span>Wrong</span></div>
              <div class="kpi"><b style="color:var(--skip)">${skipped}</b><span>Not attempted</span></div>
              <div class="kpi"><b>${pct(correct, correct + wrong)}%</b><span>Accuracy (of attempted)</span></div>
            </div>
          </div>
        </div>
      </div>

      <div class="grid2">
        ${res.map(r => `
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
            <h3>${esc(r.P.title)}</h3><span class="tag ${level(pct(r.marks, r.maxMarks))}">${LEVEL_LABEL[level(pct(r.marks, r.maxMarks))]}</span>
          </div>
          <div style="font-size:2rem;font-weight:800">${r.marks}<span class="muted" style="font-size:1rem;font-weight:500"> / ${r.maxMarks} · ${pct(r.marks, r.maxMarks)}%</span></div>
          <div class="bar" style="margin:8px 0 12px"><i style="width:${pct(r.marks, r.maxMarks)}%;background:${LEVEL_COLOR[level(pct(r.marks, r.maxMarks))]}"></i></div>
          <table class="tbl"><tbody>
            <tr><td>Correct / Wrong / Not attempted</td><td class="num">${r.correct} / ${r.wrong} / ${r.skipped}</td></tr>
            <tr><td>Accuracy on attempted</td><td class="num">${pct(r.correct, r.correct + r.wrong)}%</td></tr>
            <tr><td>Time used</td><td class="num">${fmtDur(r.used)} of ${r.P.minutes} min${r.st.auto ? " (auto-submitted)" : ""}</td></tr>
            <tr><td>Average time per question</td><td class="num">${fmtDur(r.used / r.total)}</td></tr>
          </tbody></table>
        </div>`).join("")}
      </div>

      <div class="card">
        <h2>Section-wise analysis</h2>
        <p class="muted small">Strong is 75% or more, Average is 50–74%, and Needs work is below 50%.</p>
        ${res.map(r => `
          <h3 style="margin-top:1.2em">${esc(r.P.title)}</h3>
          <div style="overflow-x:auto"><table class="tbl">
            <thead><tr><th>Section</th><th class="num">Qs</th><th class="num">Correct</th><th class="num">Wrong</th><th class="num">Skipped</th>
            <th style="min-width:140px">Score</th><th class="num">Avg time/Q</th><th>Level</th></tr></thead>
            <tbody>${r.sections.map(s => `
              <tr><td><b>${esc(s.name)}</b></td><td class="num">${s.total}</td><td class="num">${s.correct}</td><td class="num">${s.wrong}</td><td class="num">${s.skipped}</td>
              <td><div style="display:flex;align-items:center;gap:8px"><div class="bar" style="flex:1"><i style="width:${s.pct}%;background:${LEVEL_COLOR[level(s.pct)]}"></i></div><span class="small" style="width:44px;text-align:right">${s.pct}%</span></div></td>
              <td class="num">${fmtDur(s.avgT)}</td><td><span class="tag ${level(s.pct)}">${LEVEL_LABEL[level(s.pct)]}</span></td></tr>`).join("")}
            </tbody></table></div>`).join("")}
      </div>

      <div class="grid2">
        <div class="card">
          <h2>Where to work harder</h2>
          ${weak.length + mid.length ? `<ul class="focus-list">
            ${weak.concat(mid).map(s => `<li class="${level(s.pct)}"><b>${esc(s.name)} <span class="small muted">(${esc(s.paper)}) · ${s.correct}/${s.total} correct · ${s.pct}%</span></b>
              <span class="small">${esc(TIPS[s.name] || "Revise this unit and re-attempt the questions you got wrong.")}</span></li>`).join("")}
          </ul>` : `<p>No weak sections. Every section is at 75% or above. Keep practising with timed full-length papers.</p>`}
        </div>
        <div class="card">
          <h2>Your strengths</h2>
          ${strong.length ? `<ul class="focus-list">
            ${strong.map(s => `<li class="strong"><b>${esc(s.name)} <span class="small muted">(${esc(s.paper)}) · ${s.pct}%</span></b>
              <span class="small">Strong area. Keep it fresh with short weekly revision and spend more of your time on the weaker sections.</span></li>`).join("")}
          </ul>` : `<p class="muted">No section has reached 75% yet. Start with the sections at the top of the "work harder" list, where you lose the most marks.</p>`}
          <h3 style="margin-top:1em">Key insights</h3>
          <ul class="insights small">${insights(res).map(x => `<li>${x}</li>`).join("")}</ul>
        </div>
      </div>

      <div class="card">
        <h2>Detailed answer review</h2>
        <div id="review"></div>
      </div>

      ${h.length > 1 ? `<div class="card"><h2>Progress over attempts</h2>${historyTable(h)}</div>` : ""}
    </div>
    ${footer()}`;
    bindCommon();
    renderReview(res);
  }

  function insights(res) {
    const out = [];
    const skipped = res.reduce((a, r) => a + r.skipped, 0);
    if (skipped) out.push(`You left <b>${skipped}</b> question${skipped > 1 ? "s" : ""} unanswered, which is up to <b>${skipped * 2} marks</b> lost. There is no negative marking, so always attempt every question.`);
    res.forEach(r => {
      const usedPct = pct(r.used, r.P.minutes * 60);
      if (r.st.auto && r.skipped) out.push(`${esc(r.P.title)}: the time ran out before you finished. Aim for about <b>${fmtDur((r.P.minutes * 60 * 0.85) / r.total)}</b> per question so you have time left to review.`);
      else if (usedPct < 50 && pct(r.correct, r.correct + r.wrong) < 70) out.push(`${esc(r.P.title)}: you used only ${Math.round(usedPct)}% of the time but accuracy was ${pct(r.correct, r.correct + r.wrong)}%. Slow down and read each option carefully.`);
      const slow = r.sections.slice().sort((a, b) => b.avgT - a.avgT)[0];
      if (slow && slow.avgT >= 1) out.push(`${esc(r.P.title)}: you spent the most time per question on <b>${esc(slow.name)}</b> (${fmtDur(slow.avgT)} per question).`);
      const markedWrong = r.items.filter(i => i.marked && i.status === "w").length;
      const markedRight = r.items.filter(i => i.marked && i.status === "c").length;
      if (markedWrong + markedRight) out.push(`${esc(r.P.title)}: of the ${markedRight + markedWrong} question${markedRight + markedWrong > 1 ? "s" : ""} you marked for review, ${markedRight} turned out right and ${markedWrong} wrong.`);
    });
    const best = res.flatMap(r => r.sections).sort((a, b) => b.pct - a.pct)[0];
    if (best) out.push(`Best section: <b>${esc(best.name)}</b> (${best.pct}%).`);
    return out;
  }

  function renderReview(res) {
    const box = document.getElementById("review");
    if (!box) return;
    const secOpts = res.flatMap(r => r.sections.map(s => s.name));
    const f = reviewFilter;
    let items = res.flatMap(r => r.items.map(i => ({ ...i, paper: r }))).filter(i =>
      (f.paper === "all" || i.paper.id === f.paper) &&
      (f.section === "all" || i.q.section === f.section) &&
      (f.status === "all" || (f.status === "m" ? i.marked : i.status === f.status)));
    const count = st => res.flatMap(r => r.items).filter(i => st === "all" || (st === "m" ? i.marked : i.status === st)).length;
    box.innerHTML = `
      <div class="tabs no-print">
        ${[["all", "All"], ["w", "Wrong"], ["s", "Not attempted"], ["c", "Correct"], ["m", "Marked for review"]].map(([k, l]) =>
          `<button class="${f.status === k ? "on" : ""}" data-act="rf" data-k="status" data-v="${k}">${l} (${count(k)})</button>`).join("")}
      </div>
      <div class="actions-row no-print" style="margin-bottom:14px">
        ${res.length > 1 ? `<select class="sel" data-act="rfs" data-k="paper"><option value="all">Both papers</option>
          ${res.map(r => `<option value="${r.id}" ${f.paper === r.id ? "selected" : ""}>${esc(r.P.title)}</option>`).join("")}</select>` : ""}
        <select class="sel" data-act="rfs" data-k="section"><option value="all">All sections</option>
          ${secOpts.map(s => `<option ${f.section === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>
        <span class="small muted" style="align-self:center">${items.length} question${items.length === 1 ? "" : "s"}</span>
      </div>
      ${items.length ? items.map(i => {
        const perm = i.paper.st.perm[i.q.n];
        return `<div class="rv">
          <div class="rvhead"><span><b>${esc(i.paper.P.title)} · Q${i.q.n}</b> · ${esc(i.q.section)}${i.marked ? " · marked" : ""}</span>
          <span><span class="st-pill ${i.status}">${i.status === "c" ? "✓ Correct +2" : i.status === "w" ? "✗ Wrong 0" : "– Not attempted 0"}</span> · ${fmtDur(i.t)}</span></div>
          <div class="rvq">${esc(i.q.q)}</div>
          ${perm.map((orig, k) => {
            const cls = orig === i.q.answer ? "correct" : orig === i.a ? "wrong" : "";
            const note = orig === i.q.answer ? (orig === i.a ? " — your answer" : " — correct answer") : orig === i.a ? " — your answer" : "";
            return `<div class="ro ${cls}"><b>${LETTERS[k]}.</b><span>${esc(i.q.options[orig])}${note}</span></div>`;
          }).join("")}
          <div class="expl"><b>Explanation:</b> ${esc(i.q.explanation)}</div>
        </div>`;
      }).join("") : `<p class="muted">No questions match this filter.</p>`}`;
    box.querySelectorAll("[data-act=rf]").forEach(b => b.onclick = () => { reviewFilter[b.dataset.k] = b.dataset.v; renderReview(res); });
    box.querySelectorAll("[data-act=rfs]").forEach(s => s.onchange = () => { reviewFilter[s.dataset.k] = s.value; renderReview(res); });
  }

  // ---------- modal / toast ----------
  function modal(html) {
    closeModal();
    const bg = document.createElement("div");
    bg.className = "modal-bg"; bg.id = "modal";
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(bg);
    bindCommon(bg);
  }
  function closeModal() { const m = document.getElementById("modal"); if (m) m.remove(); }
  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast"; t.textContent = msg; t.setAttribute("role", "status");
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4500);
  }

  // ---------- events ----------
  function bindCommon(root) {
    (root || app).querySelectorAll("[data-act]").forEach(el => {
      if (el.tagName === "SELECT") return;
      el.onclick = () => act(el.dataset.act, el);
    });
  }

  function act(a, el) {
    const st = session && session.papers && curState();
    switch (a) {
      case "start": {
        const nm = document.getElementById("nm").value.trim();
        if (!nm) { document.getElementById("nm").focus(); return toast("Please enter your name first."); }
        newSession(nm, el.dataset.mode); reviewFilter = { paper: "all", status: "all", section: "all" }; return render();
      }
      case "resume": return render();
      case "abandon":
        return modal(`<h3>Discard the current test?</h3><p>All answers in the test in progress will be lost.</p>
          <div class="btns"><button class="btn" data-act="close-modal">Cancel</button><button class="btn danger" data-act="abandon-yes">Discard</button></div>`);
      case "abandon-yes": localStorage.removeItem(SESSION_KEY); session = null; closeModal(); return renderHome();
      case "home":
        if (session && (session.phase === "ready" || session.phase === "result")) { localStorage.removeItem(SESSION_KEY); session = null; }
        return renderHome();
      case "begin": return startPaper();
      case "pick": {
        const q = curPaper().questions[st.cur];
        st.answers[q.n] = +el.dataset.orig; save(); return renderExam();
      }
      case "clear": { const q = curPaper().questions[st.cur]; delete st.answers[q.n]; save(); return renderExam(); }
      case "mark": {
        const q = curPaper().questions[st.cur];
        if (st.marked[q.n]) { delete st.marked[q.n]; save(); return renderExam(); }
        st.marked[q.n] = true; return go(st.cur + 1);
      }
      case "next": return go(st.cur + 1);
      case "prev": return go(st.cur - 1);
      case "goto": return go(+el.dataset.i);
      case "toggle-pal": return document.getElementById("exam").classList.toggle("show-pal");
      case "ask-submit": return askSubmit();
      case "submit": return submitPaper(false);
      case "close-modal": return closeModal();
      case "print": return window.print();
      case "retake": {
        const { name, mode } = session;
        newSession(name, mode); reviewFilter = { paper: "all", status: "all", section: "all" }; return render();
      }
    }
  }

  document.addEventListener("keydown", e => {
    if (!session || session.phase !== "exam" || document.getElementById("modal")) return;
    if (e.target.tagName === "INPUT" || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const st = curState(), q = curPaper().questions[st.cur];
    const idx = "1234".indexOf(k) >= 0 ? "1234".indexOf(k) : "abcd".indexOf(k);
    if (k.length === 1 && idx >= 0) { st.answers[q.n] = st.perm[q.n][idx]; save(); renderExam(); }
    else if (k === "arrowright" || k === "n") go(st.cur + 1);
    else if (k === "arrowleft" || k === "p") go(st.cur - 1);
    else if (k === "m") act("mark");
  });

  // keep the clock honest if the tab was hidden
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && session && session.phase === "exam") { lastTick = Date.now(); tick(); }
  });

  render();
})();
