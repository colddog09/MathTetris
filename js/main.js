import { DIFFICULTIES, SETTING_ROWS, SENSITIVITY_PRESETS, KEY_ALIASES, WIDTH, HEIGHT, PRIME_SCORE, COMPOSITE_SCORE, COLORS_BG } from "./constants.js";
import { TetrisGame } from "./tetris.js";
import { renderGame, renderOpponentBoard } from "./render.js";
import { SoundManager } from "./sound.js";
import { loadSettings, saveSettings, loadScoreboard, appendScoreboardEntry } from "./storage.js";
import { Matchmaker, isSupabaseConfigured } from "./multiplayer.js";
import { payoutScore, scoreToCoin } from "./sadacoin.js";

const sound = new SoundManager();
const pressedKeys = new Set();
const matchmaker = new Matchmaker();
let remoteState = null;
let lastMultiplayerSend = 0;
let aiGame = null;
let aiPlan = null;
let aiPieceRef = null;
let aiNextActionAt = 0;

const session = {
  screen: "student",
  studentId: "",
  studentName: "",
  totalRuns: 0,
  runNumber: 0,
  difficultyIndex: 1,
  bestSessionScore: null,
  recordSaved: false,
  settings: loadSettings(),
  settingsOpen: false,
  settingsIndex: 0,
  mode: "single",
  multiplayer: false,
  aiOpponent: false,
  youWin: false,
  musicStoppedOnEnd: false,
  coinPayoutRequested: false,
};

let game = null;
let gameOverRects = [];
const el = (id) => document.getElementById(id);

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  el(id).classList.add("active");
}

function unlockAudioOnce() {
  sound.unlock();
  window.removeEventListener("pointerdown", unlockAudioOnce);
  window.removeEventListener("keydown", unlockAudioOnce);
}
window.addEventListener("pointerdown", unlockAudioOnce);
window.addEventListener("keydown", unlockAudioOnce);

function clickSound() {
  sound.play("button");
}

// ---------- Screen: student ----------
el("student-next").addEventListener("click", submitStudent);
el("student-id").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.isComposing) {
    e.preventDefault();
    e.stopPropagation();
    submitStudent();
  }
});
el("student-name").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.isComposing) {
    e.preventDefault();
    e.stopPropagation();
    submitStudent();
  }
});

function submitStudent() {
  clickSound();
  const id = el("student-id").value.trim();
  const name = el("student-name").value.trim();
  if (!id || !name) {
    el("student-error").textContent = "학번과 이름을 모두 입력하세요.";
    return;
  }
  el("student-error").textContent = "";
  session.studentId = id;
  session.studentName = name;
  session.screen = "mode";
  showScreen("screen-mode");
}

// ---------- Screen: mode ----------
el("mode-single").addEventListener("click", () => {
  clickSound();
  matchmaker.leaveRoom();
  stopAiOpponent();
  session.mode = "single";
  session.multiplayer = false;
  session.aiOpponent = false;
  session.youWin = false;
  remoteState = null;
  session.screen = "coins";
  showScreen("screen-coins");
});

el("mode-multiplayer").addEventListener("click", () => {
  clickSound();
  matchmaker.leaveRoom();
  stopAiOpponent();
  session.mode = "multi";
  session.multiplayer = false;
  session.aiOpponent = false;
  session.youWin = false;
  remoteState = null;
  session.screen = "coins";
  showScreen("screen-coins");
});

el("mode-back").addEventListener("click", () => {
  clickSound();
  session.screen = "student";
  showScreen("screen-student");
});

// ---------- Screen: coins ----------
el("coin-next").addEventListener("click", submitCoins);
el("coin-back").addEventListener("click", () => { clickSound(); session.screen = "mode"; showScreen("screen-mode"); });
el("coin-count").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.isComposing) {
    e.preventDefault();
    e.stopPropagation();
    submitCoins();
  }
});

function submitCoins() {
  clickSound();
  const totalRuns = parseInt(el("coin-count").value, 10);
  if (!totalRuns || totalRuns < 1) {
    el("coin-error").textContent = "1 이상의 숫자를 입력하세요.";
    return;
  }
  el("coin-error").textContent = "";
  session.totalRuns = totalRuns;
  session.runNumber = 0;
  session.bestSessionScore = null;
  session.recordSaved = false;
  renderDifficultyScreen();
  session.screen = "difficulty";
  showScreen("screen-difficulty");
}

