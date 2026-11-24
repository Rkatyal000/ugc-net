// End-to-end tests: load the real index.html + questions.js + app.js into jsdom
// and drive the UI exactly as a student would (clicks, keys, timer, reloads).
// Run:  cd tests && npm install && npm test
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8").replace(/<script src="[^"]+"><\/script>/g, "");
const QJS = fs.readFileSync(path.join(ROOT, "questions.js"), "utf8");
const APP = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const KEY = "ugcnet.session.v1";
const HKEY = "ugcnet.history.v1";
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Boot the app. `storage` carries localStorage across "reloads"; `tweak` edits PAPERS before app.js runs.
function boot({ storage = {}, tweak } = {}) {
  const dom = new JSDOM(HTML, { runScripts: "outside-only", url: "https://ugc-net.test/", pretendToBeVisual: true });
  const w = dom.window;
  w.print = () => {};
  for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
  w.eval(QJS);
  if (tweak) tweak(w.PAPERS);
  w.eval(APP);
  const d = w.document;
  const $ = s => d.querySelector(s);
  const $$ = s => [...d.querySelectorAll(s)];
  const click = s => { const e = typeof s === "string" ? $(s) : s; assert.ok(e, "element not found: " + s); e.click(); };
  const key = k => d.dispatchEvent(new w.KeyboardEvent("keydown", { key: k }));
  const state = () => JSON.parse(w.localStorage.getItem(KEY));
  const dump = () => ({ [KEY]: w.localStorage.getItem(KEY), [HKEY]: w.localStorage.getItem(HKEY) || "[]" });
  // the question currently on screen, resolved through the saved shuffle order
  const shown = () => {
    const s = state(), id = s.order[s.idx], st = s.papers[id], P = w.PAPERS[id];
    return { id, st, P, q: P.questions[st.order[st.cur]] };
  };
  // click the displayed option whose ORIGINAL index is `orig` (and check the label matches the text)
  const pick = orig => {
    const btn = $(`[data-act=pick][data-orig="${orig}"]`);
    assert.ok(btn, "option button missing");
    assert.equal(btn.querySelector("span:last-child").textContent, shown().q.options[orig]);
    btn.click();
  };
  const start = (mode, name = "Tester") => { $("#nm").value = name; click(`[data-act=start][data-mode=${mode}]`); click("[data-act=begin]"); };
  const stop = () => { w.close(); };
  return { w, d, $, $$, click, key, state, dump, shown, pick, start, stop };
}

test("question bank is complete and well-formed", () => {
  const { w, stop } = boot();
  const { paper1, paper2 } = w.PAPERS;
  assert.equal(paper1.questions.length, 50);
  assert.equal(paper2.questions.length, 100);
  assert.equal(paper1.minutes, 60);
  assert.equal(paper2.minutes, 120);
  for (const P of [paper1, paper2]) {
    P.questions.forEach((q, i) => {
      assert.equal(q.n, i + 1);
      assert.equal(q.options.length, 4);
      assert.equal(new Set(q.options).size, 4, `duplicate options in ${P.id} Q${q.n}`);
      assert.ok(q.answer >= 0 && q.answer <= 3);
      assert.ok(q.q.length > 5 && q.explanation.length > 5 && q.section);
    });
  }
  stop();
});

test("name is required before starting", () => {
  const t = boot();
  t.click("[data-act=start][data-mode=full]");
  assert.equal(t.state(), null);
  assert.match(t.$(".toast").textContent, /name/i);
  t.stop();
});

