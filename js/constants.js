export const COLS = 10;
export const ROWS = 20;
export const CELL = 36;
export const SIDE = 210;
export const TOP_PAD = 20;
export const BOARD_X = SIDE;
export const BOARD_W = COLS * CELL;
export const WIDTH = SIDE * 2 + BOARD_W;
export const HEIGHT = ROWS * CELL + TOP_PAD * 2;

export const COLORS_BG = {
  BG: "#f4f7fb",
  GRID: "#c8d7e6",
  PANEL: "#ffffff",
  PLAY_BG: "#edf4fb",
  PLAY_PANEL: "#ffffff",
  PLAY_LINE: "#1f2937",
  PLAY_GRID: "#d9e4ef",
  TEXT: "#1f2937",
  MUTED: "#64748b",
  ACCENT: "#2563eb",
  ACCENT_DARK: "#1d4ed8",
  SOFT_PANEL: "#f8fafc",
  SOFT_LINE: "#dbe5f0",
  GHOST: "#94a3b8",
  BLOCK_FILL: "#ffffff",
  BLOCK_EDGE: "#2563eb",
  GOOD: "#22c55e",
  BAD: "#ef4444",
};

export const PRIME_SCORE = 10;
export const COMPOSITE_SCORE = -15;
export const DISCARD_PRIME_PENALTY = -10;
export const DISCARD_COMPOSITE_BONUS = 20;
export const SOFT_DROP_SLOWDOWN = 1.37;
export const PRIME_CHANCE = 0.6;
export const EVEN_COMPOSITE_WEIGHT = 0.18;
export const FIVE_COMPOSITE_WEIGHT = 0.28;
export const THREE_COMPOSITE_WEIGHT = 0.47;
export const TIME_SPEEDUP_MS_PER_SECOND = 5.6;
export const T_SPIN_SCORE_MULTIPLIER = 2;
export const OTHER_SPIN_SCORE_MULTIPLIER = 2;
export const IMMOBILE_SPIN_KINDS = new Set(["S", "Z", "L", "J", "I", "O"]);
export const DANGER_TOP_ROWS = 4;
export const CLEAR_STEP_DELAY = 0.09;
export const CLEAR_FINAL_DELAY = 1.5;
export const PIECE_ANIMATION_SPEED = 120;
export const GAME_TIME_LIMIT = 180;
export const LOCK_DELAY = 0.5;
export const LOCK_RESET_LIMIT = 15;

export const KEY_ALIASES = {
  "ㅁ": "a",
  "ㅇ": "d",
  "ㄴ": "s",
  "ㅈ": "w",
  "ㅋ": "z",
  "ㅌ": "x",
  "ㅊ": "c",
  "ㄱ": "r",
  "ㅔ": "p",
};
export const REPEAT_KEYS = new Set(["left", "right", "down", "a", "d", "s"]);

export const COLORS = { I: "#45d6ad", O: "#d6c65a", T: "#c94ab8", S: "#86c64a", Z: "#d94f55", J: "#d7834c", L: "#6957c9" };
export const COLOR_EDGES = { I: "#15936f", O: "#9e9137", T: "#8d267d", S: "#5a9130", Z: "#983037", J: "#9b5429", L: "#42358f" };
export const COLOR_LIGHTS = { I: "#6ff0c7", O: "#eee27d", T: "#e36bd1", S: "#a7df66", Z: "#ef7076", J: "#ee9a63", L: "#8372e2" };
export const COLOR_SHADOWS = { I: "#107457", O: "#786d28", T: "#6f1d62", S: "#437022", Z: "#77262c", J: "#793f1d", L: "#33286f" };