// ---------- Screen: difficulty ----------
function renderDifficultyScreen() {
  el("difficulty-list-status").textContent = session.mode === "multi" ? "멀티 모드: 난이도 선택 후 매칭 화면으로 이동합니다" : "";
  const list = el("difficulty-list");
  list.innerHTML = "";
  DIFFICULTIES.forEach((diff, index) => {
    const [, label, maxNumber, desc] = diff;
    const row = document.createElement("div");
    row.className = "difficulty-row";
    row.innerHTML = `<span class="d-label">${index + 1}. ${label}</span><span class="d-range">0~${maxNumber}</span><span class="d-desc">${desc}</span>`;
    row.addEventListener("click", () => selectDifficulty(index));
    list.appendChild(row);
  });
}
el("difficulty-back").addEventListener("click", () => { clickSound(); session.screen = "coins"; showScreen("screen-coins"); });

function showInstructions() {
  session.screen = "instructions";
  session.instructionsStartedAt = performance.now() / 1000;
  showScreen("screen-instructions");
}

function selectDifficulty(index) {
  clickSound();
  session.difficultyIndex = index;
  const [, label, maxNumber] = DIFFICULTIES[index];
  el("instructions-subtitle").textContent = `${session.studentName} / ${session.totalRuns}회 플레이 / ${label} 0~${maxNumber}`;
  if (session.multiplayer && matchmaker.connected()) {
    matchmaker.sendCommand("difficulty", { index });
    startNextRun();
  } else if (session.mode === "multi") {
    startMatching(true);
  } else {
    showInstructions();
  }
}

// ---------- Screen: instructions ----------
el("instructions-start").addEventListener("click", () => { clickSound(); startNextRun(); });
el("instructions-sensitivity").addEventListener("click", () => { clickSound(); session.screen = "sensitivity"; renderSensitivityScreen(); showScreen("screen-sensitivity"); });
el("instructions-difficulty").addEventListener("click", () => { clickSound(); session.screen = "difficulty"; showScreen("screen-difficulty"); });

function startMatching(autoStartOnMatch = false) {
  stopAiOpponent();
  session.aiOpponent = false;
  session.multiplayer = false;
  remoteState = null;
  if (!isSupabaseConfigured()) {
    el("matching-status").textContent = "Supabase 설정이 안 되어 있습니다 (js/supabase-config.js 확인).";
    session.screen = "matching";
    showScreen("screen-matching");
    return;
  }
  el("matching-status").textContent = "대기열에서 상대를 찾는 중...";
  session.screen = "matching";
  showScreen("screen-matching");
  matchmaker.joinQueue(() => {
    matchmaker.onRemoteState = (state) => { remoteState = state; };
    matchmaker.onDisconnect = () => { remoteState = { ...remoteState, gameOver: true }; };
    matchmaker.onCommand = (cmd, data) => {
      if (cmd === "difficulty") {
        session.difficultyIndex = data.index;
        startNextRun();
      }
    };
    remoteState = {};
    session.multiplayer = true;
    session.aiOpponent = false;
    if (autoStartOnMatch) {
      startNextRun();
    } else {
      session.screen = "difficulty";
      el("difficulty-list-status").textContent = "상대와 같은 난이도를 선택하세요";
      showScreen("screen-difficulty");
    }
  });
}

// ---------- Screen: online matching ----------
el("instructions-multiplayer").addEventListener("click", () => {
  clickSound();
  session.mode = "multi";
  startMatching(false);
});
el("matching-cancel").addEventListener("click", () => {
  clickSound();
  matchmaker.cancelQueue();
  stopAiOpponent();
  session.multiplayer = false;
  session.aiOpponent = false;
  showInstructions();
});

el("matching-ai").addEventListener("click", () => {
  clickSound();
  matchmaker.cancelQueue();
  if (session.totalRuns < 1) session.totalRuns = 1;
  session.multiplayer = true;
  session.aiOpponent = true;
  session.youWin = false;
  session.musicStoppedOnEnd = false;
  remoteState = null;
  el("matching-status").textContent = "AI와 대전을 시작합니다...";
  startNextRun();
});

// ---------- Instructions demo animation ----------
const demoCanvas = el("instructions-demo-canvas");
const demoCtx = demoCanvas.getContext("2d");
demoCanvas.width = 568;
demoCanvas.height = 210;