test("questions AND options are shuffled per attempt, and are true permutations", () => {
  const a = boot(); a.start("full");
  const sa = a.state();
  const b = boot(); b.start("full");
  const sb = b.state();
  for (const id of ["paper1", "paper2"]) {
    const n = a.w.PAPERS[id].questions.length;
    for (const s of [sa, sb]) {
      assert.deepEqual([...s.papers[id].order].sort((x, y) => x - y), [...Array(n).keys()]);
      Object.values(s.papers[id].perm).forEach(p => assert.deepEqual([...p].sort(), [0, 1, 2, 3]));
    }
    assert.notDeepEqual(sa.papers[id].order, sb.papers[id].order, "two attempts should differ");
    assert.notDeepEqual(sa.papers[id].order, [...Array(n).keys()], "order should not be the natural order");
  }
  // the source key is ~all "A" in Paper II; after shuffling the correct letter must be spread out
  const P2 = a.w.PAPERS.paper2.questions;
  const pos = [0, 0, 0, 0];
  P2.forEach(q => pos[sa.papers.paper2.perm[q.n].indexOf(q.answer)]++);
  assert.ok(Math.max(...pos) < 50, "correct answers should not cluster on one letter: " + pos);
  a.stop(); b.stop();
});

test("first question shown is the first of the shuffled order, numbered Q1", () => {
  const t = boot(); t.start("paper2");
  const { q } = t.shown();
  assert.equal(t.$(".qtext").textContent, q.q);
  assert.equal(t.$(".qno-big").textContent, "Q1");
  assert.equal(t.$$(".pbtn").length, 100);
  assert.ok(t.$(".pbtn.cur").textContent === "1");
  t.stop();
});

test("navigation, marking, clearing, keyboard and palette statuses", () => {
  const t = boot(); t.start("paper1");
  const first = t.shown().q;
  t.pick(first.answer);
  assert.ok(t.$(".opt.sel"));
  t.click("[data-act=next]");
  assert.equal(t.$(".qno-big").textContent, "Q2");
  t.click("[data-act=prev]");
  assert.equal(t.shown().q.n, first.n);
  // keyboard: "2" selects the 2nd displayed option, → moves on
  t.key("2");
  const st = t.state().papers.paper1;
  assert.equal(st.answers[first.n], st.perm[first.n][1]);
  t.key("ArrowRight");
  assert.equal(t.$(".qno-big").textContent, "Q2");
  // mark for review (unanswered) → jumps to next; Q2 is purple "m"
  t.click("[data-act=mark]");
  assert.equal(t.$(".qno-big").textContent, "Q3");
  assert.ok(t.$('[data-i="1"]').classList.contains("st-m"));
  // answered + marked
  t.click('[data-act=goto][data-i="1"]');
  t.pick(t.shown().q.answer);
  assert.ok(t.$('[data-i="1"]').classList.contains("st-am"));
  // clear response
  t.click("[data-act=clear]");
  assert.equal(t.state().papers.paper1.answers[t.shown().q.n], undefined);
  assert.ok(t.$('[data-i="1"]').classList.contains("st-m"));
  // visited-but-unanswered is red, unvisited is white
  t.click('[data-act=goto][data-i="2"]');
  t.click('[data-act=goto][data-i="3"]');
  assert.ok(t.$('[data-i="2"]').classList.contains("st-na"));
  assert.ok(t.$('[data-i="10"]').classList.contains("st-nv"));
  // bounds
  t.click('[data-act=goto][data-i="0"]');
  assert.ok(t.$("[data-act=prev]").disabled);
  t.click('[data-act=goto][data-i="49"]');
  t.click("[data-act=next]");
  assert.equal(t.$(".qno-big").textContent, "Q50");
  t.stop();
});

test("refresh mid-exam keeps answers, position, shuffle and the running clock", () => {
  const t = boot(); t.start("paper1");
  for (let i = 0; i < 5; i++) { t.pick(t.shown().q.answer); t.click("[data-act=next]"); }
  const before = t.state();
  const t2 = boot({ storage: t.dump() });
  const after = t2.state();
  assert.equal(after.phase, "exam");
  assert.deepEqual(after.papers.paper1.order, before.papers.paper1.order);
  assert.deepEqual(after.papers.paper1.answers, before.papers.paper1.answers);
  assert.equal(t2.$(".qno-big").textContent, "Q6");
  assert.equal(after.papers.paper1.endsAt, before.papers.paper1.endsAt);
  assert.ok(t2.$("#timer-txt").textContent.startsWith("59:") || t2.$("#timer-txt").textContent === "1:00:00");
  t.stop(); t2.stop();
});

