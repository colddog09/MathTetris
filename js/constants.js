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
  BG: "#fdfcf8",
  GRID: "#d8ceb8",
  PANEL: "#ffffff",
  PLAY_BG: "#f5f1e8",
  PLAY_PANEL: "#ffffff",
  PLAY_LINE: "#2a2620",
  PLAY_GRID: "#d5decf",
  TEXT: "#2a2620",
  MUTED: "#7a7264",
  ACCENT: "#2f6b4f",
  ACCENT_DARK: "#24543e",
  SOFT_PANEL: "#f7f3ea",
  SOFT_LINE: "#d8ceb8",
  GHOST: "#9b978d",
  BLOCK_FILL: "#fdfcf8",
  BLOCK_EDGE: "#2f6b4f",
  GOOD: "#2f6b4f",
  BAD: "#b85f3d",
};

export const PRIME_SCORE = 10;
export const COMPOSITE_SCORE = -25;
export const DISCARD_PRIME_PENALTY = -100;
export const DISCARD_COMPOSITE_BONUS = 30;
export const SOFT_DROP_SLOWDOWN = 1.37;
export const PRIME_CHANCE = 0.6;
export const EVEN_COMPOSITE_WEIGHT = 0.18;
export const FIVE_COMPOSITE_WEIGHT = 0.28;
export const THREE_COMPOSITE_WEIGHT = 0.47;
export const TIME_SPEEDUP_MS_PER_SECOND = 4.5;
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
export const REPEAT_KEYS = new Set(["left", "right", "down", "d", "s"]);

export const COLORS = { I: "#4fa9a1", O: "#d2b84f", T: "#9d6cad", S: "#78a85a", Z: "#c85f5b", J: "#5f76b5", L: "#cf824c" };
export const COLOR_EDGES = { I: "#2f7771", O: "#927d2e", T: "#6e477a", S: "#4f7739", Z: "#8d3e3b", J: "#3e5184", L: "#92562f" };
export const COLOR_LIGHTS = { I: "#7cc9c2", O: "#ead77c", T: "#bf91ca", S: "#9bc67c", Z: "#e38a86", J: "#8799cd", L: "#e7a477" };
export const COLOR_SHADOWS = { I: "#245e59", O: "#716024", T: "#56365f", S: "#3d5d2c", Z: "#6e302e", J: "#303f68", L: "#714224" };

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
  move: [[310, 0.016]],
  hold: [[620, 0.035], [460, 0.045]],
  drop: [[190, 0.035], [105, 0.07]],
  good: [[760, 0.045], [1015, 0.06]],
  bad: [[260, 0.055], [185, 0.07]],
  warning: [[440, 0.06], [0, 0.03], [440, 0.06]],
  tick: [[940, 0.035]],
  tickFinal: [[1180, 0.055]],
  tier: [[660, 0.055], [880, 0.055], [1100, 0.09]],
  match: [[440, 0.06], [660, 0.06], [880, 0.1]],
  coin: [[1040, 0.045], [1320, 0.06]],
  ready: [[520, 0.07]],
  start: [[780, 0.06], [1040, 0.12]],
  lead: [[700, 0.045], [920, 0.07]],
  behind: [[330, 0.055], [250, 0.07]],
  win: [[523, 0.08], [659, 0.08], [784, 0.08], [1047, 0.2]],
  lose: [[392, 0.09], [330, 0.09], [262, 0.18]],
  itemGet: [[620, 0.04], [830, 0.04], [1110, 0.08]],
  itemUse: [[880, 0.035], [440, 0.055], [1175, 0.07]],
  ink: [[150, 0.05], [95, 0.09]],
  speedAttack: [[520, 0.035], [780, 0.035], [1160, 0.055]],
  reverseAttack: [[660, 0.04], [440, 0.04], [660, 0.06]],
};

export const DEFAULT_SETTINGS = { das_ms: 20, arr_ms: 5, soft_drop_ms: 8, starting_level: 1 };

// 연속 줄 삭제의 두 번째 콤보부터 단계마다 추가되는 점수입니다.
export const COMBO_SCORE_STEP = 100;

export const SETTING_ROWS = [
  ["das_ms", "DAS", "hold delay", 1, 20, 1, "ms"],
  ["arr_ms", "ARR", "side repeat", 0, 5, 1, "ms"],
  ["soft_drop_ms", "SOFT", "down repeat", 5, 120, 1, "ms"],
  ["starting_level", "START", "level", 1, 15, 1, ""],
];

export const SENSITIVITY_PRESETS = [
  ["안정형", { das_ms: 16, arr_ms: 4, soft_drop_ms: 22 }, "천천히 정확하게"],
  ["표준형", { das_ms: 10, arr_ms: 2, soft_drop_ms: 10 }, "기본 추천"],
  ["빠른형", { das_ms: 5, arr_ms: 1, soft_drop_ms: 6 }, "빠른 이동"],
];

export const DIFFICULTIES = [
  ["easy", "쉬움", 0, 50, "소수 기초 연습"],
  ["normal", "보통", 0, 100, "두 자리 수 판별"],
  ["hard", "어려움", 0, 200, "세 자리 초반 수"],
  ["expert", "전문가", 100, 300, "두세 자리 혼합"],
  ["master", "마스터", 200, 600, "최고 난이도"],
];

export const SEED_SCOREBOARD = [];
