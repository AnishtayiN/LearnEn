/* ================== LearnEn — ورود با گیت‌هاب (GitHub Sign-In) ==================
 *
 * هدف: وقتی کاربر روی «ورود با گیت‌هاب» می‌زند، باید ثابت کند صاحب یک حساب
 * واقعی گیت‌هاب است (نه ربات یا حساب فیک). از OAuth Device Flow گیت‌هاب
 * استفاده می‌کنیم که برخلاف وب‌فلو، به کلاینت‌سرت (client secret) نیاز ندارد.
 *
 * چرا پروکسی؟ چون گیت‌هاب روی مسیرهای OAuth هدر CORS نمی‌دهد و مرورگر اجازهٔ
 * تماس مستقیم نمی‌دهد. یک پروکسی بسیار کوچک (پوشهٔ oauth-proxy) این دو درخواست
 * را برای ما انجام می‌دهد. اطلاعات حساب کاربر از api.github.com گرفته می‌شود که
 * از CORS پشتیبانی می‌کند.
 *
 * ⚠️ قبل از استفاده:
 *   ۱) در js/auth.js مقدار CONFIG.proxy را به آدرس پروکسی خودتان تغییر دهید.
 *   ۲) CLIENT_ID اپلیکیشن OAuth خود را در متغیر محیطی پروکسی بگذارید
 *      و «Device Flow» را در تنظیمات اپ فعال کنید (توضیحات کامل در README).
 */