test("submit dialog: cancel keeps working, confirm moves to Paper II", () => {
  const t = boot(); t.start("full");
  t.click("[data-act=ask-submit]");
  assert.match(t.$(".modal").textContent, /50 questions are unanswered/);
  t.click("[data-act=close-modal]");
  assert.equal(t.$(".modal"), null);
  assert.equal(t.state().phase, "exam");
  t.click("[data-act=ask-submit]");
  t.click("[data-act=submit]");
  const s = t.state();
  assert.equal(s.phase, "between");
  assert.equal(s.papers.paper1.status, "done");
  assert.match(t.$(".notice").textContent, /Paper I submitted/);
  assert.equal(t.$(".stp.done").textContent.includes("Paper I"), true);
  t.stop();
});

test("timer runs out live → paper auto-submits and Paper II is offered", async () => {
  const t = boot({ tweak: P => { P.paper1.minutes = 0.02; } }); // 1.2 seconds
  t.start("full");
  t.pick(t.shown().q.answer);
  await sleep(1800);
  const s = t.state();
  assert.equal(s.papers.paper1.status, "done");
  assert.equal(s.papers.paper1.auto, true);
  assert.equal(s.phase, "between");
  assert.match(t.$(".toast").textContent, /Time is up/);
  assert.match(t.$(".notice").textContent, /automatically/);
  t.stop();
});

test("returning after the deadline (tab closed) submits on load", () => {
  const t = boot(); t.start("paper2");
  t.pick(t.shown().q.answer);
  const store = t.dump();
  const s = JSON.parse(store[KEY]); s.papers.paper2.endsAt = Date.now() - 1000; store[KEY] = JSON.stringify(s);
  const t2 = boot({ storage: store });
  assert.equal(t2.state().phase, "result");
  assert.match(t2.$("h1").textContent, /you scored/);
  t.stop(); t2.stop();
});

function runFull(t, chooser) {
  for (const id of ["paper1", "paper2"]) {
    const n = t.w.PAPERS[id].questions.length;
    for (let i = 0; i < n; i++) {
      t.click(`[data-act=goto][data-i="${i}"]`);
      const q = t.shown().q;
      const c = chooser(q, id);
      if (c !== null) t.pick(c);
    }
    t.click("[data-act=ask-submit]"); t.click("[data-act=submit]");
    if (id === "paper1") t.click("[data-act=begin]");
  }
}

test("perfect paper scores 300/300 and qualifies", () => {
  const t = boot(); t.start("full");
  runFull(t, q => q.answer);
  assert.equal(t.$(".ring b").textContent, "300");
  assert.match(t.$("h1").textContent, /100%/);
  assert.match(t.$(".verdict").textContent, /Above/);
  assert.equal(t.$$(".focus-list li.weak").length, 0);
  t.stop();
});

test("all wrong scores 0 and is flagged below the qualifying mark", () => {
  const t = boot(); t.start("full");
  runFull(t, q => (q.answer + 1) % 4);
  assert.equal(t.$(".ring b").textContent, "0");
  assert.match(t.$(".verdict").textContent, /Below/);
  t.stop();
});

