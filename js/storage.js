import { DEFAULT_SETTINGS, SEED_SCOREBOARD } from "./constants.js";

const SETTINGS_KEY = "mathtetris_settings";
const SCOREBOARD_KEY = "mathtetris_scoreboard_extra";

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

export function loadScoreboard() {
  let extra = [];
  try {
    extra = JSON.parse(localStorage.getItem(SCOREBOARD_KEY) || "[]");
    if (!Array.isArray(extra)) extra = [];
  } catch {
    extra = [];
  }
  return [...SEED_SCOREBOARD, ...extra].sort((a, b) => b.best_score - a.best_score);
}

export function appendScoreboardEntry(entry) {
  let extra = [];
  try {
    extra = JSON.parse(localStorage.getItem(SCOREBOARD_KEY) || "[]");
    if (!Array.isArray(extra)) extra = [];
  } catch {
    extra = [];
  }
  extra.push(entry);
  localStorage.setItem(SCOREBOARD_KEY, JSON.stringify(extra));
  return loadScoreboard();
}
