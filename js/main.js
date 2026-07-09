import { DIFFICULTIES, SETTING_ROWS, SENSITIVITY_PRESETS, KEY_ALIASES, WIDTH, HEIGHT, PRIME_SCORE, COMPOSITE_SCORE, COLORS_BG } from "./constants.js";
import { TetrisGame } from "./tetris.js";
import { renderGame, renderOpponentBoard } from "./render.js";
import { SoundManager } from "./sound.js";
import { loadSettings, saveSettings, loadScoreboard, appendScoreboardEntry } from "./storage.js";
import { Matchmaker, isSupabaseConfigured } from "./multiplayer.js";

const sound = new SoundManager();
const pressedKeys = new Set();
const matchmaker = new Matchmaker();
let remoteState = null;
let lastMultiplayerSend = 0;

const session = {
  screen: "student",
  studentId: "",
  studentName: "",
  totalRuns: 0,
  runNumber: 0,
  difficultyIndex: 1,
  bestSessionScore: null,
  currentScoreboardId: null,
  recordSaved: false,
  settings: loadSettings(),
  settingsOpen: false,
  settingsIndex: 0,
  mode: "single",
  multiplayer: false,
  youWin: false,
  matchOutcome: null,
  matchDetail: "",
  musicStoppedOnEnd: false,
  myReady: false,
  opponentReady: false,
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
  session.mode = "single";
  session.multiplayer = false;
  session.youWin = false;
  session.matchOutcome = null;
  session.matchDetail = "";
  session.totalRuns = 1;
  session.runNumber = 0;
  session.bestSessionScore = null;
  session.currentScoreboardId = null;
  session.recordSaved = false;
  remoteState = null;
  renderDifficultyScreen();
  session.screen = "difficulty";
  showScreen("screen-difficulty");
});

el("mode-multiplayer").addEventListener("click", () => {
  clickSound();
  matchmaker.leaveRoom();
  prepareMultiplayerSession();
  startMatching();
});

el("mode-back").addEventListener("click", () => {
  clickSound();
  session.screen = "student";
  showScreen("screen-student");
});

// ---------- Screen: difficulty ----------
function renderDifficultyScreen() {
  el("difficulty-list-status").textContent = session.mode === "multi"
    ? "매칭 완료! 난이도를 선택하면 1판 대전이 바로 시작됩니다."
    : "";
  el("difficulty-back").textContent = session.mode === "multi" ? "매칭으로" : "모드 선택";
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
el("difficulty-back").addEventListener("click", () => {
  clickSound();
  if (session.mode === "multi") {
    session.screen = "matching";
    showScreen("screen-matching");
    return;
  }
  session.screen = "mode";
  showScreen("screen-mode");
});

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
    startMatchedRun(index, true);
  } else if (session.mode === "multi") {
    startMatching();
  } else {
    showInstructions();
  }
}

// ---------- Screen: instructions ----------
el("instructions-start").addEventListener("click", () => { clickSound(); startNextRun(); });
el("instructions-sensitivity").addEventListener("click", () => { clickSound(); session.screen = "sensitivity"; renderSensitivityScreen(); showScreen("screen-sensitivity"); });
el("instructions-difficulty").addEventListener("click", () => { clickSound(); session.screen = "difficulty"; showScreen("screen-difficulty"); });

function prepareMultiplayerSession() {
  session.mode = "multi";
  session.totalRuns = 1;
  session.runNumber = 0;
  session.bestSessionScore = null;
  session.currentScoreboardId = null;
  session.recordSaved = false;
  session.multiplayer = false;
  session.youWin = false;
  session.matchOutcome = null;
  session.matchDetail = "";
  session.musicStoppedOnEnd = false;
  remoteState = null;
}

function showMatchedDifficulty() {
  renderDifficultyScreen();
  session.screen = "difficulty";
  showScreen("screen-difficulty");
}

function startMatchedRun(index, shouldBroadcast = false) {
  if (session.screen === "playing" || session.runNumber > 0) return;
  session.difficultyIndex = index;
  if (shouldBroadcast && matchmaker.connected()) matchmaker.sendCommand("difficulty", { index });
  startNextRun();
}