(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);

  /* ---------- پیکربندی ---------- */
  const CONFIG = {
    // آدرس پروکسی OAuth (Cloudflare Worker). اگر این مقدار خالی یا هنوز
    // placeholder باشد، دکمه فقط راهنمای راه‌اندازی را نشان می‌دهد.
    proxy: "https://learnen-oauth-proxy.YOUR_SUBDOMAIN.workers.dev",
    // دسترسی موردنیاز از گیت‌هاب؛ فقط «خواندن اطلاعات عمومی پروفایل».
    scope: "read:user",
  };

  const LS_USER = "learnen-gh-user";
  const SS_TOKEN = "learnen-gh-token";

  const GITHUB_SVG =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>';

  let pollTimer = null;

  /* ---------- ابزارهای کوچک ---------- */
  const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const faNum = (n) => Number(n ?? 0).toLocaleString("fa-IR");
  const getUser = () => { try { return JSON.parse(localStorage.getItem(LS_USER)); } catch { return null; } };
  const setUser = (u) => { try { localStorage.setItem(LS_USER, JSON.stringify(u)); } catch {} };
  const isConfigured = () => !!CONFIG.proxy && !CONFIG.proxy.includes("YOUR_SUBDOMAIN");

  /* ---------- دکمهٔ نوار بالا ---------- */
  function renderButton() {
    const btn = $("#ghAuthBtn");
    if (!btn) return;
    const u = getUser();
    if (u) {
      btn.classList.add("authed");
      btn.title = `ورود با حساب ${u.login}`;
      btn.innerHTML =
        `<img class="gh-ava" src="${escapeHtml(u.avatar_url)}" alt="" loading="lazy">` +
        `<span class="gh-login">${escapeHtml(u.login)}</span>` +
        `<span class="gh-verified" title="حساب گیت‌هاب تأیید شد">✓</span>`;
    } else {
      btn.classList.remove("authed");
      btn.title = "احراز هویت با گیت‌هاب";
      btn.innerHTML = GITHUB_SVG + '<span class="gh-label">ورود با گیت‌هاب</span>';
    }
  }

  /* ---------- مودال ---------- */
  function openModal() {
    stopPolling();
    const m = $("#ghModal");
    m.classList.add("open");
    m.setAttribute("aria-hidden", "false");
    const u = getUser();
    if (u) renderProfile(u);
    else renderSignedOut();
  }
  function closeModal() {
    stopPolling();
    const m = $("#ghModal");
    m.classList.remove("open");
    m.setAttribute("aria-hidden", "true");
  }
  function stopPolling() { if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; } }

  function renderSignedOut() {
    const body = $("#ghModalBody");
    if (!isConfigured()) {
      body.innerHTML =
        `<h3 id="ghModalTitle">ورود با گیت‌هاب</h3>` +
        `<div class="gh-note">این قابلیت هنوز برای این نسخه پیکربندی نشده است. برای فعال‌سازی:<br>` +
        `۱) یک OAuth App در گیت‌هاب بسازید و گزینهٔ <b>Device Flow</b> را فعال کنید.<br>` +
        `۲) پروکسی کوچک موجود در پوشهٔ <code>oauth-proxy</code> را روی Cloudflare Workers مستقر و <code>CLIENT_ID</code> را تنظیم کنید.<br>` +
        `۳) آدرس پروکسی را در <code>js/auth.js</code> (مقدار <code>CONFIG.proxy</code>) قرار دهید.<br>` +
        `جزئیات کامل در <code>README.md</code> آمده است.</div>`;
      return;
    }
    body.innerHTML =
      `<h3 id="ghModalTitle">ورود با گیت‌هاب</h3>` +
      `<p class="gh-sub">برای ادامه باید ثابت کنید صاحب یک حساب واقعی گیت‌هاب هستید (نه ربات یا حساب فیک). هیچ‌کدام از مخازن شما خوانده یا دستکاری نمی‌شود.</p>` +
      `<div class="gh-step" id="ghStep"></div>` +
      `<button class="btn btn-primary" id="ghStart">شروع احراز هویت</button>`;
    $("#ghStart").onclick = startDeviceFlow;
  }

  async function startDeviceFlow() {
    const step = $("#ghStep");
    if (!step) return;
    step.innerHTML = `<span class="gh-spinner"></span> در حال ساخت کد…`;
    try {
      const res = await fetch(`${CONFIG.proxy}/device`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: CONFIG.scope }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error_description || data.error || "خطا در ارتباط با سرور");
      if (!data.device_code || !data.user_code) throw new Error("پاسخ نامعتبر از سرور");
      renderDeviceCode(data);
      pollToken(data);
    } catch (err) {
      step.innerHTML =
        `<div class="gh-error">⚠️ ${escapeHtml(err.message)}</div>` +
        `<button class="btn btn-sm" id="ghRetry">تلاش دوباره</button>`;
      $("#ghRetry").onclick = startDeviceFlow;
    }
  }

  function renderDeviceCode(d) {
    const step = $("#ghStep");
    if (!step) return;
    step.innerHTML =
      `<p class="gh-sub">۱) این کد را کپی کنید:</p>` +
      `<div class="gh-code" dir="ltr" id="ghCode">${escapeHtml(d.user_code)}</div>` +
      `<button class="btn btn-sm" id="ghCopy">📋 کپی کد</button>` +
      `<p class="gh-sub">۲) روی دکمهٔ زیر بزنید و کد را در صفحهٔ گیت‌هاب وارد و تأیید کنید:</p>` +
      `<a class="btn btn-primary" id="ghOpenDevice" href="${escapeHtml(d.verification_uri || "https://github.com/login/device")}" target="_blank" rel="noopener">باز کردن گیت‌هاب 🔗</a>` +
      `<p class="gh-sub" id="ghStatus"><span class="gh-spinner"></span> در انتظار تأیید شما…</p>`;
    $("#ghCopy").onclick = () => {
      const code = d.user_code;
      const done = () => { const b = $("#ghCopy"); if (b) { b.textContent = "✓ کپی شد"; setTimeout(() => (b.textContent = "📋 کپی کد"), 1800); } };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done).catch(done);
      else done();
    };
  }

  async function pollToken(d) {
    const status = () => $("#ghStatus");
    let wait = Math.max(d.interval || 5, 5) * 1000;

    const tick = async () => {
      try {
        const res = await fetch(`${CONFIG.proxy}/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_code: d.device_code }),
        });
        const data = await res.json().catch(() => ({}));

        if (data.error === "authorization_pending") {
          if (status()) status().innerHTML = `<span class="gh-spinner"></span> در انتظار تأیید شما در گیت‌هاب…`;
          pollTimer = setTimeout(tick, wait);
          return;
        }
        if (data.error === "slow_down") {
          wait += 5000;
          if (status()) status().innerHTML = `<span class="gh-spinner"></span> کمی صبر کنید…`;
          pollTimer = setTimeout(tick, wait);
          return;
        }
        if (data.error) {
          if (data.error === "expired_token" || data.error === "token_expired") {
            if (status()) status().innerHTML = `<div class="gh-error">⏱️ کد منقضی شد. لطفاً دوباره شروع کنید.</div>`;
          } else if (data.error === "access_denied") {
            if (status()) status().innerHTML = `<div class="gh-error">🚫 شما درخواست را لغو کردید.</div>`;
          } else {
            if (status()) status().innerHTML = `<div class="gh-error">⚠️ ${escapeHtml(data.error_description || data.error)}</div>`;
          }
          return;
        }

        // موفقیت — دریافت اطلاعات حساب
        if (status()) status().innerHTML = `<span class="gh-spinner"></span> دریافت اطلاعات حساب…`;
        const user = await fetchProfile(data.access_token);
        if (user) {
          try { sessionStorage.setItem(SS_TOKEN, data.access_token); } catch {}
          setUser(user);
          renderButton();
          renderProfile(user);
        } else if (status()) {
          status().innerHTML = `<div class="gh-error">⚠️ دریافت اطلاعات حساب ناموفق بود.</div>`;
        }
      } catch (err) {
        if (status()) status().innerHTML = `<div class="gh-error">⚠️ خطای شبکه: ${escapeHtml(err.message)}</div>`;
      }
    };
    tick();
  }

  async function fetchProfile(token) {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) return null;
    const u = await res.json();
    u.verified_at = Date.now();
    return u;
  }

  /* ---------- نمایش پروفایل تأییدشده ---------- */
  function accountAge(createdAt) {
    if (!createdAt) return 0;
    return Math.floor((Date.now() - new Date(createdAt).getTime()) / 864e5); // روز
  }
  function trustLevel(u) {
    const age = accountAge(u.created_at);
    let points = 0;
    if (age >= 30) points++;
    if (age >= 365) points++;
    if (u.public_repos >= 1) points++;
    if (u.public_repos >= 5) points++;
    if (u.followers >= 1) points++;
    if (u.name || u.bio) points++;
    if (points >= 4) return { level: "strong", label: "قوی ✅", hint: "این حساب قدمت و فعالیت کافی دارد و احتمال فیک بودنش بسیار کم است." };
    if (points >= 2) return { level: "medium", label: "متوسط 🟡", hint: "حساب واقعی است اما هنوز فعالیت چندانی ندارد." };
    return { level: "new", label: "تازه 🆕", hint: "حساب تازه است؛ این یعنی یک حساب واقعی گیت‌هاب، هرچند کم‌سابقه." };
  }
  function ageText(days) {
    if (days <= 0) return "—";
    if (days < 60) return `${faNum(days)} روز`;
    if (days < 730) return `${faNum(Math.round(days / 30))} ماه`;
    return `${faNum(Math.round(days / 365))} سال`;
  }

  function renderProfile(u) {
    const body = $("#ghModalBody");
    if (!body) return;
    const trust = trustLevel(u);
    body.innerHTML =
      `<h3 id="ghModalTitle">حساب گیت‌هاب</h3>` +
      `<div class="gh-user">` +
      `<img class="gh-ava gh-ava-lg" src="${escapeHtml(u.avatar_url)}" alt="">` +
      `<div>` +
      `<div class="gh-name">${escapeHtml(u.name || u.login)}</div>` +
      `<div class="gh-at" dir="ltr">@${escapeHtml(u.login)}</div>` +
      `<div class="gh-badge-ok">✓ حساب تأییدشده — کاربر واقعی</div>` +
      `</div></div>` +
      `<div class="gh-stats">` +
      `<div class="gh-stat"><b>${ageText(accountAge(u.created_at))}</b><span>قدمت حساب</span></div>` +
      `<div class="gh-stat"><b>${faNum(u.public_repos)}</b><span>مخزن عمومی</span></div>` +
      `<div class="gh-stat"><b>${faNum(u.followers)}</b><span>دنبال‌کننده</span></div>` +
      `</div>` +
      `<div class="gh-trust ${trust.level}"><b>سطح اعتبار: ${trust.label}</b><p>${trust.hint}</p></div>` +
      `<div class="gh-actions">` +
      `<a class="btn btn-ghost btn-sm" href="https://github.com/${escapeHtml(u.login)}" target="_blank" rel="noopener">مشاهدهٔ پروفایل</a>` +
      `<button class="btn btn-danger btn-sm" id="ghSignOut">خروج</button>` +
      `</div>`;
    $("#ghSignOut").onclick = () => {
      try { localStorage.removeItem(LS_USER); sessionStorage.removeItem(SS_TOKEN); } catch {}
      renderButton();
      renderSignedOut();
    };
  }

  /* ---------- رویدادها ---------- */
  const btn = $("#ghAuthBtn");
  if (btn) btn.onclick = openModal;
  const close = $("#ghClose");
  if (close) close.onclick = closeModal;
  const overlay = $("#ghModal");
  if (overlay) {
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  /* ---------- شروع ---------- */
  renderButton();
})();
