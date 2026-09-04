/**
 * LearnEn — OAuth Proxy (نسخهٔ محلی برای تست)
 * ===========================================
 * همان کاری را می‌کند که worker.js انجام می‌دهد، اما با Node.js بدون هیچ
 * وابستگی خارجی (فقط کتابخانهٔ داخلی http و fetch سراسری که در Node 18+ موجود
 * است). از آن فقط برای تست محلی جریان OAuth استفاده کنید.
 *
 * استفاده:
 *   CLIENT_ID=YourOAuthAppClientId node server.js
 *   (اختیاری) PORT=8787  و  ALLOWED_ORIGIN=*
 *
 * سپس در js/auth.js مقدار CONFIG.proxy را روی http://localhost:8787 بگذارید.
 */

const http = require("http");

const CLIENT_ID = process.env.CLIENT_ID || "";
const PORT = Number(process.env.PORT || 8787);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

const GITHUB_DEVICE_URL = "https://github.com/login/device/code";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
  "Access-Control-Max-Age": "86400",
};

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json", ...cors });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }
  if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" });
  if (!CLIENT_ID)
    return sendJson(res, 500, { error: "missing_client_id", error_description: "CLIENT_ID is not set." });

  const body = await readBody(req);
  const url = new URL(req.url, "http://localhost");

  try {
    if (url.pathname.endsWith("/device")) {
      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        scope: typeof body.scope === "string" && body.scope ? body.scope : "read:user",
      });
      const upstream = await fetch(GITHUB_DEVICE_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "learnen-oauth-proxy",
        },
        body: params,
      });
      return sendJson(res, upstream.status, await upstream.json());
    }

    if (url.pathname.endsWith("/token")) {
      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        device_code: typeof body.device_code === "string" ? body.device_code : "",
        grant_type: GRANT_TYPE,
      });
      const upstream = await fetch(GITHUB_TOKEN_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "learnen-oauth-proxy",
        },
        body: params,
      });
      return sendJson(res, upstream.status, await upstream.json());
    }

    return sendJson(res, 404, { error: "not_found" });
  } catch (err) {
    return sendJson(res, 502, {
      error: "upstream_error",
      error_description: "Unable to reach GitHub: " + (err && err.message ? err.message : err),
    });
  }
});

server.listen(PORT, () => {
  console.log(`LearnEn OAuth proxy listening on http://localhost:${PORT}`);
  if (!CLIENT_ID) console.warn("⚠️  CLIENT_ID is not set — set it to your OAuth App client ID.");
});