export const SHAPES = {
  I: { 0: [[-1, 0], [0, 0], [1, 0], [2, 0]], 1: [[1, -1], [1, 0], [1, 1], [1, 2]], 2: [[-1, 1], [0, 1], [1, 1], [2, 1]], 3: [[0, -1], [0, 0], [0, 1], [0, 2]] },
  O: { 0: [[0, 0], [1, 0], [0, 1], [1, 1]], 1: [[0, 0], [1, 0], [0, 1], [1, 1]], 2: [[0, 0], [1, 0], [0, 1], [1, 1]], 3: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  T: { 0: [[0, -1], [-1, 0], [0, 0], [1, 0]], 1: [[0, -1], [0, 0], [0, 1], [1, 0]], 2: [[-1, 0], [0, 0], [1, 0], [0, 1]], 3: [[0, -1], [0, 0], [0, 1], [-1, 0]] },
  S: { 0: [[0, -1], [1, -1], [-1, 0], [0, 0]], 1: [[0, -1], [0, 0], [1, 0], [1, 1]], 2: [[0, 0], [1, 0], [-1, 1], [0, 1]], 3: [[-1, -1], [-1, 0], [0, 0], [0, 1]] },
  Z: { 0: [[-1, -1], [0, -1], [0, 0], [1, 0]], 1: [[1, -1], [0, 0], [1, 0], [0, 1]], 2: [[-1, 0], [0, 0], [0, 1], [1, 1]], 3: [[0, -1], [-1, 0], [0, 0], [-1, 1]] },
  J: { 0: [[-1, -1], [-1, 0], [0, 0], [1, 0]], 1: [[0, -1], [1, -1], [0, 0], [0, 1]], 2: [[-1, 0], [0, 0], [1, 0], [1, 1]], 3: [[0, -1], [0, 0], [-1, 1], [0, 1]] },
  L: { 0: [[1, -1], [-1, 0], [0, 0], [1, 0]], 1: [[0, -1], [0, 0], [0, 1], [1, 1]], 2: [[-1, 0], [0, 0], [1, 0], [-1, 1]], 3: [[-1, -1], [0, -1], [0, 0], [0, 1]] },
};
export const SPAWN_Y = { I: 0, O: 0, T: 1, S: 1, Z: 1, J: 1, L: 1 };

export const JLSTZ_KICKS = {
  "0,1": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "1,0": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "1,2": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  "2,1": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "2,3": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "3,2": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "3,0": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "0,3": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
};
export const I_KICKS = {
  "0,1": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "1,0": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  "1,2": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  "2,1": [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  "2,3": [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  "3,2": [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  "3,0": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "0,3": [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
};

export const SFX_VOLUME = 0.48;
export const BGM_VOLUME = 0.6;
export const BGM_PITCH_MULTIPLIER = 1.55;
export const BGM_UNIT_SECONDS = 0.135;
export const BGM_SEQUENCE = [
  "E5:2", "B4:1", "C5:1", "D5:2", "C5:1", "B4:1",
  "A4:2", "A4:1", "C5:1", "E5:2", "D5:1", "C5:1",
  "B4:3", "C5:2", "D5:2", "E5:2", "C5:2", "A4:2",
  "A4:4", "D5:2", "F5:1", "A5:1", "G5:2", "F5:1",
  "E5:1", "C5:2", "E5:1", "D5:1", "C5:3", "C5:2",
  "D5:2", "E5:2", "C5:2", "A4:2", "A4:4",
];

export const SFX_NOTES = {
  lock: [[170, 0.045], [120, 0.055], [220, 0.035]],
  count: [[740, 0.035], [920, 0.025]],
  clear: [[520, 0.06], [680, 0.06], [860, 0.09]],
  button: [[560, 0.035], [760, 0.035]],
  final: [[880, 0.07], [1175, 0.08], [1568, 0.12]],
  rotate: [[1280, 0.018], [1660, 0.018]],
  discard: [[360, 0.035], [220, 0.045]],
};

export const DEFAULT_SETTINGS = { das_ms: 95, arr_ms: 18, soft_drop_ms: 8, starting_level: 1 };

export const SETTING_ROWS = [
  ["das_ms", "DAS", "hold delay", 50, 300, 10, "ms"],
  ["arr_ms", "ARR", "side repeat", 10, 120, 5, "ms"],
  ["soft_drop_ms", "SOFT", "down repeat", 5, 120, 1, "ms"],
  ["starting_level", "START", "level", 1, 15, 1, ""],
];

export const SENSITIVITY_PRESETS = [
  ["안정형", { das_ms: 135, arr_ms: 32, soft_drop_ms: 22 }, "천천히 정확하게"],
  ["표준형", { das_ms: 95, arr_ms: 18, soft_drop_ms: 10 }, "기본 추천"],
  ["빠른형", { das_ms: 65, arr_ms: 10, soft_drop_ms: 6 }, "빠른 이동"],
];

export const DIFFICULTIES = [
  ["easy", "쉬움", 100, "기본 판별 연습"],
  ["normal", "보통", 200, "두 자리와 세 자리 초반"],
  ["hard", "어려움", 300, "세 자리 수 판별"],
  ["expert", "전문가", 400, "큰 수가 자주 섞임"],
  ["master", "마스터", 500, "최고 난이도"],
];

export const SEED_SCOREBOARD = [
  { student_id: "2514", name: "꾸이", best_score: 5850, runs: 1, difficulty: "보통", max_number: 200, played_at: "2026-07-02 14:52:21" },
  { student_id: "2514", name: "꾸삼", best_score: 1350, runs: 1, difficulty: "쉬움", max_number: 100, played_at: "2026-07-02 15:00:05" },
  { student_id: "심찬", name: "바보", best_score: 600, runs: 3, difficulty: "쉬움", max_number: 100, played_at: "2026-07-01 23:50:10" },
  { student_id: "2222", name: "김게이", best_score: 575, runs: 1, difficulty: "마스터", max_number: 500, played_at: "2026-07-02 15:02:16" },
  { student_id: "2209", name: "송예준", best_score: 300, runs: 1, difficulty: "보통", max_number: 200, played_at: "2026-07-02 14:56:45" },
  { student_id: "2218", name: "정선재", best_score: 0, runs: 2, difficulty: "보통", max_number: 100, played_at: "2026-07-01 21:47:08" },
  { student_id: "2218", name: "정선재", best_score: 0, runs: 1, difficulty: "마스터", max_number: 500, played_at: "2026-07-02 15:00:31" },
  { student_id: "2218", name: "정선재", best_score: 0, runs: 1, difficulty: "보통", max_number: 200, played_at: "2026-07-08 11:07:49" },
  { student_id: "2218", name: "정선재", best_score: -175, runs: 1, difficulty: "쉬움", max_number: 50, played_at: "2026-07-01 21:26:16" },
];