test("mixed answers: totals, per-section numbers, review filters and history all agree", () => {
  const t = boot(); t.start("full", "Priya");
  // deterministic pattern by ORIGINAL question number: n%5==0 skip, n%3==0 wrong, else right
  const choose = q => (q.n % 5 === 0 ? null : q.n % 3 === 0 ? (q.answer + 2) % 4 : q.answer);
  runFull(t, choose);
  const exp = { correct: 0, wrong: 0, skipped: 0, sec: {} };
  for (const id of ["paper1", "paper2"]) for (const q of t.w.PAPERS[id].questions) {
    const c = choose(q), k = c === null ? "skipped" : c === q.answer ? "correct" : "wrong";
    exp[k]++;
    const s = (exp.sec[q.section] ||= { correct: 0, wrong: 0, skipped: 0, total: 0 });
    s[k]++; s.total++;
  }
  const kpi = t.$$(".kpi b").map(b => b.textContent);
  assert.equal(+kpi[0], exp.correct);
  assert.equal(+kpi[1], exp.wrong);
  assert.equal(+kpi[2], exp.skipped);
  assert.equal(t.$(".ring b").textContent, String(exp.correct * 2));
  // section table rows
  const rows = t.$$("table.tbl tbody tr").filter(r => r.cells.length === 8);
  assert.equal(rows.length, 15);
  for (const r of rows) {
    const name = r.cells[0].textContent, s = exp.sec[name];
    assert.ok(s, "unknown section " + name);
    assert.deepEqual([+r.cells[1].textContent, +r.cells[2].textContent, +r.cells[3].textContent, +r.cells[4].textContent],
      [s.total, s.correct, s.wrong, s.skipped], name);
  }
  // review: all 150, filters match counts, listed in attempt order Q1..Qn
  assert.equal(t.$$(".rv").length, 150);
  const filter = label => { t.click(t.$$("[data-act=rf]").find(b => b.textContent.startsWith(label))); return t.$$(".rv").length; };
  assert.equal(filter("Wrong"), exp.wrong);
  assert.equal(filter("Not attempted"), exp.skipped);
  assert.equal(filter("Correct"), exp.correct);
  filter("All");
  const firstHeads = t.$$(".rv .rvhead b").slice(0, 3).map(b => b.textContent);
  assert.deepEqual(firstHeads, ["Paper I · Q1", "Paper I · Q2", "Paper I · Q3"]);
  // a wrong item shows the struck-through choice and the correct one
  filter("Wrong");
  assert.ok(t.$(".rv .ro.wrong") && t.$(".rv .ro.correct"));
  // history saved
  const h = JSON.parse(t.w.localStorage.getItem(HKEY));
  assert.equal(h.length, 1);
  assert.equal(h[0].name, "Priya");
  assert.equal(h[0].marks, exp.correct * 2);
  t.stop();
});

test("new attempt reshuffles and history accumulates", () => {
  const t = boot(); t.start("paper1");
  const order1 = t.state().papers.paper1.order;
  t.click("[data-act=ask-submit]"); t.click("[data-act=submit]");
  t.click("[data-act=retake]");
  t.click("[data-act=begin]");
  assert.notDeepEqual(t.state().papers.paper1.order, order1);
  t.click("[data-act=ask-submit]"); t.click("[data-act=submit]");
  assert.equal(JSON.parse(t.w.localStorage.getItem(HKEY)).length, 2);
  assert.ok(t.$$(".card h2").some(h => /Progress over attempts/.test(h.textContent)));
  t.stop();
});

test("a session saved by the previous version (no question order) still works", () => {
  const t = boot(); t.start("paper1");
  const store = t.dump();
  const s = JSON.parse(store[KEY]); delete s.papers.paper1.order; store[KEY] = JSON.stringify(s);
  const t2 = boot({ storage: store });
  assert.equal(t2.$(".qtext").textContent, t2.w.PAPERS.paper1.questions[0].q);
  t2.$(`[data-act=pick][data-orig="${t2.w.PAPERS.paper1.questions[0].answer}"]`).click();
  t2.click("[data-act=ask-submit]"); t2.click("[data-act=submit]");
  assert.equal(t2.$(".ring b").textContent, "2");
  t.stop(); t2.stop();
});

test("reload between papers lands on the Paper II start screen; Back from a not-started paper returns home", () => {
  const t = boot(); t.start("full");
  t.click("[data-act=ask-submit]"); t.click("[data-act=submit]");
  const t2 = boot({ storage: t.dump() });
  assert.equal(t2.state().phase, "between");
  assert.match(t2.$("[data-act=begin]").textContent, /Paper II/);
  const t3 = boot(); t3.$("#nm").value = "X"; t3.click("[data-act=start][data-mode=paper2]");
  t3.click("[data-act=home]");
  assert.equal(t3.state(), null);
  assert.ok(t3.$("#nm"));
  t.stop(); t2.stop(); t3.stop();
});
