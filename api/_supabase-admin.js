const FETCH_TIMEOUT_MS = 8000;

function config() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const secret = String(process.env.SUPABASE_SECRET_KEY || "").trim();
  if (!url || !secret) throw new Error("SUPABASE_URL / SUPABASE_SECRET_KEY 서버 설정이 없습니다.");
  return { url, secret };
}

async function supabaseAdminFetch(path, options = {}) {
  if (!String(path || "").startsWith("/")) throw new Error("Supabase API 경로가 올바르지 않습니다.");
  const { url, secret } = config();
  return fetch(`${url}${path}`, {
    ...options,
    signal: options.signal || AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      apikey: secret,
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });
}

module.exports = { supabaseAdminFetch };