const DEMO_LOCKED = [
  [0, 4, 11, true], [1, 4, 9, false], [2, 4, 13, true], [6, 4, 21, false], [7, 4, 17, true],
  [0, 5, 23, true], [1, 5, 25, false], [2, 5, 29, true], [3, 5, 27, false], [5, 5, 33, false], [6, 5, 37, true], [7, 5, 39, false],
  [1, 3, 7, true], [2, 3, 15, false], [6, 3, 41, true],
];
const DEMO_PRIME_POSITIONS = new Set(["0,4", "2,4", "3,4", "4,4", "5,4", "7,4", "0,5", "2,5", "4,5", "6,5"]);
const DEMO_CELLS_TO_COUNT = [];
for (const y of [4, 5]) for (let x = 0; x < 8; x++) DEMO_CELLS_TO_COUNT.push([x, y]);
const DEMO_PRIME_COUNT = 10;
const DEMO_COMPOSITE_COUNT = 6;
const DEMO_BASE_SCORE = DEMO_PRIME_COUNT * PRIME_SCORE + DEMO_COMPOSITE_COUNT * COMPOSITE_SCORE;
const DEMO_CYCLE_SECONDS = 5.2;

function drawDemoCell(ctx, boardX, boardY, size, x, y, number, prime) {
  const left = boardX + x * size + 2;
  const top = boardY + y * size + 2;
  const w = size - 4;
  ctx.fillStyle = prime ? "#15803d" : "#b91c1c";
  ctx.fillRect(left, top, w, w);
  ctx.fillStyle = prime ? "#22c55e" : "#ef4444";
  ctx.fillRect(left + 2, top + 2, w - 4, w - 4);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 9px Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(number), left + w / 2, top + w / 2);
}

function drawInstructionDemo(now) {
  const ctx = demoCtx;
  const elapsed = (now - session.instructionsStartedAt) % DEMO_CYCLE_SECONDS;
  ctx.clearRect(0, 0, demoCanvas.width, demoCanvas.height);
  ctx.fillStyle = "#f8fbff";
  ctx.fillRect(0, 0, demoCanvas.width, demoCanvas.height);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = COLORS_BG.GOOD;
  ctx.font = "bold 13px Helvetica, Arial, sans-serif";
  ctx.fillText("예시", 18, 20);

  let caption;
  if (elapsed < 1.7) caption = "1. T블록 숫자 31은 소수";
  else if (elapsed < 3.3) caption = "2. 빈칸에 맞춰 2줄 완성";
  else if (elapsed < 4.4) caption = "3. 두 줄을 왼쪽부터 집계";
  else caption = "4. x2 배율로 최종 반영";
  ctx.fillStyle = COLORS_BG.TEXT;
  ctx.font = "bold 10px Helvetica, Arial, sans-serif";
  ctx.fillText(caption, 58, 20);

  const boardX = 108;
  const boardY = 36;
  const cell = 26;
  const cols = 8;
  const rows = 6;
  ctx.strokeStyle = "#dbeafe";
  ctx.lineWidth = 1;
  for (let x = 0; x <= cols; x++) {
    ctx.beginPath();
    ctx.moveTo(boardX + x * cell, boardY);
    ctx.lineTo(boardX + x * cell, boardY + rows * cell);
    ctx.stroke();
  }
  for (let y = 0; y <= rows; y++) {
    ctx.beginPath();
    ctx.moveTo(boardX, boardY + y * cell);
    ctx.lineTo(boardX + cols * cell, boardY + y * cell);
    ctx.stroke();
  }

  for (const [x, y, number, prime] of DEMO_LOCKED) drawDemoCell(ctx, boardX, boardY, cell, x, y, number, prime);

  const fallingProgress = Math.min(1, Math.max(0, (elapsed - 0.5) / 1.8));
  const fallingY = elapsed < 3.3 ? 0.2 + fallingProgress * 3.8 : 4;
  for (const [dx, dy] of [[-1, 0], [0, 0], [1, 0], [0, 1]]) {
    drawDemoCell(ctx, boardX, boardY, cell, 4 + dx, fallingY + dy, 31, true);
  }

  if (elapsed >= 3.3) {
    const count = Math.min(DEMO_CELLS_TO_COUNT.length, Math.floor((elapsed - 3.3) / 0.08) + 1);
    ctx.lineWidth = 2;
    for (let i = 0; i < count; i++) {
      const [x, y] = DEMO_CELLS_TO_COUNT[i];
      ctx.strokeStyle = DEMO_PRIME_POSITIONS.has(`${x},${y}`) ? COLORS_BG.GOOD : COLORS_BG.BAD;
      ctx.strokeRect(boardX + x * cell + 2, boardY + y * cell + 2, cell - 4, cell - 4);
    }
  }

  const panelX = boardX + cols * cell + 24;
  const panelY = boardY + 8;
  const panelW = 120;
  const panelH = 132;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(panelX, panelY, panelW, panelH);
  ctx.strokeStyle = "#bfdbfe";
  ctx.lineWidth = 2;
  ctx.strokeRect(panelX, panelY, panelW, panelH);

  let lines;
  if (elapsed < 3.3) {
    lines = [["삭제", "2줄", COLORS_BG.TEXT], ["소수", `${DEMO_PRIME_COUNT}칸`, COLORS_BG.GOOD], ["합성수", `${DEMO_COMPOSITE_COUNT}칸`, COLORS_BG.BAD]];
  } else if (elapsed < 4.4) {
    const shown = Math.min(16, Math.floor((elapsed - 3.3) / 0.08) + 1);
    let running = 0;
    for (let i = 0; i < shown; i++) {
      const [x, y] = DEMO_CELLS_TO_COUNT[i];
      running += DEMO_PRIME_POSITIONS.has(`${x},${y}`) ? PRIME_SCORE : COMPOSITE_SCORE;
    }
    lines = [["집계 중", `${running >= 0 ? "+" : ""}${running}`, running >= 0 ? COLORS_BG.GOOD : COLORS_BG.BAD], ["배율", "x2", COLORS_BG.TEXT], ["최종", "...", COLORS_BG.MUTED]];
  } else {
    const total = DEMO_BASE_SCORE * 2;
    lines = [["집계 완료", `${DEMO_BASE_SCORE >= 0 ? "+" : ""}${DEMO_BASE_SCORE}`, DEMO_BASE_SCORE >= 0 ? COLORS_BG.GOOD : COLORS_BG.BAD], ["배율", "x2", COLORS_BG.TEXT], ["최종", `${total >= 0 ? "+" : ""}${total}`, total >= 0 ? COLORS_BG.GOOD : COLORS_BG.BAD]];
  }
  lines.forEach(([label, value, fill], index) => {
    const y = panelY + 24 + index * 32;
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS_BG.MUTED;
    ctx.font = "bold 10px Helvetica, Arial, sans-serif";
    ctx.fillText(label, panelX + 12, y);
    ctx.textAlign = "right";
    ctx.fillStyle = fill;
    ctx.font = "bold 13px Helvetica, Arial, sans-serif";
    ctx.fillText(value, panelX + panelW - 12, y);
  });
}

