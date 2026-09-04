/* ================== LearnEn APP ================== */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const fa = (n) => Number(n).toLocaleString("fa-IR");
  // Data is injected into innerHTML in many places; escaping keeps apostrophes
  // (e.g. "I'd like…") from breaking attributes and blocks any HTML injection.
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // Search normaliser: folds case plus the Arabic/Persian letter pairs (ي→ی, ك→ک)
  // and diacritics/ZWNJ, so "كتاب" and "کتاب" both match what the data stores.
  const norm = (s) => String(s ?? "").toLowerCase().trim()
    .replace(/[\u064A\u0649]/g, "\u06CC").replace(/\u0643/g, "\u06A9")
    .replace(/[\u0622\u0623\u0625]/g, "\u0627")
    .replace(/[\u064B-\u0652\u200C\u200F\u200E]/g, "")
    .replace(/\s+/g, " ");

  /* ---------- State ---------- */
  const KEY = "learnen-state-v1";
  const defaultState = () => ({
    xp: 0, streak: 0, bestStreak: 0, lastDay: null,
    lessons: [], words: [], quizzes: 0, correct: 0, total: 0, perfect: 0,
    fc: {}, theme: "dark", badges: [],
  });
  let S = load();
  function load() {
    const base = defaultState();
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { raw = null; }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
    const s = { ...base, ...raw };
    // Sanitise: a corrupted/hand-edited localStorage must never crash the app.
    const num = (v, d = 0) => (Number.isFinite(+v) && +v >= 0 ? +v : d);
    const arr = (v) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === "string"))] : []);
    s.xp = num(s.xp); s.streak = num(s.streak); s.bestStreak = num(s.bestStreak);
    s.quizzes = num(s.quizzes); s.correct = num(s.correct); s.total = num(s.total); s.perfect = num(s.perfect);
    s.lessons = arr(s.lessons).filter((id) => LESSONS.some((l) => l.id === id));
    s.words = arr(s.words).filter((w) => VOCAB.some((v) => v.en === w));
    s.badges = arr(s.badges).filter((b) => BADGES.some((x) => x.id === b));
    s.theme = s.theme === "light" ? "light" : "dark";
    s.fc = s.fc && typeof s.fc === "object" && !Array.isArray(s.fc) ? s.fc : {};
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    if (typeof s.lastDay !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s.lastDay)) s.lastDay = null;
    return s;
  }
  function save() {
    // Private/full storage must degrade gracefully instead of throwing.
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {}
    updateTop(); checkBadges();
  }

  // Local (not UTC) date key — otherwise the streak flips at the wrong hour for users east/west of UTC.
  function dayKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function touchStreak() {
    const t = dayKey();
    if (S.lastDay === t) return;
    const y = new Date(); y.setDate(y.getDate() - 1);
    S.streak = S.lastDay === dayKey(y) ? S.streak + 1 : 1;
    S.bestStreak = Math.max(S.bestStreak, S.streak);
    S.lastDay = t;
  }
  // Expire a broken streak on load so the header never shows a stale 🔥 count.
  function refreshStreak() {
    if (!S.lastDay) return;
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (S.lastDay !== dayKey() && S.lastDay !== dayKey(y) && S.streak !== 0) { S.streak = 0; save(); }
  }
  function addXP(n, msg) { touchStreak(); S.xp += n; save(); toast(`+${fa(n)} XP ${msg || ""}`); }

  /* ---------- Toast ---------- */
  let toastT;
  function toast(msg) {
    const el = $("#toast"); el.textContent = msg; el.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("show"), 2200);
  }

  /* ---------- Speech ---------- */
  let voices = [];
  function loadVoices() {
    if (!("speechSynthesis" in window)) return;
    voices = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
  }
  if ("speechSynthesis" in window) {
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
    // Some browsers populate getVoices() asynchronously without firing the event.
    setTimeout(loadVoices, 300);
    setTimeout(loadVoices, 1200);
  }
  function pickVoice() {
    if (!voices.length) loadVoices();
    return voices.find((v) => /en-US/i.test(v.lang) && /Google|Samantha|Natural|Aria|Jenny/i.test(v.name))
      || voices.find((v) => /en-US/i.test(v.lang))
      || voices.find((v) => /en-GB/i.test(v.lang))
      || voices[0];
  }
  function speak(text, rate = 0.9) {
    if (!("speechSynthesis" in window)) return toast("مرورگر شما از تلفظ پشتیبانی نمی‌کند");
    speechSynthesis.cancel();
    // Chrome can leave the queue paused after a cancel(); resume() unsticks it.
    if (speechSynthesis.paused) speechSynthesis.resume();
    const u = new SpeechSynthesisUtterance(String(text));
    u.lang = "en-US"; u.rate = rate;
    const v = pickVoice();
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  }
  window.speakEn = speak;
  // Stop narration when the tab is hidden — audio continuing in the background is jarring.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && "speechSynthesis" in window) speechSynthesis.cancel();
  });

  /* ---------- Theme ---------- */
  function applyTheme() {
    document.documentElement.dataset.theme = S.theme;
    const b = $("#themeToggle");
    b.textContent = S.theme === "dark" ? "🌙" : "☀️";
    b.setAttribute("aria-label", S.theme === "dark" ? "تغییر به تم روشن" : "تغییر به تم تاریک");
    // Keep the browser UI (address bar) in step with the theme.
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", S.theme === "dark" ? "#0b0f1a" : "#f5f7fb");
  }
  $("#themeToggle").onclick = () => { S.theme = S.theme === "dark" ? "light" : "dark"; save(); applyTheme(); };

  /* ---------- Router ---------- */
  const PAGES = ["home", "lessons", "lesson", "vocab", "flashcards", "quiz", "speak", "progress"];
  function navigate(page, param) {
    // "lesson" is only reachable with a valid id; anything unknown falls back home.
    if (!PAGES.includes(page) || (page === "lesson" && !param)) page = "home";
    if (page === "lesson" && !LESSONS.some((l) => l.id === param)) { page = "lessons"; param = null; }
    $$(".page").forEach((p) => p.classList.remove("active"));
    const el = $(`#page-${page}`);
    if (!el) return;
    el.classList.add("active");
    // The nav highlight should follow the parent section when reading a lesson.
    const navKey = page === "lesson" ? "lessons" : page;
    $$(".nav a").forEach((a) => {
      const on = a.dataset.nav === navKey;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    closeMenu();
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (page === "lesson") renderLesson(param);
    if (page === "lessons") renderLessons();
    if (page === "vocab") renderVocab();
    if (page === "progress") renderProgress();
    if (page === "flashcards") fcInit();
    if (page === "home") renderLevels();
    document.title = PAGE_TITLES[page] || "LearnEn | یادگیری کامل زبان انگلیسی";
  }
  const PAGE_TITLES = {
    home: "LearnEn | یادگیری کامل زبان انگلیسی",
    lessons: "درس‌ها | LearnEn", lesson: "درس | LearnEn", vocab: "واژگان | LearnEn",
    flashcards: "فلش‌کارت | LearnEn", quiz: "آزمون | LearnEn", speak: "تلفظ | LearnEn",
    progress: "پیشرفت | LearnEn",
  };
  function route() {
    const h = decodeURIComponent(location.hash.replace(/^#/, "")) || "home";
    const [page, param] = h.split("/");
    navigate(page, param);
  }
  window.addEventListener("hashchange", route);
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-nav]");
    if (!a) return;
    // Anchors already carry an href; only synthesise navigation for buttons/divs.
    if (!a.getAttribute("href")) { e.preventDefault(); location.hash = a.dataset.nav; }
    closeMenu();
  });
  function closeMenu() {
    $("#mainNav").classList.remove("open");
    $("#menuBtn").setAttribute("aria-expanded", "false");
  }
  $("#menuBtn").onclick = (e) => {
    e.stopPropagation();
    const open = $("#mainNav").classList.toggle("open");
    $("#menuBtn").setAttribute("aria-expanded", String(open));
  };
  // Tapping outside the drawer or pressing Escape should dismiss it.
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#mainNav") && !e.target.closest("#menuBtn")) closeMenu();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });

  /* ---------- Top bar ---------- */
  function updateTop() { $("#streakCount").textContent = fa(S.streak); $("#xpCount").textContent = fa(S.xp); }

  /* ---------- Home ---------- */
  function animateNum(el, to) {
    let n = 0; const step = Math.max(1, Math.ceil(to / 40));
    const t = setInterval(() => { n = Math.min(to, n + step); el.textContent = fa(n); if (n >= to) clearInterval(t); }, 25);
  }
  function renderLevels() {
    $("#levelsGrid").innerHTML = LEVELS.map((lv) => {
      const ls = LESSONS.filter((l) => l.level === lv.code);
      const done = ls.filter((l) => S.lessons.includes(l.id)).length;
      const pct = ls.length ? Math.round((done / ls.length) * 100) : 0;
      return `<div class="level-card" style="--lc:${lv.color}" data-level="${esc(lv.code)}" role="button" tabindex="0" aria-label="سطح ${esc(lv.code)} — ${esc(lv.name)}، ${fa(done)} از ${fa(ls.length)} درس">
        <div class="level-code">${esc(lv.code)}</div>
        <div class="level-name">${esc(lv.name)}</div>
        <div class="level-desc">${esc(lv.desc)}</div>
        <div class="progress-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
        <div class="level-desc" style="margin-top:6px">${fa(done)} / ${fa(ls.length)} درس${pct === 100 ? " ✅" : ""}</div>
      </div>`;
    }).join("");
    $$(".level-card").forEach((c) => {
      const open = () => { lessonFilter = c.dataset.level; location.hash = "lessons"; renderLessons(); };
      c.onclick = open;
      c.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
    });
  }
  function wordOfDay() {
    // Derive from the local calendar date so the word flips at local midnight.
    const d = new Date();
    const idx = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5) % VOCAB.length;
    const w = VOCAB[idx];
    $("#wodEn").textContent = w.en; $("#wodPh").textContent = w.ph; $("#wodFa").textContent = w.fa;
    $("#wodEx").textContent = w.ex;
    $("#wodSpeak").onclick = () => speak(w.en);
  }

  /* ---------- Lessons ---------- */
  let lessonFilter = "all";
  function renderLessonFilters() {
    const count = (c) => LESSONS.filter((l) => c === "all" || l.level === c).length;
    const chip = (v, label) => `<button class="chip ${lessonFilter === v ? "active" : ""}" type="button" data-f="${esc(v)}" aria-pressed="${lessonFilter === v}">${esc(label)} <span class="chip-n">${fa(count(v))}</span></button>`;
    $("#lessonFilters").innerHTML = [chip("all", "همه")]
      .concat(LEVELS.map((l) => chip(l.code, `${l.code} · ${l.name}`))).join("");
    $$("#lessonFilters .chip").forEach((b) => b.onclick = () => { lessonFilter = b.dataset.f; renderLessons(); });
  }
  function renderLessons() {
    renderLessonFilters();
    const list = LESSONS.filter((l) => lessonFilter === "all" || l.level === lessonFilter);
    $("#lessonsGrid").innerHTML = list.length ? list.map((l, i) => {
      const lv = LEVELS.find((x) => x.code === l.level) || { color: "var(--grad)" };
      const done = S.lessons.includes(l.id);
      return `<div class="lesson-card${done ? " is-done" : ""}" data-id="${esc(l.id)}" style="--lc:${lv.color};animation-delay:${Math.min(i, 12) * 40}ms" role="button" tabindex="0" aria-label="${esc(l.title)}${done ? " — تکمیل شده" : ""}">
        <div class="l-top"><span class="l-level">${esc(l.level)}</span>${done ? '<span class="l-done">✓ تکمیل شد</span>' : ""}</div>
        <h3>${esc(l.title)}</h3><div class="l-en" lang="en">${esc(l.en)}</div><p>${esc(l.summary)}</p>
        <div class="l-meta">${fa(l.practice.length)} تمرین</div></div>`;
    }).join("") : `<div class="empty">درسی در این سطح نیست.</div>`;
    $$(".lesson-card").forEach((c) => {
      const open = () => { location.hash = "lesson/" + c.dataset.id; };
      c.onclick = open;
      c.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } };
    });
  }
  function renderLesson(id) {
    const l = LESSONS.find((x) => x.id === id);
    if (!l) return navigate("lessons");
    const blocks = l.content.map((b) => {
      switch (b.type) {
        case "p": return `<section><p>${b.text}</p></section>`;
        case "rule": return `<section><h2>قاعده</h2><div class="rule-box">${b.html}</div></section>`;
        case "tip": return `<section><div class="tip">💡 ${b.text}</div></section>`;
        case "table": return `<section class="table-wrap"><table class="lesson-table"><thead><tr>${b.head.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></section>`;
        case "examples": return `<section><h2>مثال‌ها</h2><div class="examples">${b.items.map(([en, fa_]) => `<div class="example"><button class="speak-btn" data-say="${esc(en)}" aria-label="تلفظ جمله">🔊</button><div><div class="ex-en" lang="en">${esc(en)}</div><div class="ex-fa">${esc(fa_)}</div></div></div>`).join("")}</div></section>`;
        default: return "";
      }
    }).join("");
    const practice = l.practice.map((p, i) => `<div class="practice-q" data-i="${i}"><div class="q-text" lang="en">${i + 1}. ${esc(p.q)}</div><div class="practice-opts">${p.opts.map((o, j) => `<button type="button" data-j="${j}">${esc(o)}</button>`).join("")}</div></div>`).join("");
    const done = S.lessons.includes(l.id);
    const prog = `<div class="lesson-progress"><span id="practiceCount">۰</span> از ${fa(l.practice.length)} تمرین پاسخ داده شد</div>`;
    $("#lessonDetail").innerHTML = `<header><span class="l-level" style="--lc:${LEVELS.find((x) => x.code === l.level).color}">${esc(l.level)}</span><h1>${esc(l.title)}</h1><div class="l-en" lang="en">${esc(l.en)}</div></header>
      ${blocks}
      <div class="lesson-practice"><h2>✍️ تمرین</h2>${practice}${prog}
      <button class="btn btn-primary complete-btn" type="button" id="completeLesson" ${done ? "disabled" : ""}>${done ? "✓ این درس تکمیل شده" : "اتمام درس (+۵۰ XP)"}</button></div>`;
    // Scope the speak binding to this lesson — a global selector also grabbed
    // the vocabulary cards and made them read out the wrong word.
    const root = $("#lessonDetail");
    $$("[data-say]", root).forEach((b) => b.onclick = () => speak(b.dataset.say));
    let answered = 0;
    $$(".practice-q", root).forEach((q) => {
      const p = l.practice[+q.dataset.i];
      $$("button", q).forEach((b) => b.onclick = () => {
        if (q.dataset.done) return;
        q.dataset.done = 1; answered++;
        $("#practiceCount", root).textContent = fa(answered);
        const ok = +b.dataset.j === p.a;
        b.classList.add(ok ? "correct" : "wrong");
        if (!ok) $$("button", q)[p.a].classList.add("correct");
        $$("button", q).forEach((x) => (x.disabled = true));
        if (ok) addXP(5, "✓");
        if (answered === l.practice.length && !S.lessons.includes(l.id)) toast("همهٔ تمرین‌ها انجام شد — درس را تمام کنید ✅");
      });
    });
    $("#completeLesson").onclick = () => {
      if (answered < l.practice.length) return toast("اول همهٔ تمرین‌ها را پاسخ دهید");
      if (!S.lessons.includes(l.id)) S.lessons.push(l.id); // guard against duplicate ids
      addXP(50, "🎉 درس تکمیل شد");
      renderLesson(id);
      renderLessons(); // keep the lesson list's ✓ state in sync
      renderLevels();
    };
  }

  /* ---------- Vocab ---------- */
  let vocabCat = "all", vocabQ = "";
  function renderVocabFilters() {
    const cats = ["all", ...Object.keys(VOCAB_CATEGORIES)];
    $("#vocabFilters").innerHTML = cats.map((c) => {
      const n = VOCAB.filter((w) => c === "all" || w.cat === c).length;
      return `<button class="chip ${vocabCat === c ? "active" : ""}" type="button" data-c="${esc(c)}" aria-pressed="${vocabCat === c}">${esc(c === "all" ? "همه" : VOCAB_CATEGORIES[c])} <span class="chip-n">${fa(n)}</span></button>`;
    }).join("");
    $$("#vocabFilters .chip").forEach((b) => b.onclick = () => { vocabCat = b.dataset.c; renderVocab(); });
  }
  function renderVocab() {
    renderVocabFilters();
    const q = norm(vocabQ);
    const list = VOCAB.filter((w) => (vocabCat === "all" || w.cat === vocabCat) &&
      (!q || norm(w.en).includes(q) || norm(w.fa).includes(q) || norm(w.ex).includes(q)));
    $("#vocabCount").textContent = list.length ? `${fa(list.length)} واژه` : "";
    $("#vocabGrid").innerHTML = list.length ? list.map((w) => {
      const known = S.words.includes(w.en);
      return `<div class="vocab-card${known ? " known" : ""}">
      <span class="v-cat">${esc(w.level)}</span>
      <button class="v-learned ${known ? "on" : ""}" type="button" data-w="${esc(w.en)}" aria-pressed="${known}" title="${known ? "یاد گرفتم — برای لغو کلیک کنید" : "علامت‌زدن به‌عنوان یادگرفته‌شده"}">${known ? "✅" : "☑️"}</button>
      <div class="v-en" lang="en">${esc(w.en)}</div><div class="v-ph" lang="en">${esc(w.ph)}</div><div class="v-fa">${esc(w.fa)}</div>
      <div class="v-ex" lang="en">${esc(w.ex)}</div>
      <button class="v-speak" type="button" data-say="${esc(w.en)}" aria-label="تلفظ ${esc(w.en)}">🔊</button></div>`;
    }).join("") : `<div class="empty">چیزی پیدا نشد 🙁<br><span>املای دیگری را امتحان کنید یا فیلتر دسته را روی «همه» بگذارید.</span></div>`;
    $$("#vocabGrid [data-say]").forEach((b) => b.onclick = () => speak(b.dataset.say));
    $$(".v-learned").forEach((b) => b.onclick = () => {
      const w = b.dataset.w;
      if (S.words.includes(w)) { S.words = S.words.filter((x) => x !== w); save(); }
      else { S.words.push(w); addXP(2, "واژهٔ جدید"); }
      renderVocab();
    });
  }
  $("#vocabSearch").oninput = (e) => { vocabQ = e.target.value; renderVocab(); };

  /* ---------- Flashcards (SRS-lite) ---------- */
  let fcDeck = [], fcIdx = 0, fcReady = false, fcT = null;
  // Fisher–Yates: sort(() => Math.random() - 0.5) is a biased, non-uniform shuffle.
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function fcInit() {
    if (!fcReady) {
      const sel = $("#fcCategory");
      sel.innerHTML = `<option value="all">همهٔ واژه‌ها</option><option value="due">🔁 مرور امروز</option>` +
        LEVELS.map((l) => `<option value="lvl:${esc(l.code)}">سطح ${esc(l.code)}</option>`).join("") +
        Object.entries(VOCAB_CATEGORIES).map(([k, v]) => `<option value="cat:${esc(k)}">${esc(v)}</option>`).join("");
      sel.onchange = fcBuild;
      $("#fcShuffle").onclick = () => { shuffle(fcDeck); fcIdx = 0; fcShow(); };
      const flip = () => $("#flashcard").classList.toggle("flipped");
      $("#flashcard").onclick = (e) => { if (!e.target.closest("#fcSpeak")) flip(); };
      // Keyboard support: the card is a real control, not just a clickable div.
      $("#flashcard").onkeydown = (e) => {
        if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); }
      };
      $("#fcSpeak").onclick = (e) => { e.stopPropagation(); if (fcDeck[fcIdx]) speak(fcDeck[fcIdx].en); };
      $$(".fc-rate button").forEach((b) => b.onclick = () => fcRate(b.dataset.rate));
      fcReady = true;
    }
    fcBuild();
  }
  function fcBuild() {
    const v = $("#fcCategory").value;
    const now = Date.now();
    if (v === "due") fcDeck = VOCAB.filter((w) => !S.fc[w.en] || S.fc[w.en].due <= now);
    else if (v.startsWith("lvl:")) fcDeck = VOCAB.filter((w) => w.level === v.slice(4));
    else if (v.startsWith("cat:")) fcDeck = VOCAB.filter((w) => w.cat === v.slice(4));
    else fcDeck = [...VOCAB];
    shuffle(fcDeck);
    fcIdx = 0; fcShow();
  }
  function fcShow() {
    const card = $("#flashcard");
    // Read the flip state BEFORE clearing it, otherwise the delay is always 0
    // and the next word appears while the card is still visibly flipped.
    const wasFlipped = card.classList.contains("flipped");
    card.classList.remove("flipped");
    if (!fcDeck.length) {
      $("#fcFront").textContent = "🎉"; $("#fcPh").textContent = "کارتی برای مرور نیست";
      $("#fcBack").textContent = ""; $("#fcExample").textContent = ""; $("#fcCounter").textContent = "";
      $$(".fc-rate button").forEach((b) => (b.disabled = true));
      return;
    }
    $$(".fc-rate button").forEach((b) => (b.disabled = false));
    const w = fcDeck[fcIdx];
    clearTimeout(fcT);
    const paint = () => {
      $("#fcFront").textContent = w.en; $("#fcPh").textContent = w.ph;
      $("#fcBack").textContent = w.fa; $("#fcExample").textContent = w.ex;
    };
    if (wasFlipped) fcT = setTimeout(paint, 320); else paint();
    $("#fcCounter").textContent = `${fa(fcIdx + 1)} / ${fa(fcDeck.length)}`;
  }
  function fcRate(rate) {
    if (!fcDeck.length) return;
    const w = fcDeck[fcIdx];
    const prevLvl = Math.max(0, Number(S.fc[w.en] && S.fc[w.en].level) || 0);
    const lvl = Math.max(0, rate === "hard" ? 0 : rate === "ok" ? prevLvl + 1 : prevLvl + 2);
    const days = [0.02, 1, 3, 7, 14, 30, 60][Math.min(lvl, 6)];
    S.fc[w.en] = { level: lvl, due: Date.now() + days * 864e5 };
    if (rate === "easy" && !S.words.includes(w.en)) S.words.push(w.en);
    addXP(rate === "easy" ? 3 : rate === "ok" ? 2 : 1);
    // Wrapping to 0 silently restarted the deck; announce the finished round instead.
    if (fcIdx + 1 >= fcDeck.length) { fcIdx = 0; toast("دور کامل شد! 🎉 از نو شروع می‌شود"); }
    else fcIdx++;
    fcShow();
  }

  /* ---------- Quiz ---------- */
  let quizLevel = "mixed", quizQs = [], qi = 0, qScore = 0;
  function renderQuizLevels() {
    const opts = [["mixed", "🎲 ترکیبی (تعیین سطح)"], ...LEVELS.map((l) => [l.code, `${l.code} · ${l.name}`])];
    $("#quizLevels").innerHTML = opts.map(([v, t]) => `<button class="chip ${quizLevel === v ? "active" : ""}" type="button" data-v="${esc(v)}" aria-pressed="${quizLevel === v}">${esc(t)}</button>`).join("");
    $$("#quizLevels .chip").forEach((b) => b.onclick = () => { quizLevel = b.dataset.v; renderQuizLevels(); });
  }
  $("#quizStart").onclick = () => {
    const pool = quizLevel === "mixed" ? QUIZ : QUIZ.filter((q) => q.level === quizLevel);
    if (!pool.length) return toast("برای این سطح سوالی موجود نیست");
    // Shuffle each question's options too, so answers aren't always in the same slot.
    quizQs = shuffle([...pool]).slice(0, 10).map((q) => {
      const order = shuffle(q.opts.map((_, i) => i));
      return { ...q, opts: order.map((i) => q.opts[i]), a: order.indexOf(q.a) };
    });
    qi = 0; qScore = 0;
    $("#quizSetup").classList.add("hidden"); $("#quizResult").classList.add("hidden"); $("#quizBox").classList.remove("hidden");
    showQ();
  };
  function showQ() {
    const q = quizQs[qi];
    // Fill the bar by questions *completed*, and make the last answer reach 100%.
    $("#quizBar").style.width = `${(qi / quizQs.length) * 100}%`;
    $("#quizBar").parentElement.setAttribute("aria-valuenow", String(qi));
    $("#quizNum").textContent = `سوال ${fa(qi + 1)} از ${fa(quizQs.length)} • ${q.level}`;
    $("#quizScore").textContent = `امتیاز: ${fa(qScore)}`;
    $("#quizQ").textContent = q.q;
    $("#quizExplain").classList.add("hidden"); $("#quizNext").classList.add("hidden");
    $("#quizAnswers").innerHTML = q.opts.map((o, i) => `<button type="button" data-i="${i}"><span class="q-key">${i + 1}</span>${esc(o)}</button>`).join("");
    const answer = (b) => {
      if (b.disabled) return;
      $$("#quizAnswers button").forEach((x) => x.disabled = true);
      const ok = +b.dataset.i === q.a;
      b.classList.add(ok ? "correct" : "wrong");
      $$("#quizAnswers button")[q.a].classList.add("correct");
      S.total++; if (ok) { S.correct++; qScore++; }
      $("#quizBar").style.width = `${((qi + 1) / quizQs.length) * 100}%`;
      if (q.ex) { $("#quizExplain").innerHTML = (ok ? "✅ درست! " : "❌ نادرست. ") + esc(q.ex); $("#quizExplain").classList.remove("hidden"); }
      else { $("#quizExplain").innerHTML = ok ? "✅ درست!" : "❌ نادرست."; $("#quizExplain").classList.remove("hidden"); }
      $("#quizScore").textContent = `امتیاز: ${fa(qScore)}`;
      $("#quizNext").classList.remove("hidden");
      $("#quizNext").textContent = qi + 1 < quizQs.length ? "سوال بعدی →" : "مشاهدهٔ نتیجه";
      $("#quizNext").focus();
      save();
    };
    $$("#quizAnswers button").forEach((b) => (b.onclick = () => answer(b)));
    quizKeyHandler = (e) => {
      if (!$("#page-quiz").classList.contains("active") || $("#quizBox").classList.contains("hidden")) return;
      const btns = $$("#quizAnswers button");
      if (/^[1-9]$/.test(e.key) && btns[+e.key - 1]) { e.preventDefault(); answer(btns[+e.key - 1]); }
      else if (e.key === "Enter" && !$("#quizNext").classList.contains("hidden")) { e.preventDefault(); $("#quizNext").click(); }
    };
  }
  let quizKeyHandler = null;
  document.addEventListener("keydown", (e) => quizKeyHandler && quizKeyHandler(e));
  $("#quizNext").onclick = () => { qi++; qi < quizQs.length ? showQ() : quizEnd(); };
  function quizEnd() {
    const pct = Math.round((qScore / quizQs.length) * 100);
    S.quizzes++; if (pct === 100) S.perfect++;
    const xp = qScore * 10 + (pct === 100 ? 50 : 0);
    addXP(xp, "آزمون تمام شد");
    const level = pct >= 90 ? "عالی! آمادهٔ سطح بعد هستید 🚀" : pct >= 70 ? "خوب! کمی مرور کنید 👍" : pct >= 50 ? "بد نیست، درس‌ها را دوباره بخوانید 📖" : "نگران نباشید، از درس‌های پایه شروع کنید 💪";
    const emoji = pct >= 90 ? "🏆" : pct >= 70 ? "🎉" : pct >= 50 ? "🙂" : "📚";
    $("#quizBox").classList.add("hidden");
    const suggest = quizLevel === "mixed"
      ? `<p class="quiz-suggest">سطح پیشنهادی شما: <b>${pct >= 85 ? "B2 / C1" : pct >= 65 ? "B1" : pct >= 45 ? "A2" : "A1"}</b></p>` : "";
    $("#quizResult").innerHTML = `<div class="big">${emoji}</div><h2>${fa(qScore)} از ${fa(quizQs.length)}</h2>
      <div class="ring" style="--pct:${pct}"><div>${fa(pct)}٪</div></div><p>${level}</p>${suggest}<p style="color:var(--muted)">+${fa(xp)} XP</p>
      <div class="quiz-result-actions"><button class="btn btn-primary" type="button" id="quizAgain">آزمون دوباره</button><button class="btn" type="button" data-nav="lessons">رفتن به درس‌ها</button></div>`;
    $("#quizResult").classList.remove("hidden");
    $("#quizResult").focus();
    $("#quizAgain").onclick = () => { $("#quizResult").classList.add("hidden"); $("#quizSetup").classList.remove("hidden"); renderQuizLevels(); };
  }

  /* ---------- Speak ---------- */
  let spIdx = 0, recognizer = null;
  function showSentence() {
    const [en, fa_] = SPEAK_SENTENCES[spIdx];
    $("#speakSentence").textContent = en; $("#speakFa").textContent = fa_; $("#speakResult").innerHTML = "";
    $("#speakCounter").textContent = `${fa(spIdx + 1)} / ${fa(SPEAK_SENTENCES.length)}`;
  }
  $("#speakListen").onclick = () => speak(SPEAK_SENTENCES[spIdx][0], 0.85);
  $("#speakNext").onclick = () => { spIdx = (spIdx + 1) % SPEAK_SENTENCES.length; showSentence(); };
  $("#speakPrev").onclick = () => { spIdx = (spIdx - 1 + SPEAK_SENTENCES.length) % SPEAK_SENTENCES.length; showSentence(); };
  $("#speakRecord").onclick = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return $("#speakResult").innerHTML = `<div class="tip">مرورگر شما از تشخیص گفتار پشتیبانی نمی‌کند. از Chrome یا Edge استفاده کنید.</div>`;
    // Stop any in-flight session; starting twice throws InvalidStateError.
    if (recognizer) { try { recognizer.abort(); } catch {} recognizer = null; }
    speechSynthesis.cancel(); // don't let the TTS voice be recorded as the user
    const r = new SR(); recognizer = r;
    r.lang = "en-US"; r.interimResults = false; r.maxAlternatives = 3;
    const btn = $("#speakRecord");
    btn.textContent = "🎙️ در حال گوش دادن…"; btn.disabled = true; btn.classList.add("recording");
    const reset = () => { btn.textContent = "🎤 تکرار کن"; btn.disabled = false; btn.classList.remove("recording"); recognizer = null; };
    r.onresult = (e) => {
      const target = SPEAK_SENTENCES[spIdx][0];
      const words = (s) => s.toLowerCase().replace(/[^a-z' ]/g, " ").split(/\s+/).filter(Boolean);
      const t = words(target);
      // Score every alternative and keep the best — recognisers often rank a
      // closer match second. Count each target word only once (multiset match).
      let best = { pct: 0, heard: e.results[0][0].transcript };
      for (let i = 0; i < e.results[0].length; i++) {
        const heard = e.results[0][i].transcript;
        const pool = words(heard);
        let hits = 0;
        t.forEach((w) => { const k = pool.indexOf(w); if (k > -1) { pool.splice(k, 1); hits++; } });
        const pct = t.length ? Math.round((hits / t.length) * 100) : 0;
        if (pct > best.pct) best = { pct, heard };
      }
      const { pct, heard } = best;
      const fb = pct >= 90 ? "🌟 عالی!" : pct >= 70 ? "👍 خوب بود" : pct >= 40 ? "🙂 بد نیست، دوباره تلاش کن" : "💪 دوباره گوش بده و تکرار کن";
      $("#speakResult").innerHTML = `<div class="heard" lang="en">شنیده شد: «${esc(heard)}»</div><div class="score" style="color:${pct >= 70 ? "var(--success)" : "var(--warn)"}">${fa(pct)}٪ ${fb}</div>`;
      if (pct >= 70) addXP(5, "تلفظ");
    };
    r.onerror = (e) => {
      const msg = { "not-allowed": "دسترسی به میکروفون داده نشد", "service-not-allowed": "سرویس تشخیص گفتار در دسترس نیست", "no-speech": "صدایی شنیده نشد؛ دوباره تلاش کنید", network: "خطای شبکه", aborted: "" }[e.error];
      if (msg !== "") $("#speakResult").innerHTML = `<div class="tip">${esc(msg || e.error)}</div>`;
      reset();
    };
    r.onend = reset;
    try { r.start(); } catch { reset(); }
  };
  let playingDialog = null;
  function renderDialogs() {
    $("#dialogList").innerHTML = DIALOGS.map((d, i) => `<div class="dialog-item" data-i="${i}" role="button" tabindex="0" aria-label="پخش مکالمهٔ ${esc(d.title)}"><div class="d-title">${esc(d.title)} <span class="d-play">▶</span></div>${d.lines.map(([en, fa_]) => `<div class="d-en" lang="en">${esc(en)}</div><div class="d-fa">${esc(fa_)}</div>`).join("")}</div>`).join("");
    const play = (el) => {
      const d = DIALOGS[+el.dataset.i];
      speechSynthesis.cancel();
      // Clicking the same dialog again stops playback instead of stacking a second read-through.
      if (playingDialog === el) { playingDialog = null; el.classList.remove("playing"); toast("پخش متوقف شد"); return; }
      $$(".dialog-item").forEach((x) => x.classList.remove("playing"));
      playingDialog = el; el.classList.add("playing");
      if (!("speechSynthesis" in window)) return toast("مرورگر شما از تلفظ پشتیبانی نمی‌کند");
      d.lines.forEach(([en], idx) => {
        const u = new SpeechSynthesisUtterance(en.replace(/^[^:]+:\s*/, ""));
        u.lang = "en-US"; u.rate = 0.9;
        const v = pickVoice();
        if (v) u.voice = v;
        if (idx === d.lines.length - 1) u.onend = () => { el.classList.remove("playing"); if (playingDialog === el) playingDialog = null; };
        speechSynthesis.speak(u);
      });
      toast("در حال پخش مکالمه 🔊");
    };
    $$(".dialog-item").forEach((el) => {
      el.onclick = () => play(el);
      el.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); play(el); } };
    });
  }

  /* ---------- Progress & Badges ---------- */
  function renderProgress() {
    $("#pXp").textContent = fa(S.xp); $("#pStreak").textContent = fa(S.streak);
    $("#pLessons").textContent = `${fa(S.lessons.length)}/${fa(LESSONS.length)}`;
    $("#pWords").textContent = fa(S.words.length); $("#pQuizzes").textContent = fa(S.quizzes);
    $("#pAcc").textContent = S.total ? fa(Math.round((S.correct / S.total) * 100)) + "٪" : "—";
    $("#levelProgress").innerHTML = LEVELS.map((lv) => {
      const ls = LESSONS.filter((l) => l.level === lv.code); const done = ls.filter((l) => S.lessons.includes(l.id)).length;
      const pct = ls.length ? Math.round((done / ls.length) * 100) : 0;
      return `<div class="lp-row"><b>${lv.code}</b><div class="progress-bar" style="margin:0;--lc:${lv.color}"><i style="width:${pct}%"></i></div><span>${fa(pct)}٪</span></div>`;
    }).join("");
    const earned = BADGES.filter((b) => S.badges.includes(b.id)).length;
    $("#badgeCount").textContent = `${fa(earned)} از ${fa(BADGES.length)}`;
    $("#badgesGrid").innerHTML = BADGES.map((b) => `<div class="badge-item ${S.badges.includes(b.id) ? "" : "locked"}" title="${esc(b.desc)}"><div class="b-icon">${b.icon}</div><div class="b-name">${esc(b.name)}</div><div class="b-desc">${esc(b.desc)}</div></div>`).join("");
  }
  function checkBadges() {
    BADGES.forEach((b) => {
      let hit = false;
      // A badge predicate must never be able to break the whole save path.
      try { hit = !S.badges.includes(b.id) && b.check(S); } catch { hit = false; }
      if (hit) {
        S.badges.push(b.id);
        try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {}
        setTimeout(() => toast(`🏅 نشان جدید: ${b.name}`), 800);
      }
    });
  }
  $("#resetProgress").onclick = () => {
    if (!confirm("همهٔ پیشرفت شما پاک می‌شود. مطمئنید؟")) return;
    const th = S.theme;
    S = defaultState(); S.theme = th;
    save();
    // Re-render every view, otherwise stale ✓ marks and counters linger.
    renderProgress(); renderLevels(); renderLessons(); renderVocab();
    if (fcReady) fcBuild();
    toast("پیشرفت پاک شد");
  };

  /* ---------- Init ---------- */
  function init() {
    applyTheme(); refreshStreak(); updateTop();
    animateNum($("#statLessons"), LESSONS.length);
    animateNum($("#statWords"), VOCAB.length);
    animateNum($("#statQuestions"), QUIZ.length + LESSONS.reduce((a, l) => a + l.practice.length, 0));
    wordOfDay(); renderLevels(); renderLessons(); renderVocab(); renderQuizLevels(); showSentence(); renderDialogs();
    route();
    document.body.classList.add("ready");
  }
  // A single failure must not leave the user staring at a blank page.
  try { init(); }
  catch (err) {
    console.error("LearnEn init failed:", err);
    document.body.classList.add("ready");
    const t = $("#toast");
    if (t) { t.textContent = "خطایی رخ داد؛ لطفاً صفحه را تازه کنید"; t.classList.add("show"); }
  }
})();
