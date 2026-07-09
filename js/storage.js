import { DEFAULT_SETTINGS, SEED_SCOREBOARD } from "./constants.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

const SETTINGS_KEY = "mathtetris_settings";
const SCOREBOARD_FALLBACK_KEY = "mathtetris_scoreboard_extra";

function getSupabase() {
  if (SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.includes("YOUR-PROJECT")) {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return null;
}

export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    const settings = { ...DEFAULT_SETTINGS };
    for (const key of Object.keys(settings)) {
      if (typeof raw[key] === "number") settings[key] = raw[key];
    }
    return settings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function loadScoreboard() {
  const client = getSupabase();
  if (client) {
    const { data, error } = await client
      .from("scoreboard")
      .select("*")
      .order("best_score", { ascending: false })
      .limit(100);
    if (!error && data) return data;
  }
  let extra = [];
  try {
    extra = JSON.parse(localStorage.getItem(SCOREBOARD_FALLBACK_KEY) || "[]");
    if (!Array.isArray(extra)) extra = [];
  } catch { extra = []; }
  return [...SEED_SCOREBOARD, ...extra].sort((a, b) => b.best_score - a.best_score);
}

export async function appendScoreboardEntry(entry) {
  const client = getSupabase();
  if (client) {
    await client.from("scoreboard").insert(entry);
  } else {
    let extra = [];
    try {
      extra = JSON.parse(localStorage.getItem(SCOREBOARD_FALLBACK_KEY) || "[]");
      if (!Array.isArray(extra)) extra = [];
    } catch { extra = []; }
    extra.push(entry);
    localStorage.setItem(SCOREBOARD_FALLBACK_KEY, JSON.stringify(extra));
  }
  return loadScoreboard();
}