function startMatching() {
  session.multiplayer = false;
  session.matchOutcome = null;
  session.matchDetail = "";
  remoteState = null;
  if (!isSupabaseConfigured()) {
    el("matching-waiting").style.display = "none";
    el("matching-found").style.display = "block";
    el("match-my-name").textContent = "오류";
    el("match-opponent-name").textContent = "";
    el("matching-found").querySelector(".match-found-badge").textContent = "온라인 설정 없음";
    el("matching-found").querySelector(".hint").textContent = "Supabase 설정을 확인하세요.";
    session.screen = "matching";
    showScreen("screen-matching");
    return;
  }
  el("matching-waiting").style.display = "block";
  el("matching-found").style.display = "none";
  session.screen = "matching";
  showScreen("screen-matching");
  matchmaker.joinQueue((opponentName) => {
    matchmaker.onRemoteState = (state) => { remoteState = state; };
    matchmaker.onDisconnect = () => { remoteState = { ...remoteState, gameOver: true }; };
    matchmaker.onCommand = (cmd, data) => {
      if (cmd === "ready") {
        session.opponentReady = true;
        el("match-ready-status").textContent = "상대방 준비 완료! " + (session.myReady ? "게임 시작 중..." : "당신도 준비하세요.");
        checkBothReady();
      }
    };
    remoteState = {};
    session.multiplayer = true;
    session.myReady = false;
    session.opponentReady = false;
    el("matching-waiting").style.display = "none";
    el("matching-found").style.display = "block";
    el("match-my-name").textContent = session.studentName;
    el("match-opponent-name").textContent = opponentName || "상대방";
    el("match-ready-btn").disabled = false;
    el("match-ready-btn").textContent = "준비 완료";
    el("match-ready-status").textContent = "난이도를 선택하고 준비 완료를 누르세요.";
    const sel = el("match-difficulty-select");
    sel.innerHTML = "";
    DIFFICULTIES.forEach(([, label, maxNum], i) => {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = `${label} (0~${maxNum})`;
      sel.appendChild(opt);
    });
    sel.value = session.difficultyIndex;
  }, session.studentName);
}

function checkBothReady() {
  if (session.myReady && session.opponentReady) {
    session.difficultyIndex = parseInt(el("match-difficulty-select").value, 10);
    startMatchedRun(session.difficultyIndex, false);
  }
}

el("match-ready-btn").addEventListener("click", () => {
  clickSound();
  session.myReady = true;
  session.difficultyIndex = parseInt(el("match-difficulty-select").value, 10);
  matchmaker.sendCommand("ready");
  el("match-ready-btn").disabled = true;
  el("match-ready-btn").textContent = "대기 중...";
  el("match-ready-status").textContent = session.opponentReady ? "게임 시작 중..." : "상대방을 기다리는 중...";
  checkBothReady();
});