// ---------- Screen: sensitivity ----------
const sensitivityTest = { x: 4, y: 1, moveDir: 0, nextSideMove: 0, nextSoftDrop: 0 };
const sensitivityCanvas = el("sensitivity-canvas");
const sensCtx = sensitivityCanvas.getContext("2d");
sensitivityCanvas.width = 216;
sensitivityCanvas.height = 180;

function resetSensitivityTest() {
  sensitivityTest.x = 4;
  sensitivityTest.y = 1;
  sensitivityTest.moveDir = 0;
  sensitivityTest.nextSideMove = 0;
  sensitivityTest.nextSoftDrop = 0;
  pressedKeys.clear();
}

function renderSensitivityScreen() {
  const rowsEl = el("sensitivity-rows");
  rowsEl.innerHTML = "";
  const descriptions = { das_ms: "좌우 시작 딜레이", arr_ms: "좌우 반복 속도", soft_drop_ms: "아래 반복 속도", starting_level: "첫 실행 레벨" };
  SETTING_ROWS.forEach(([key, label, , min, max, step, suffix]) => {
    const row = document.createElement("div");
    row.className = "sensitivity-row";
    row.innerHTML = `<span class="s-label">${label}</span><span class="s-desc">${descriptions[key]}</span><span class="s-value">${session.settings[key]}${suffix}</span><button class="s-minus">-</button><button class="s-plus">+</button>`;
    row.querySelector(".s-minus").addEventListener("click", () => { adjustSettingValue(key, -1, min, max, step); renderSensitivityScreen(); });
    row.querySelector(".s-plus").addEventListener("click", () => { adjustSettingValue(key, 1, min, max, step); renderSensitivityScreen(); });
    rowsEl.appendChild(row);
  });
  const presetsEl = el("sensitivity-presets");
  presetsEl.innerHTML = "";
  SENSITIVITY_PRESETS.forEach(([label, values, hint]) => {
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      clickSound();
      Object.assign(session.settings, values);
      saveSettings(session.settings);
      resetSensitivityTest();
      renderSensitivityScreen();
    });
    const hintEl = document.createElement("p");
    hintEl.className = "preset-hint";
    hintEl.textContent = hint;
    presetsEl.appendChild(btn);
    presetsEl.appendChild(hintEl);
  });
}

