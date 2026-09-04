/**
 * LearnEn — OAuth Proxy (Cloudflare Worker)
 * =========================================
 * یک پروکسی بسیار کوچک برای «ورود با گیت‌هاب» در سایت LearnEn.
 *
 * چرا لازم است؟ چون گیت‌هاب روی مسیرهای OAuth هدر CORS نمی‌دهد و مرورگر
 * اجازهٔ تماس مستقیم از یک سایت استاتیک را نمی‌دهد. این Worker فقط دو درخواست
 * مشخص را به گیت‌هاب ارسال می‌کند و پاسخ را با هدر CORS برمی‌گرداند.
 *
 * این Worker از OAuth **Device Flow** استفاده می‌کند که به client_secret نیاز
 * ندارد؛ بنابراین هیچ رازی داخل Worker ذخیره نمی‌شود و فقط CLIENT_ID لازم است.
 *
 * تنظیمات لازم (متغیر محیطی):
 *   CLIENT_ID        شناسهٔ OAuth App شما در گیت‌هاب (اجباری)
 *   ALLOWED_ORIGIN   (اختیاری) برای محدودکردن دامنه‌ها؛ پیش‌فرض: *
 *
 * مسیرها:
 *   POST /device   → ساخت کد دستگاه در گیت‌هاب
 *   POST /token    → دریافت توکن پس از تأیید کاربر
 */

const GITHUB_DEVICE_URL = "https://github.com/login/device/code";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

function corsHeaders(env) {
  const origin = (env && env.ALLOWED_ORIGIN) || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
  };
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(env);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, cors);
    }

    const CLIENT_ID = (env && env.CLIENT_ID) || "";
    if (!CLIENT_ID) {
      return json(
        { error: "missing_client_id", error_description: "CLIENT_ID is not set on the Worker." },
        500,
        cors
      );
    }

    const body = await request.json().catch(() => ({}));

    try {
      if (url.pathname.endsWith("/device")) {
        const params = new URLSearchParams({
          client_id: CLIENT_ID,
          scope: typeof body.scope === "string" && body.scope ? body.scope : "read:user",
        });
        const res = await fetch(GITHUB_DEVICE_URL, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "learnen-oauth-proxy",
          },
          body: params,
        });
        return json(await res.json(), res.status, cors);
      }

      if (url.pathname.endsWith("/token")) {
        const params = new URLSearchParams({
          client_id: CLIENT_ID,
          device_code: typeof body.device_code === "string" ? body.device_code : "",
          grant_type: GRANT_TYPE,
        });
        const res = await fetch(GITHUB_TOKEN_URL, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "learnen-oauth-proxy",
          },
          body: params,
        });
        return json(await res.json(), res.status, cors);
      }

      return json({ error: "not_found" }, 404, cors);
    } catch (err) {
      return json(
        { error: "upstream_error", error_description: "Unable to reach GitHub: " + (err && err.message ? err.message : err) },
        502,
        cors
      );
    }
  },
};