// ---------- Screen: online matching ----------
el("instructions-multiplayer").addEventListener("click", () => {
  clickSound();
  matchmaker.leaveRoom();
  prepareMultiplayerSession();
  startMatching();
});
el("matching-cancel").addEventListener("click", () => {
  clickSound();
  matchmaker.cancelQueue();
  matchmaker.leaveRoom();
  session.multiplayer = false;
  remoteState = null;
  el("matching-waiting").style.display = "block";
  el("matching-found").style.display = "none";
  session.screen = "mode";
  showScreen("screen-mode");
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

function serializeOpponentGame(boardGame, name = "Opponent") {
  if (!boardGame) return null;
  const now = performance.now() / 1000;
  return {
    name,
    score: boardGame.score,
    lines: boardGame.lines,
    time: boardGame.remainingTime(now),
    gameOver: boardGame.gameOver,
    gameOverReason: boardGame.gameOverReason,
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

function startNextRun() {
  if (session.runNumber >= session.totalRuns) {
    finishSession();
    return;
  }
  session.runNumber += 1;
  session.youWin = false;
  session.matchOutcome = null;
  session.matchDetail = "";
  session.musicStoppedOnEnd = false;
  session.recordSaved = false;
  const maxNumber = DIFFICULTIES[session.difficultyIndex][2];
  game = new TetrisGame(session.settings, maxNumber);
  game.sound = sound;
  session.settingsOpen = false;
  session.settingsIndex = 0;
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
  if (game && !game.runRecorded) recordRunScore();
  if (session.bestSessionScore === null && game) session.bestSessionScore = game.score;
  if (!session.recordSaved) {
    const [, label, maxNumber] = DIFFICULTIES[session.difficultyIndex];
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const playedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const scoreboardId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    session.currentScoreboardId = scoreboardId;
    appendScoreboardEntry({
      scoreboard_id: scoreboardId,
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

function showFinishedScreen() {
  el("finished-subtitle").textContent = `${session.studentName} 최고 점수: ${session.bestSessionScore ?? 0}`;
  const scoreboard = loadScoreboard();
  const body = el("scoreboard-body");
  body.innerHTML = "";
  const currentIndex = scoreboard.findIndex((row) => row.scoreboard_id && row.scoreboard_id === session.currentScoreboardId);
  let visibleRows = scoreboard.slice(0, 10).map((row, index) => ({ row, rank: index + 1 }));
  if (currentIndex >= 10) {
    visibleRows = scoreboard.slice(0, 9).map((row, index) => ({ row, rank: index + 1 }));
    visibleRows.push({ row: scoreboard[currentIndex], rank: currentIndex + 1 });
  }
  visibleRows.forEach(({ row, rank }, index) => {
    const isPlayer = row.scoreboard_id && row.scoreboard_id === session.currentScoreboardId;
    const tr = document.createElement("tr");
    tr.className = "score-row" + (isPlayer ? " is-player" : "");
    tr.innerHTML = `<td>${rank}</td><td>${row.student_id}</td><td>${row.name}</td><td>${row.best_score}</td><td>${row.difficulty}</td>`;
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
  session.youWin = false;
  session.matchOutcome = null;
  session.matchDetail = "";
  session.currentScoreboardId = null;
  session.musicStoppedOnEnd = false;
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

const REPEAT_KEYS = new Set(["left", "right", "down", "d", "s"]);
const GAME_KEYS = new Set(["left", "right", "down", "up", "a", "d", "s", "w", "z", "x", "c", "space", "f1"]);

function setMatchResult(outcome, detail, now) {
  if (session.matchOutcome) return;
  session.matchOutcome = outcome;
  session.matchDetail = detail;
  session.youWin = outcome === "win";
  if (!game.gameOver) game.triggerGameOver(now, "match");
}

function resolveMultiplayerResult(now) {
  if (!session.multiplayer || !remoteState || !game || session.matchOutcome) return;
  const remoteOver = Boolean(remoteState.gameOver);
  const remoteReason = remoteState.gameOverReason || "topout";
  const localOver = Boolean(game.gameOver);
  const localReason = game.gameOverReason || "topout";

  if (remoteOver && remoteReason !== "time" && !localOver) {
    setMatchResult("win", "상대방이 먼저 게임오버!", now);
    return;
  }

  if (localOver && localReason === "time") {
    const remoteScore = Number.isFinite(remoteState.score) ? remoteState.score : 0;
    if (game.score > remoteScore) {
      setMatchResult("win", `시간 종료! ${game.score} : ${remoteScore}`, now);
    } else if (game.score < remoteScore) {
      setMatchResult("lose", `시간 종료! ${game.score} : ${remoteScore}`, now);
    } else {
      setMatchResult("draw", `시간 종료! ${game.score} : ${remoteScore}`, now);
    }
    return;
  }

  if (localOver && localReason !== "time") {
    setMatchResult("lose", "블록이 천장에 닿았습니다.", now);
  }
}

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
    else if (key === "escape") {
      session.screen = session.mode === "multi" ? "matching" : "mode";
      showScreen(session.mode === "multi" ? "screen-matching" : "screen-mode");
    }
    return;
  }
  if (session.screen === "matching") {
    if (key === "escape") el("matching-cancel").click();
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
  else if (key === "a") game.rotate(2);
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
    game.tick(now, session.settingsOpen);
    resolveMultiplayerResult(now);
    if (game.gameOver) {
      recordRunScore();
      if (!session.musicStoppedOnEnd) {
        sound.stopMusic();
        session.musicStoppedOnEnd = true;
      }
      if (session.multiplayer && session.runNumber >= session.totalRuns) {
        setTimeout(() => finishSession(), 4000);
      }
    }
    const onlineActive = session.multiplayer && matchmaker.connected();
    const opponentActive = onlineActive;
    if (onlineActive && now - lastMultiplayerSend > 0.25) {
      lastMultiplayerSend = now;
      matchmaker.sendState({
        name: session.studentName,
        score: game.score,
        lines: game.lines,
        time: game.remainingTime(now),
        gameOver: game.gameOver,
        gameOverReason: game.gameOverReason,
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
      matchOutcome: session.matchOutcome,
      matchDetail: session.matchDetail,
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
