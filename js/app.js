/* ================== LearnEn APP ================== */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const fa = (n) => Number(n).toLocaleString("fa-IR");

  /* ---------- State ---------- */
  const KEY = "learnen-state-v1";
  const defaultState = () => ({
    xp: 0, streak: 0, bestStreak: 0, lastDay: null,
    lessons: [], words: [], quizzes: 0, correct: 0, total: 0, perfect: 0,
    fc: {}, theme: "dark", badges: [],
  });
  let S = load();
  function load() {
    try { return { ...defaultState(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return defaultState(); }
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(S)); updateTop(); checkBadges(); }

  function today() { return new Date().toISOString().slice(0, 10); }
  function touchStreak() {
    const t = today();
    if (S.lastDay === t) return;
    const y = new Date(); y.setDate(y.getDate() - 1);
    S.streak = S.lastDay === y.toISOString().slice(0, 10) ? S.streak + 1 : 1;
    S.bestStreak = Math.max(S.bestStreak, S.streak);
    S.lastDay = t;
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
  function loadVoices() { voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en")); }
  if ("speechSynthesis" in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  function speak(text, rate = 0.9) {
    if (!("speechSynthesis" in window)) return toast("مرورگر شما از تلفظ پشتیبانی نمی‌کند");
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US"; u.rate = rate;
    const v = voices.find((v) => /en-US/i.test(v.lang) && /Google|Samantha|Natural/i.test(v.name)) || voices.find((v) => /en-US/i.test(v.lang)) || voices[0];
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  }
  window.speakEn = speak;

  /* ---------- Theme ---------- */
  function applyTheme() {
    document.documentElement.dataset.theme = S.theme;
    $("#themeToggle").textContent = S.theme === "dark" ? "🌙" : "☀️";
  }
  $("#themeToggle").onclick = () => { S.theme = S.theme === "dark" ? "light" : "dark"; save(); applyTheme(); };

  /* ---------- Router ---------- */
  function navigate(page, param) {
    $$(".page").forEach((p) => p.classList.remove("active"));
    const el = $(`#page-${page}`);
    if (!el) return navigate("home");
    el.classList.add("active");
    $$(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.nav === page));
    $("#mainNav").classList.remove("open");
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (page === "lesson" && param) renderLesson(param);
    if (page === "progress") renderProgress();
    if (page === "flashcards") fcInit();
    if (page === "home") renderLevels();
  }
  function route() {
    const h = location.hash.replace("#", "") || "home";
    const [page, param] = h.split("/");
    navigate(page, param);
  }
  window.addEventListener("hashchange", route);
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-nav]");
    if (a && !a.getAttribute("href")) { location.hash = a.dataset.nav; }
  });
  $("#menuBtn").onclick = () => $("#mainNav").classList.toggle("open");

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
      return `<div class="level-card" style="--lc:${lv.color}" data-level="${lv.code}">
        <div class="level-code">${lv.code}</div>
        <div class="level-name">${lv.name}</div>
        <div class="level-desc">${lv.desc}</div>
        <div class="progress-bar"><i style="width:${pct}%"></i></div>
        <div class="level-desc" style="margin-top:6px">${fa(done)} / ${fa(ls.length)} درس</div>
      </div>`;
    }).join("");
    $$(".level-card").forEach((c) => c.onclick = () => { lessonFilter = c.dataset.level; location.hash = "lessons"; renderLessons(); });
  }
  function wordOfDay() {
    const idx = Math.floor(new Date() / 864e5) % VOCAB.length;
    const w = VOCAB[idx];
    $("#wodEn").textContent = w.en; $("#wodPh").textContent = w.ph; $("#wodFa").textContent = w.fa;
    $("#wodSpeak").onclick = () => speak(w.en);
  }

  /* ---------- Lessons ---------- */
  let lessonFilter = "all";
  function renderLessonFilters() {
    $("#lessonFilters").innerHTML = [`<button class="chip ${lessonFilter === "all" ? "active" : ""}" data-f="all">همه</button>`]
      .concat(LEVELS.map((l) => `<button class="chip ${lessonFilter === l.code ? "active" : ""}" data-f="${l.code}">${l.code} · ${l.name}</button>`)).join("");
    $$("#lessonFilters .chip").forEach((b) => b.onclick = () => { lessonFilter = b.dataset.f; renderLessons(); });
  }
  function renderLessons() {
    renderLessonFilters();
    const list = LESSONS.filter((l) => lessonFilter === "all" || l.level === lessonFilter);
    $("#lessonsGrid").innerHTML = list.map((l, i) => {
      const lv = LEVELS.find((x) => x.code === l.level);
      const done = S.lessons.includes(l.id);
      return `<div class="lesson-card" data-id="${l.id}" style="--lc:${lv.color};animation-delay:${i * 40}ms">
        <div class="l-top"><span class="l-level">${l.level}</span>${done ? '<span class="l-done">✓ تکمیل شد</span>' : ""}</div>
        <h3>${l.title}</h3><div class="l-en">${l.en}</div><p>${l.summary}</p></div>`;
    }).join("");
    $$(".lesson-card").forEach((c) => c.onclick = () => location.hash = "lesson/" + c.dataset.id);
  }
  function renderLesson(id) {
    const l = LESSONS.find((x) => x.id === id);
    if (!l) return navigate("lessons");
    const blocks = l.content.map((b) => {
      switch (b.type) {
        case "p": return `<section><p>${b.text}</p></section>`;
        case "rule": return `<section><h2>قاعده</h2><div class="rule-box">${b.html}</div></section>`;
        case "tip": return `<section><div class="tip">💡 ${b.text}</div></section>`;
        case "table": return `<section><table class="lesson-table"><thead><tr>${b.head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></section>`;
        case "examples": return `<section><h2>مثال‌ها</h2><div class="examples">${b.items.map(([en, fa]) => `<div class="example"><button class="speak-btn" data-say="${en.replace(/"/g, "&quot;")}">🔊</button><div><div class="ex-en">${en}</div><div class="ex-fa">${fa}</div></div></div>`).join("")}</div></section>`;
      }
    }).join("");
    const practice = l.practice.map((p, i) => `<div class="practice-q" data-i="${i}"><div class="q-text">${i + 1}. ${p.q}</div><div class="practice-opts">${p.opts.map((o, j) => `<button data-j="${j}">${o}</button>`).join("")}</div></div>`).join("");
    const done = S.lessons.includes(l.id);
    $("#lessonDetail").innerHTML = `<header><span class="l-level" style="--lc:${LEVELS.find((x) => x.code === l.level).color}">${l.level}</span><h1>${l.title}</h1><div class="l-en">${l.en}</div></header>
      ${blocks}
      <div class="lesson-practice"><h2>✍️ تمرین</h2>${practice}
      <button class="btn btn-primary complete-btn" id="completeLesson" ${done ? "disabled" : ""}>${done ? "✓ این درس تکمیل شده" : "اتمام درس (+۵۰ XP)"}</button></div>`;
    $$("[data-say]").forEach((b) => b.onclick = () => speak(b.dataset.say));
    let answered = 0;
    $$(".practice-q").forEach((q) => {
      const p = l.practice[q.dataset.i];
      $$("button", q).forEach((b) => b.onclick = () => {
        if (q.dataset.done) return;
        q.dataset.done = 1; answered++;
        const ok = +b.dataset.j === p.a;
        b.classList.add(ok ? "correct" : "wrong");
        if (!ok) $$("button", q)[p.a].classList.add("correct");
        if (ok) addXP(5, "✓");
      });
    });
    $("#completeLesson").onclick = () => {
      if (answered < l.practice.length) return toast("اول همهٔ تمرین‌ها را پاسخ دهید");
      S.lessons.push(l.id); addXP(50, "🎉 درس تکمیل شد"); renderLesson(id);
    };
  }

  /* ---------- Vocab ---------- */
  let vocabCat = "all", vocabQ = "";
  function renderVocabFilters() {
    const cats = ["all", ...Object.keys(VOCAB_CATEGORIES)];
    $("#vocabFilters").innerHTML = cats.map((c) => `<button class="chip ${vocabCat === c ? "active" : ""}" data-c="${c}">${c === "all" ? "همه" : VOCAB_CATEGORIES[c]}</button>`).join("");
    $$("#vocabFilters .chip").forEach((b) => b.onclick = () => { vocabCat = b.dataset.c; renderVocab(); });
  }
  function renderVocab() {
    renderVocabFilters();
    const q = vocabQ.trim().toLowerCase();
    const list = VOCAB.filter((w) => (vocabCat === "all" || w.cat === vocabCat) && (!q || w.en.includes(q) || w.fa.includes(q)));
    $("#vocabGrid").innerHTML = list.length ? list.map((w) => `<div class="vocab-card">
      <span class="v-cat">${w.level}</span>
      <button class="v-learned ${S.words.includes(w.en) ? "on" : ""}" data-w="${w.en}" title="یاد گرفتم">${S.words.includes(w.en) ? "✅" : "☑️"}</button>
      <div class="v-en">${w.en}</div><div class="v-ph">${w.ph}</div><div class="v-fa">${w.fa}</div>
      <div class="v-ex">${w.ex}</div>
      <button class="v-speak" data-say="${w.en}">🔊</button></div>`).join("") : `<div class="empty">چیزی پیدا نشد 🙁</div>`;
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
  let fcDeck = [], fcIdx = 0, fcReady = false;
  function fcInit() {
    if (!fcReady) {
      const sel = $("#fcCategory");
      sel.innerHTML = `<option value="all">همهٔ واژه‌ها</option><option value="due">🔁 مرور امروز</option>` +
        LEVELS.map((l) => `<option value="lvl:${l.code}">سطح ${l.code}</option>`).join("") +
        Object.entries(VOCAB_CATEGORIES).map(([k, v]) => `<option value="cat:${k}">${v}</option>`).join("");
      sel.onchange = fcBuild;
      $("#fcShuffle").onclick = () => { fcDeck.sort(() => Math.random() - 0.5); fcIdx = 0; fcShow(); };
      $("#flashcard").onclick = (e) => { if (!e.target.closest("#fcSpeak")) $("#flashcard").classList.toggle("flipped"); };
      $("#fcSpeak").onclick = () => speak(fcDeck[fcIdx].en);
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
    fcDeck.sort(() => Math.random() - 0.5);
    fcIdx = 0; fcShow();
  }
  function fcShow() {
    const card = $("#flashcard"); card.classList.remove("flipped");
    if (!fcDeck.length) { $("#fcFront").textContent = "🎉"; $("#fcPh").textContent = "کارتی برای مرور نیست"; $("#fcBack").textContent = ""; $("#fcCounter").textContent = ""; return; }
    const w = fcDeck[fcIdx];
    setTimeout(() => {
      $("#fcFront").textContent = w.en; $("#fcPh").textContent = w.ph;
      $("#fcBack").textContent = w.fa; $("#fcExample").textContent = w.ex;
    }, card.classList.contains("flipped") ? 300 : 0);
    $("#fcCounter").textContent = `${fa(fcIdx + 1)} / ${fa(fcDeck.length)}`;
  }
  function fcRate(rate) {
    if (!fcDeck.length) return;
    const w = fcDeck[fcIdx];
    const prev = S.fc[w.en] || { level: 0 };
    const lvl = rate === "hard" ? 0 : rate === "ok" ? prev.level + 1 : prev.level + 2;
    const days = [0.02, 1, 3, 7, 14, 30, 60][Math.min(lvl, 6)];
    S.fc[w.en] = { level: lvl, due: Date.now() + days * 864e5 };
    if (rate === "easy" && !S.words.includes(w.en)) S.words.push(w.en);
    addXP(rate === "easy" ? 3 : rate === "ok" ? 2 : 1);
    fcIdx = (fcIdx + 1) % fcDeck.length; fcShow();
  }

  /* ---------- Quiz ---------- */
  let quizLevel = "mixed", quizQs = [], qi = 0, qScore = 0;
  function renderQuizLevels() {
    const opts = [["mixed", "🎲 ترکیبی (تعیین سطح)"], ...LEVELS.map((l) => [l.code, `${l.code} · ${l.name}`])];
    $("#quizLevels").innerHTML = opts.map(([v, t]) => `<button class="chip ${quizLevel === v ? "active" : ""}" data-v="${v}">${t}</button>`).join("");
    $$("#quizLevels .chip").forEach((b) => b.onclick = () => { quizLevel = b.dataset.v; renderQuizLevels(); });
  }
  $("#quizStart").onclick = () => {
    const pool = quizLevel === "mixed" ? QUIZ : QUIZ.filter((q) => q.level === quizLevel);
    quizQs = [...pool].sort(() => Math.random() - 0.5).slice(0, 10);
    qi = 0; qScore = 0;
    $("#quizSetup").classList.add("hidden"); $("#quizResult").classList.add("hidden"); $("#quizBox").classList.remove("hidden");
    showQ();
  };
  function showQ() {
    const q = quizQs[qi];
    $("#quizBar").style.width = `${(qi / quizQs.length) * 100}%`;
    $("#quizNum").textContent = `سوال ${fa(qi + 1)} از ${fa(quizQs.length)} • ${q.level}`;
    $("#quizScore").textContent = `امتیاز: ${fa(qScore)}`;
    $("#quizQ").textContent = q.q;
    $("#quizExplain").classList.add("hidden"); $("#quizNext").classList.add("hidden");
    $("#quizAnswers").innerHTML = q.opts.map((o, i) => `<button data-i="${i}">${o}</button>`).join("");
    $$("#quizAnswers button").forEach((b) => b.onclick = () => {
      $$("#quizAnswers button").forEach((x) => x.disabled = true);
      const ok = +b.dataset.i === q.a;
      b.classList.add(ok ? "correct" : "wrong");
      $$("#quizAnswers button")[q.a].classList.add("correct");
      S.total++; if (ok) { S.correct++; qScore++; }
      if (q.ex) { $("#quizExplain").innerHTML = (ok ? "✅ درست! " : "❌ نادرست. ") + q.ex; $("#quizExplain").classList.remove("hidden"); }
      $("#quizScore").textContent = `امتیاز: ${fa(qScore)}`;
      $("#quizNext").classList.remove("hidden");
      $("#quizNext").textContent = qi + 1 < quizQs.length ? "سوال بعدی →" : "مشاهدهٔ نتیجه";
    });
  }
  $("#quizNext").onclick = () => { qi++; qi < quizQs.length ? showQ() : quizEnd(); };
  function quizEnd() {
    const pct = Math.round((qScore / quizQs.length) * 100);
    S.quizzes++; if (pct === 100) S.perfect++;
    const xp = qScore * 10 + (pct === 100 ? 50 : 0);
    addXP(xp, "آزمون تمام شد");
    const level = pct >= 90 ? "عالی! آمادهٔ سطح بعد هستید 🚀" : pct >= 70 ? "خوب! کمی مرور کنید 👍" : pct >= 50 ? "بد نیست، درس‌ها را دوباره بخوانید 📖" : "نگران نباشید، از درس‌های پایه شروع کنید 💪";
    const emoji = pct >= 90 ? "🏆" : pct >= 70 ? "🎉" : pct >= 50 ? "🙂" : "📚";
    $("#quizBox").classList.add("hidden");
    $("#quizResult").innerHTML = `<div class="big">${emoji}</div><h2>${fa(qScore)} از ${fa(quizQs.length)}</h2>
      <div class="ring" style="--pct:${pct}"><div>${fa(pct)}٪</div></div><p>${level}</p><p style="color:var(--muted)">+${fa(xp)} XP</p>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:20px"><button class="btn btn-primary" id="quizAgain">آزمون دوباره</button><button class="btn" data-nav="lessons">رفتن به درس‌ها</button></div>`;
    $("#quizResult").classList.remove("hidden");
    $("#quizAgain").onclick = () => { $("#quizResult").classList.add("hidden"); $("#quizSetup").classList.remove("hidden"); };
  }

  /* ---------- Speak ---------- */
  let spIdx = 0;
  function showSentence() {
    const [en, fa_] = SPEAK_SENTENCES[spIdx];
    $("#speakSentence").textContent = en; $("#speakFa").textContent = fa_; $("#speakResult").innerHTML = "";
  }
  $("#speakListen").onclick = () => speak(SPEAK_SENTENCES[spIdx][0], 0.85);
  $("#speakNext").onclick = () => { spIdx = (spIdx + 1) % SPEAK_SENTENCES.length; showSentence(); };
  $("#speakRecord").onclick = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return $("#speakResult").innerHTML = `<div class="tip">مرورگر شما از تشخیص گفتار پشتیبانی نمی‌کند. از Chrome یا Edge استفاده کنید.</div>`;
    const r = new SR(); r.lang = "en-US"; r.interimResults = false;
    $("#speakRecord").textContent = "🎙️ در حال گوش دادن…"; $("#speakRecord").disabled = true;
    r.onresult = (e) => {
      const heard = e.results[0][0].transcript;
      const target = SPEAK_SENTENCES[spIdx][0];
      const norm = (s) => s.toLowerCase().replace(/[^a-z' ]/g, "").split(/\s+/).filter(Boolean);
      const t = norm(target), h = norm(heard);
      const hits = t.filter((w) => h.includes(w)).length;
      const pct = Math.round((hits / t.length) * 100);
      const fb = pct >= 90 ? "🌟 عالی!" : pct >= 70 ? "👍 خوب بود" : pct >= 40 ? "🙂 بد نیست، دوباره تلاش کن" : "💪 دوباره گوش بده و تکرار کن";
      $("#speakResult").innerHTML = `<div class="heard">شنیده شد: "${heard}"</div><div class="score" style="color:${pct >= 70 ? "var(--success)" : "var(--warn)"}">${fa(pct)}٪ ${fb}</div>`;
      if (pct >= 70) addXP(5, "تلفظ");
    };
    r.onerror = (e) => $("#speakResult").innerHTML = `<div class="tip">خطا: ${e.error === "not-allowed" ? "دسترسی به میکروفون داده نشد" : e.error}</div>`;
    r.onend = () => { $("#speakRecord").textContent = "🎤 تکرار کن"; $("#speakRecord").disabled = false; };
    r.start();
  };
  function renderDialogs() {
    $("#dialogList").innerHTML = DIALOGS.map((d, i) => `<div class="dialog-item" data-i="${i}"><div class="d-title">${d.title}</div>${d.lines.map(([en, fa_]) => `<div class="d-en">${en}</div><div class="d-fa">${fa_}</div>`).join("")}</div>`).join("");
    $$(".dialog-item").forEach((el) => el.onclick = () => {
      const d = DIALOGS[el.dataset.i];
      speechSynthesis.cancel();
      d.lines.forEach(([en]) => { const u = new SpeechSynthesisUtterance(en.replace(/^[^:]+:\s*/, "")); u.lang = "en-US"; u.rate = 0.9; speechSynthesis.speak(u); });
      toast("در حال پخش مکالمه 🔊");
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
    $("#badgesGrid").innerHTML = BADGES.map((b) => `<div class="badge-item ${S.badges.includes(b.id) ? "" : "locked"}"><div class="b-icon">${b.icon}</div><div class="b-name">${b.name}</div><div class="b-desc">${b.desc}</div></div>`).join("");
  }
  function checkBadges() {
    BADGES.forEach((b) => { if (!S.badges.includes(b.id) && b.check(S)) { S.badges.push(b.id); localStorage.setItem(KEY, JSON.stringify(S)); setTimeout(() => toast(`🏅 نشان جدید: ${b.name}`), 800); } });
  }
  $("#resetProgress").onclick = () => { if (confirm("همهٔ پیشرفت شما پاک می‌شود. مطمئنید؟")) { const th = S.theme; S = defaultState(); S.theme = th; save(); renderProgress(); toast("پیشرفت پاک شد"); } };

  /* ---------- Init ---------- */
  function init() {
    applyTheme(); updateTop();
    animateNum($("#statLessons"), LESSONS.length); animateNum($("#statWords"), VOCAB.length); animateNum($("#statQuestions"), QUIZ.length + LESSONS.reduce((a, l) => a + l.practice.length, 0));
    wordOfDay(); renderLevels(); renderLessons(); renderVocab(); renderQuizLevels(); showSentence(); renderDialogs();
    route();
  }
  init();
})();