function adjustSettingValue(key, amount, min, max, step) {
  session.settings[key] = Math.max(min, Math.min(max, session.settings[key] + amount * step));
  saveSettings(session.settings);
  if (key === "starting_level" && game && game.lines === 0) game.level = session.settings.starting_level;
}

function moveSensitivityTest(dx, dy) {
  const nextX = Math.max(0, Math.min(5, sensitivityTest.x + dx));
  let nextY = sensitivityTest.y + dy;
  if (nextY > 3) nextY = 0;
  sensitivityTest.x = nextX;
  sensitivityTest.y = nextY;
}

function applySensitivityTestMovement(now) {
  let direction = 0;
  if (pressedKeys.has("left") || pressedKeys.has("a")) direction -= 1;
  if (pressedKeys.has("right") || pressedKeys.has("d")) direction += 1;
  if (direction !== sensitivityTest.moveDir) {
    sensitivityTest.moveDir = direction;
    if (direction) {
      moveSensitivityTest(direction, 0);
      sensitivityTest.nextSideMove = now + session.settings.das_ms / 1000;
    }
  } else if (direction && now >= sensitivityTest.nextSideMove) {
    moveSensitivityTest(direction, 0);
    sensitivityTest.nextSideMove = now + session.settings.arr_ms / 1000;
  }
  if (pressedKeys.has("down") || pressedKeys.has("s")) {
    const interval = session.settings.soft_drop_ms / 1000;
    if (sensitivityTest.nextSoftDrop <= 0 || sensitivityTest.nextSoftDrop < now - interval * 4) sensitivityTest.nextSoftDrop = now;
    let steps = 0;
    while (now >= sensitivityTest.nextSoftDrop && steps < 3) {
      moveSensitivityTest(0, 1);
      sensitivityTest.nextSoftDrop += interval;
      steps += 1;
    }
  }
}

function drawSensitivityTest() {
  const ctx = sensCtx;
  const x0 = 30;
  const y0 = 46;
  const cell = 22;
  const cols = 8;
  const rows = 5;
  ctx.clearRect(0, 0, sensitivityCanvas.width, sensitivityCanvas.height);
  ctx.fillStyle = "#eef6ff";
  ctx.fillRect(0, 0, sensitivityCanvas.width, sensitivityCanvas.height);
  ctx.fillStyle = "#1f2937";
  ctx.font = "bold 11px Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("← / → / ↓ 로 테스트", x0 + (cols * cell) / 2, 18);
  ctx.strokeStyle = "#bfdbfe";
  ctx.lineWidth = 1;
  for (let x = 0; x <= cols; x++) {
    ctx.beginPath();
    ctx.moveTo(x0 + x * cell, y0);
    ctx.lineTo(x0 + x * cell, y0 + rows * cell);
    ctx.stroke();
  }
  for (let y = 0; y <= rows; y++) {
    ctx.beginPath();
    ctx.moveTo(x0, y0 + y * cell);
    ctx.lineTo(x0 + cols * cell, y0 + y * cell);
    ctx.stroke();
  }
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 2;
  for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [1, 1]]) {
    const left = x0 + (sensitivityTest.x + dx) * cell + 2;
    const top = y0 + (sensitivityTest.y + dy) * cell + 2;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(left, top, cell - 4, cell - 4);
    ctx.strokeRect(left, top, cell - 4, cell - 4);
  }
  ctx.fillStyle = "#64748b";
  ctx.font = "bold 10px Helvetica, Arial, sans-serif";
  ctx.fillText(`DAS ${session.settings.das_ms}ms  ARR ${session.settings.arr_ms}ms  SOFT ${session.settings.soft_drop_ms}ms`, x0 + (cols * cell) / 2, y0 + rows * cell + 20);
}

el("sensitivity-back").addEventListener("click", () => { clickSound(); pressedKeys.clear(); showInstructions(); });
el("sensitivity-reset").addEventListener("click", () => { clickSound(); resetSensitivityTest(); });
el("sensitivity-start").addEventListener("click", () => { clickSound(); pressedKeys.clear(); startNextRun(); });

// ---------- Screen: playing ----------
const canvas = el("game-canvas");
const ctx = canvas.getContext("2d");

function setupCanvasResolution() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = WIDTH * dpr;
  canvas.height = HEIGHT * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
setupCanvasResolution();
window.addEventListener("resize", setupCanvasResolution);

const opponentPanel = el("opponent-panel");
const playingLayout = el("playing-layout");
const opponentCanvas = el("opponent-canvas");
const opponentCtx = opponentCanvas.getContext("2d");
const OPP_CANVAS_WIDTH = 300;
const OPP_CANVAS_HEIGHT = 620;

function setupOpponentCanvasResolution() {
  const dpr = window.devicePixelRatio || 1;
  opponentCanvas.width = OPP_CANVAS_WIDTH * dpr;
  opponentCanvas.height = OPP_CANVAS_HEIGHT * dpr;
  opponentCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
setupOpponentCanvasResolution();
window.addEventListener("resize", setupOpponentCanvasResolution);

function serializeBoardForOpponent(boardGame) {
  return boardGame.board.map((row) => row.map((cell) => (cell ? { kind: cell.kind, number: cell.number, prime: cell.prime } : null)));
}

function serializeOpponentGame(boardGame, name = "AI") {
  if (!boardGame) return null;
  const now = performance.now() / 1000;
  return {
    name,
    score: boardGame.score,
    lines: boardGame.lines,
    time: boardGame.remainingTime(now),
    gameOver: boardGame.gameOver,
    board: serializeBoardForOpponent(boardGame),
    piece: boardGame.gameOver || !boardGame.current
      ? null
      : {
          kind: boardGame.current.kind,
          number: boardGame.current.number,
          prime: boardGame.isPrimePiece(boardGame.current),
          cells: boardGame.currentCells(),
        },
  };
}

function stopAiOpponent() {
  aiGame = null;
  aiPlan = null;
  aiPieceRef = null;
  aiNextActionAt = 0;
}

function resetAiOpponent() {
  const maxNumber = DIFFICULTIES[session.difficultyIndex][2];
  aiGame = new TetrisGame(session.settings, maxNumber);
  aiGame.pressed = new Set();
  aiGame.sound = null;
  aiPlan = null;
  aiPieceRef = null;
  aiNextActionAt = performance.now() / 1000 + 0.2;
  remoteState = serializeOpponentGame(aiGame);
}

function makeAiPlan(now) {
  const piece = aiGame.current;
  const targetX = 1 + Math.floor(Math.random() * 8);
  const targetRotation = piece.kind === "O" ? 0 : Math.floor(Math.random() * 4);
  return {
    targetX,
    targetRotation,
    dropAt: now + 0.7 + Math.random() * 0.8,
  };
}

function updateAiOpponent(now) {
  if (!session.aiOpponent || !aiGame) return;
  if (aiGame.gameOver) {
    remoteState = serializeOpponentGame(aiGame);
    return;
  }

  if (aiPieceRef !== aiGame.current) {
    aiPieceRef = aiGame.current;
    aiPlan = makeAiPlan(now);
  }

  if (!aiGame.clearingAnimation && now >= aiNextActionAt) {
    if (aiPlan && aiGame.current.rotation !== aiPlan.targetRotation) {
      aiGame.rotate(1);
    } else if (aiPlan && aiGame.current.x < aiPlan.targetX) {
      aiGame.move(1, 0);
    } else if (aiPlan && aiGame.current.x > aiPlan.targetX) {
      aiGame.move(-1, 0);
    } else if (aiPlan && now >= aiPlan.dropAt) {
      aiGame.hardDrop();
    } else {
      aiGame.softDrop();
    }
    aiNextActionAt = now + 0.06 + Math.random() * 0.05;
  }

  aiGame.tick(now, false);
  remoteState = serializeOpponentGame(aiGame);
}

function startNextRun() {
  if (session.runNumber >= session.totalRuns) {
    finishSession();
    return;
  }
  session.runNumber += 1;
  session.youWin = false;
  session.musicStoppedOnEnd = false;
  const maxNumber = DIFFICULTIES[session.difficultyIndex][2];
  game = new TetrisGame(session.settings, maxNumber);
  game.sound = sound;
  session.settingsOpen = false;
  session.settingsIndex = 0;
  if (session.aiOpponent) resetAiOpponent();
  pressedKeys.clear();
  game.pressed = pressedKeys;
  session.screen = "playing";
  showScreen("screen-playing");
  sound.startMusic();
}

function recordRunScore() {
  if (session.recordSaved || game.runRecorded) return;
  game.runRecorded = true;
  if (session.bestSessionScore === null || game.score > session.bestSessionScore) {
    session.bestSessionScore = game.score;
  }
}

function finishSession() {
  sound.stopMusic();
  session.screen = "finished";
  if (!session.recordSaved) {
    const [, label, maxNumber] = DIFFICULTIES[session.difficultyIndex];
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const playedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    appendScoreboardEntry({
      student_id: session.studentId,
      name: session.studentName,
      best_score: session.bestSessionScore ?? 0,
      runs: session.totalRuns,
      difficulty: label,
      max_number: maxNumber,
      played_at: playedAt,
    });
    session.recordSaved = true;
  }
  showFinishedScreen();
  showScreen("screen-finished");
}

function requestCoinPayout() {
  if (session.coinPayoutRequested) return;
  session.coinPayoutRequested = true;
  const score = session.bestSessionScore ?? 0;
  const coinPreview = scoreToCoin(score);
  const statusEl = el("coin-status");
  if (coinPreview <= 0) {
    statusEl.textContent = "";
    return;
  }
  statusEl.textContent = `${coinPreview}코인 지급 중...`;
  payoutScore(session.studentId, session.studentName, score)
    .then(() => { statusEl.textContent = `${coinPreview}코인 지급 완료`; })
    .catch(() => { statusEl.textContent = "코인 지급 실패 (담당 선생님께 문의)"; });
}

function showFinishedScreen() {
  el("finished-subtitle").textContent = `${session.studentName} 최고 점수: ${session.bestSessionScore ?? 0}`;
  const scoreboard = loadScoreboard();
  const body = el("scoreboard-body");
  body.innerHTML = "";
  scoreboard.slice(0, 10).forEach((row, index) => {
    const isPlayer = row.student_id === session.studentId && row.name === session.studentName;
    const tr = document.createElement("tr");
    tr.className = "score-row" + (isPlayer ? " is-player" : "");
    tr.innerHTML = `<td>${index + 1}</td><td>${row.student_id}</td><td>${row.name}</td><td>${row.best_score}</td><td>${row.difficulty}</td>`;
    body.appendChild(tr);
    setTimeout(() => tr.classList.add("shown"), 60 + index * 90);
  });
}

el("finished-restart").addEventListener("click", () => {
  clickSound();
  matchmaker.leaveRoom();
  sound.stopMusic();
  session.mode = "single";
  session.multiplayer = false;
  session.aiOpponent = false;
  session.coinPayoutRequested = false;
  session.youWin = false;
  session.musicStoppedOnEnd = false;
  stopAiOpponent();
  remoteState = null;
  el("student-id").value = "";
  el("student-name").value = "";
  session.screen = "student";
  showScreen("screen-student");
});

// ---------- Keyboard handling ----------
const SPECIAL_KEY_MAP = { arrowleft: "left", arrowright: "right", arrowup: "up", arrowdown: "down", " ": "space", escape: "escape", shift: "shift_l", enter: "return" };

function normalizeKey(event) {
  if (KEY_ALIASES[event.key]) return KEY_ALIASES[event.key];
  const lower = event.key.toLowerCase();
  return SPECIAL_KEY_MAP[lower] ?? lower;
}

const REPEAT_KEYS = new Set(["left", "right", "down", "a", "d", "s"]);
const GAME_KEYS = new Set(["left", "right", "down", "up", "a", "d", "s", "w", "z", "x", "c", "space", "f1"]);

function handleSettingsKey(key) {
  if (key === "f1" || key === "escape") {
    session.settingsOpen = false;
  } else if (key === "up" || key === "w") {
    session.settingsIndex = (session.settingsIndex - 1 + SETTING_ROWS.length) % SETTING_ROWS.length;
  } else if (key === "down" || key === "s") {
    session.settingsIndex = (session.settingsIndex + 1) % SETTING_ROWS.length;
  } else if (key === "left" || key === "a") {
    const [k, , , min, max, step] = SETTING_ROWS[session.settingsIndex];
    adjustSettingValue(k, -1, min, max, step);
  } else if (key === "right" || key === "d") {
    const [k, , , min, max, step] = SETTING_ROWS[session.settingsIndex];
    adjustSettingValue(k, 1, min, max, step);
  }
}

window.addEventListener("keydown", (event) => {
  const key = normalizeKey(event);
  if (session.screen === "mode") {
    if (key === "return") el("mode-single").click();
    else if (key === "escape") el("mode-back").click();
    return;
  }
  if (session.screen === "difficulty") {
    if (["1", "2", "3", "4", "5"].includes(key)) selectDifficulty(parseInt(key, 10) - 1);
    else if (key === "escape") { session.screen = "coins"; showScreen("screen-coins"); }
    return;
  }
  if (session.screen === "instructions") {
    if (key === "return") startNextRun();
    else if (key === "s") { session.screen = "sensitivity"; renderSensitivityScreen(); showScreen("screen-sensitivity"); }
    else if (key === "escape") { session.screen = "difficulty"; showScreen("screen-difficulty"); }
    return;
  }
  if (session.screen === "sensitivity") {
    if (REPEAT_KEYS.has(key)) { pressedKeys.add(key); event.preventDefault(); return; }
    if (key === "return" || key === "space") { pressedKeys.clear(); startNextRun(); }
    else if (key === "escape") { pressedKeys.clear(); showInstructions(); }
    else if (key === "r") { resetSensitivityTest(); }
    return;
  }
  if (session.screen === "finished") {
    if (key === "return" || key === "r") el("finished-restart").click();
    return;
  }
  if (session.screen !== "playing" || !game) return;
  if (game.gameOver) return;
  if (game.clearingAnimation) return;
  if (key === "f1") {
    session.settingsOpen = !session.settingsOpen;
    pressedKeys.clear();
    game.moveDir = 0;
    return;
  }
  if (session.settingsOpen) {
    handleSettingsKey(key);
    return;
  }
  if (GAME_KEYS.has(key)) event.preventDefault();
  if (REPEAT_KEYS.has(key) && pressedKeys.has(key)) return;
  if (REPEAT_KEYS.has(key)) pressedKeys.add(key);

  if (key === "up" || key === "w") game.rotate(1);
  else if (key === "x") game.discardPiece();
  else if (key === "z") game.rotate(-1);
  else if (key === "space") game.hardDrop();
  else if (key === "c" || key === "shift_l" || key === "shift_r") game.holdPiece();
});

window.addEventListener("keyup", (event) => {
  const key = normalizeKey(event);
  pressedKeys.delete(key);
});

canvas.addEventListener("click", (event) => {
  if (!game || !game.gameOver) return;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
  const y = ((event.clientY - rect.top) / rect.height) * HEIGHT;
  for (const button of gameOverRects) {
    if (x >= button.left && x <= button.right && y >= button.top && y <= button.bottom) {
      clickSound();
      recordRunScore();
      if (button.action === "next") startNextRun();
      else finishSession();
      return;
    }
  }
});

// ---------- Main animation loop ----------
function frame() {
  const now = performance.now() / 1000;
  if (session.screen === "playing" && game) {
    updateAiOpponent(now);
    if (session.multiplayer && remoteState?.gameOver && !game.gameOver && !session.youWin) {
      session.youWin = true;
      game.triggerGameOver(now);
    }
    game.tick(now, session.settingsOpen);
    if (game.gameOver) {
      recordRunScore();
      if (!session.musicStoppedOnEnd) {
        sound.stopMusic();
        session.musicStoppedOnEnd = true;
      }
    }
    const onlineActive = session.multiplayer && !session.aiOpponent && matchmaker.connected();
    const opponentActive = session.aiOpponent || onlineActive;
    if (onlineActive && now - lastMultiplayerSend > 0.25) {
      lastMultiplayerSend = now;
      matchmaker.sendState({
        name: session.studentName,
        score: game.score,
        lines: game.lines,
        time: game.remainingTime(now),
        gameOver: game.gameOver,
        board: serializeBoardForOpponent(game),
        piece: game.gameOver ? null : { kind: game.current.kind, number: game.current.number, prime: game.isPrimePiece(game.current), cells: game.currentCells() },
      });
    }
    playingLayout.classList.toggle("has-opponent", opponentActive);
    opponentPanel.classList.toggle("active", opponentActive);
    if (opponentActive) {
      el("opponent-name").textContent = (remoteState && remoteState.name) || "상대";
      renderOpponentBoard(opponentCtx, remoteState);
    }
    const result = renderGame(ctx, game, {
      runNumber: session.runNumber,
      totalRuns: session.totalRuns,
      difficultyLabel: DIFFICULTIES[session.difficultyIndex][1],
      maxNumber: DIFFICULTIES[session.difficultyIndex][2],
      bestSessionScore: session.bestSessionScore,
      settingsOpen: session.settingsOpen,
      settingsIndex: session.settingsIndex,
      settingRows: SETTING_ROWS,
      multiplayerConnected: opponentActive,
      remoteState,
      youWin: session.youWin,
    });
    gameOverRects = result.gameOverRects;
  } else if (session.screen === "sensitivity") {
    applySensitivityTestMovement(now);
    drawSensitivityTest();
  } else if (session.screen === "instructions") {
    drawInstructionDemo(now);
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
