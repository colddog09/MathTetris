import { DIFFICULTIES, SETTING_ROWS, SENSITIVITY_PRESETS, KEY_ALIASES, WIDTH, HEIGHT, PRIME_SCORE, COMPOSITE_SCORE, COLORS_BG } from "./constants.js";
import { TetrisGame } from "./tetris.js";
import { renderGame, renderOpponentBoard } from "./render.js";
import { SoundManager } from "./sound.js";
import { loadSettings, saveSettings, loadScoreboard, loadStudentBestScore, appendScoreboardEntry } from "./storage.js";
import { Matchmaker, isSupabaseConfigured } from "./multiplayer.js";
import { cancelPaymentRequest, createPaymentRequest, getCoinStudent, getPaymentStatus, requestReward, COIN_PRICE, PAYMENT_POLL_MS } from "./coin-api.js";
import { ALLOW_TEST_NICKNAME, LEADERBOARD_FIRST_BONUS, MIN_WAGER_AMOUNT, finalScoreFor, rewardTiersForDifficulty, scoreMultiplierForDifficulty, singleRewardFor } from "./coin-config.js";

const sound = new SoundManager();
const pressedKeys = new Set();
const matchmaker = new Matchmaker();
let remoteState = null;
let lastMultiplayerSend = 0;

const ITEM_DEFS = {
  ink: { label: "먹물", icon: "🖤", duration: 10000, sound: "ink", target: "opponent" },
  speed: { label: "초고속", icon: "⚡", duration: 10000, sound: "speedAttack", target: "opponent" },
  reverse: { label: "좌우 반전", icon: "🔀", duration: 10000, sound: "reverseAttack", target: "opponent" },
  seal: { label: "홀드 봉인", icon: "🔒", duration: 10000, sound: "reverseAttack", target: "opponent" },
  preview: { label: "NEXT 차단", icon: "🙈", duration: 10000, sound: "ink", target: "opponent" },
  shield: { label: "방어막", icon: "🛡️", duration: 0, sound: "itemGet", target: "self" },
  cleanse: { label: "정화", icon: "✨", duration: 0, sound: "good", target: "self" },
};
const ITEM_TYPES = Object.keys(ITEM_DEFS);
const RANKING_EXCLUDED_NAMES = new Set(["한교동"]);

function isRankingExcludedName(name) {
  return ALLOW_TEST_NICKNAME && RANKING_EXCLUDED_NAMES.has(String(name || "").trim());
}

const session = {
  screen: "student",
  studentId: "",
  studentName: "",
  studentHash: "",
  totalRuns: 0,
  runNumber: 0,
  difficultyIndex: 1,
  bestSessionScore: null,
  currentScoreboardId: null,
  scoreboardPage: 0,
  personalBest: false,
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
  opponentName: "상대방",
  opponentStudentId: "",
  entryPaid: false,
  entryToken: "",
  wagerAmount: 0,
  opponentWager: 0,
  wagerPaid: false,
  opponentWagerPaid: false,
  wagerToken: "",
  wagerTrackingToken: "",
  wagerPaymentAttemptId: "",
  opponentWagerToken: "",
  rewardHandled: false,
  rewardAmount: 0,
  rewardStatusText: "",
  pendingDifficultyIndex: null,
  myDifficultyVote: null,
  opponentDifficultyVote: null,
  difficultyResolved: false,
  finishing: false,
  finalScore: 0,
  leaderboardBonus: 0,
  matchCountdownStarted: false,
  itemMode: false,
  itemInventory: [],
  itemEffects: { inkUntil: 0, speedUntil: 0, reverseUntil: 0, sealUntil: 0, previewUntil: 0 },
  itemShieldCharges: 0,
  lastItemEarned: null,
  opponentDisconnected: false,
  reconnectDeadline: 0,
};

let game = null;
let gameOverRects = [];
let paymentPollTimer = null;
let activeEntryTrackingToken = "";
let entryPaymentAttemptId = "";
let wagerPaymentPollTimer = null;
let flowVersion = 0;
const flowTimers = new Set();
let fxTextTimer = null;
let lastCountdownSecond = null;
let lastDangerSoundAt = 0;
let lastDangerLevel = 0;
let multiplayerLeadState = "tie";
let lastLeadEffectAt = 0;
let roomJoinTimer = null;
let matchFoundFxTimer = null;
let reverseEffectWasActive = false;
const el = (id) => document.getElementById(id);
let paymentConfirmationOpen = false;

async function confirmCoinPayment(studentId, amount) {
  if (paymentConfirmationOpen) return false;
  paymentConfirmationOpen = true;
  try {
    const student = await getCoinStudent(studentId);
    const coinAmount = Number(amount);
    const balance = Number(student.balance);
    if (!Number.isInteger(coinAmount) || coinAmount < 0 || !Number.isFinite(balance)) throw new Error("결제 확인 정보가 올바르지 않습니다.");

    const modal = el("payment-confirm-modal");
    const approve = el("payment-confirm-approve");
    const cancel = el("payment-confirm-cancel");
    const warning = el("payment-confirm-warning");
    el("payment-confirm-title").textContent = coinAmount === 0 ? "0코인으로 입장하시겠습니까?" : "결제하시겠습니까?";
    el("payment-confirm-name").textContent = student.name;
    el("payment-confirm-balance").textContent = `${balance.toLocaleString()}코인`;
    el("payment-confirm-amount").textContent = `${coinAmount.toLocaleString()}코인`;
    const insufficient = balance < coinAmount;
    warning.textContent = insufficient
      ? "잔액이 부족하여 결제를 진행할 수 없습니다."
      : coinAmount === 0
        ? "테스트 기간에는 코인이 차감되지 않습니다."
        : `결제 후 잔액: ${(balance - coinAmount).toLocaleString()}코인`;
    approve.textContent = coinAmount === 0 ? "확인하고 입장" : "확인하고 바로 결제";
    approve.disabled = insufficient;
    modal.hidden = false;

    return await new Promise((resolve) => {
      const close = (confirmed) => {
        modal.hidden = true;
        approve.removeEventListener("click", onApprove);
        cancel.removeEventListener("click", onCancel);
        modal.removeEventListener("click", onBackdrop);
        document.removeEventListener("keydown", onKeydown);
        resolve(confirmed);
      };
      const onApprove = () => close(true);
      const onCancel = () => close(false);
      const onBackdrop = (event) => { if (event.target === modal) close(false); };
      const onKeydown = (event) => { if (event.key === "Escape") close(false); };
      approve.addEventListener("click", onApprove);
      cancel.addEventListener("click", onCancel);
      modal.addEventListener("click", onBackdrop);
      document.addEventListener("keydown", onKeydown);
      (insufficient ? cancel : approve).focus();
    });
  } finally {
    paymentConfirmationOpen = false;
  }
}

function clearFlowTimers() {
  flowVersion += 1;
  flowTimers.forEach(clearTimeout);
  flowTimers.clear();
  if (matchFoundFxTimer) clearTimeout(matchFoundFxTimer);
  matchFoundFxTimer = null;
  el("match-found-fx")?.classList.remove("show");
}

function playMatchFoundTransition(onComplete) {
  if (matchFoundFxTimer) clearTimeout(matchFoundFxTimer);
  matchFoundFxTimer = null;

  const overlay = el("match-found-fx");
  el("match-found-my-name").textContent = session.studentName || "PLAYER 1";
  el("match-found-opponent-name").textContent = session.opponentName || "PLAYER 2";
  overlay.classList.remove("show");
  void overlay.offsetWidth;
  overlay.classList.add("show");
  sound.play("match");

  const expectedScreen = session.screen;
  matchFoundFxTimer = setTimeout(() => {
    matchFoundFxTimer = null;
    overlay.classList.remove("show");
    if (!session.multiplayer || session.screen !== expectedScreen) return;
    onComplete();
  }, 1250);
}

function scheduleFlow(callback, delay, expectedScreen = session.screen) {
  const version = flowVersion;
  const timer = setTimeout(() => {
    flowTimers.delete(timer);
    if (version !== flowVersion || session.screen !== expectedScreen) return;
    callback();
  }, delay);
  flowTimers.add(timer);
  return timer;
}

function renderRewardGuide(difficultyIndex) {
  el("single-reward-guide").querySelector("b").textContent = `싱글 코인 보상 · ×${scoreMultiplierForDifficulty(difficultyIndex)}`;
  el("single-reward-list").innerHTML = rewardTiersForDifficulty(difficultyIndex)
    .slice().reverse()
    .map(({ minScore, coins }) => `<span><em>${minScore.toLocaleString()}점</em><strong>${coins.toLocaleString()}코인</strong></span>`)
    .join("");
}

const MENU_SCREENS = new Set([
  "student", "coin", "mode", "difficulty", "wheel", "instructions",
  "matching", "room", "ready", "wager", "finished", "result",
]);

function getFocusableMenuItems(root) {
  return Array.from(root.querySelectorAll("button, input, [tabindex]"))
    .filter((elm) => !elm.disabled && elm.tabIndex !== -1 && elm.offsetParent !== null);
}

function focusFirstMenuItem(id) {
  const screenEl = el(id);
  if (!screenEl || !screenEl.classList.contains("active")) return;
  if (screenEl.contains(document.activeElement)) return;
  const items = getFocusableMenuItems(screenEl);
  if (!items.length) return;
  const preferred = screenEl.querySelector("input") || screenEl.querySelector(".btn.primary, button.primary");
  const target = preferred && items.includes(preferred) ? preferred : items[0];
  target.focus();
}

function moveMenuFocus(dir) {
  const screenEl = document.querySelector(".screen.active");
  if (!screenEl) return;
  const items = getFocusableMenuItems(screenEl);
  if (!items.length) return;
  let idx = items.indexOf(document.activeElement);
  idx = idx === -1 ? 0 : (idx + dir + items.length) % items.length;
  items[idx].focus();
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  el(id).classList.add("active");
  if (id !== "screen-playing") setTimeout(() => focusFirstMenuItem(id), 0);
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

function restartFxClass(element, className, duration = 350) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  setTimeout(() => element.classList.remove(className), duration);
}

function triggerGameText(text, tone = "good") {
  const target = el("game-fx-text");
  if (fxTextTimer) clearTimeout(fxTextTimer);
  target.textContent = text;
  target.className = tone === "bad" ? "bad" : "";
  void target.offsetWidth;
  target.classList.add("show");
  fxTextTimer = setTimeout(() => target.classList.remove("show"), 900);
}

function triggerGameFlash(tone = "good", strong = false) {
  const screen = el("screen-playing");
  restartFxClass(screen, strong ? "fx-impact-strong" : "fx-impact", strong ? 280 : 190);
  restartFxClass(screen, tone === "bad" ? "fx-bad" : "fx-good", 340);
}

function itemEffectActive(type, now = performance.now() / 1000) {
  return (session.itemEffects[`${type}Until`] || 0) > now;
}

function resetItemBattle() {
  session.itemInventory = [];
  session.itemEffects = { inkUntil: 0, speedUntil: 0, reverseUntil: 0, sealUntil: 0, previewUntil: 0 };
  session.itemShieldCharges = 0;
  session.lastItemEarned = null;
  reverseEffectWasActive = false;
  el("ink-overlay").classList.remove("active");
  el("item-effect-status").textContent = "";
  renderItemSlots();
}

function renderItemSlots() {
  document.querySelectorAll(".item-slot").forEach((button, index) => {
    const item = session.itemInventory[index];
    const iconEl = button.querySelector(".item-icon");
    const nameEl = button.querySelector(".item-name");
    button.classList.toggle("ready", Boolean(item));
    button.disabled = !item;
    iconEl.textContent = item ? ITEM_DEFS[item].icon : "—";
    nameEl.textContent = item ? ITEM_DEFS[item].label : "비어 있음";
    button.title = item
      ? `${index + 1}키: ${ITEM_DEFS[item].target === "self" ? "나에게" : "상대에게"} ${ITEM_DEFS[item].label} 사용`
      : "올소수 줄을 지우면 획득";
  });
}

function gainRandomItem() {
  if (!session.multiplayer || !session.itemMode || session.itemInventory.length >= 3) {
    if (session.itemInventory.length >= 3) triggerGameText("ITEM SLOTS FULL", "bad");
    return;
  }
  const candidates = ITEM_TYPES.filter((type) => type !== session.lastItemEarned);
  const item = candidates[Math.floor(Math.random() * candidates.length)];
  session.itemInventory.push(item);
  session.lastItemEarned = item;
  renderItemSlots();
  triggerGameText(`ALL PRIME · ${ITEM_DEFS[item].label} 획득!`, "good");
  triggerGameFlash("good", true);
  sound.play("itemGet");
}

function useItem(slotIndex) {
  if (!session.multiplayer || !session.itemMode || session.screen !== "playing" || game?.gameOver) return;
  const item = session.itemInventory[slotIndex];
  if (!item) return;
  session.itemInventory.splice(slotIndex, 1);
  renderItemSlots();
  const definition = ITEM_DEFS[item];
  if (definition.target === "self") {
    if (item === "shield") {
      session.itemShieldCharges = 1;
      triggerGameText("방어막 준비 완료!", "good");
    } else if (item === "cleanse") {
      Object.keys(session.itemEffects).forEach((key) => { session.itemEffects[key] = 0; });
      el("ink-overlay").classList.remove("active");
      pressedKeys.clear();
      if (game) game.moveDir = 0;
      triggerGameText("모든 방해 효과 정화!", "good");
    }
    sound.play(definition.sound);
    return;
  }
  matchmaker.sendCommand("item_attack", {
    type: item,
    duration: definition.duration,
    attackerName: session.studentName,
    warningMs: 800,
  });
  triggerGameText(`${definition.label} 발사!`, "good");
  sound.play("itemUse");
}

function receiveIncomingItem(data = {}) {
  const definition = ITEM_DEFS[data.type];
  if (!definition || definition.target !== "opponent" || !session.itemMode) return;
  const attacker = data.attackerName || session.opponentName || "상대";
  const warningMs = Math.min(1500, Math.max(400, Number(data.warningMs) || 800));
  triggerGameText(`${attacker}의 ${definition.label} 경고!`, "bad");
  sound.play("warning");
  setTimeout(() => {
    if (session.screen === "playing" && !game?.gameOver) applyIncomingItem(data.type, data.duration, attacker);
  }, warningMs);
}

function applyIncomingItem(type, duration, attackerName = "상대") {
  const definition = ITEM_DEFS[type];
  if (!definition || definition.target !== "opponent" || !session.itemMode) return;
  if (session.itemShieldCharges > 0) {
    session.itemShieldCharges -= 1;
    triggerGameFlash("good", true);
    triggerGameText(`방어막이 ${definition.label} 차단!`, "good");
    sound.play("good");
    return;
  }
  const now = performance.now() / 1000;
  const untilKey = `${type}Until`;
  const safeDuration = Math.min(10000, Math.max(1000, Number(duration) || definition.duration));
  session.itemEffects[untilKey] = Math.max(session.itemEffects[untilKey] || 0, now + safeDuration / 1000);
  pressedKeys.clear();
  if (game) game.moveDir = 0;
  triggerGameFlash("bad", type !== "ink");
  triggerGameText(`${attackerName}의 ${definition.label}!`, "bad");
  sound.play(definition.sound);
}

function updateItemBattleEffects(now) {
  if (!game) return;
  const inkActive = itemEffectActive("ink", now);
  const speedActive = itemEffectActive("speed", now);
  const reverseActive = itemEffectActive("reverse", now);
  const sealActive = itemEffectActive("seal", now);
  const previewActive = itemEffectActive("preview", now);
  game.externalSpeedMultiplier = speedActive ? 5 : 1;
  el("ink-overlay").classList.toggle("active", inkActive);
  if (reverseActive !== reverseEffectWasActive) {
    pressedKeys.clear();
    game.moveDir = 0;
    reverseEffectWasActive = reverseActive;
  }
  const effects = [];
  if (inkActive) effects.push(`먹물 ${Math.ceil(session.itemEffects.inkUntil - now)}초`);
  if (speedActive) effects.push(`초고속 ${Math.ceil(session.itemEffects.speedUntil - now)}초`);
  if (reverseActive) effects.push(`좌우 반전 ${Math.ceil(session.itemEffects.reverseUntil - now)}초`);
  if (sealActive) effects.push(`홀드 봉인 ${Math.ceil(session.itemEffects.sealUntil - now)}초`);
  if (previewActive) effects.push(`NEXT 차단 ${Math.ceil(session.itemEffects.previewUntil - now)}초`);
  if (session.itemShieldCharges > 0) effects.push("방어막 준비");
  el("item-effect-status").textContent = effects.length ? effects.join(" · ") : "1 · 2 · 3 키로 사용";
}

function handleRemoteState(state) {
  remoteState = state;
  handleOpponentReconnect();
}

function handleOpponentDisconnect() {
  if (!session.multiplayer || session.opponentDisconnected) return;
  session.opponentDisconnected = true;
  session.reconnectDeadline = performance.now() / 1000 + 10;
  if (session.screen === "playing") {
    triggerGameText("상대 연결 끊김 · 재접속 대기", "bad");
  } else if (session.screen === "wager") {
    el("wager-error").textContent = "상대 연결이 끊겼습니다. 10초 동안 재접속을 기다립니다.";
  } else if (session.screen === "difficulty") {
    el("difficulty-vote-status").textContent = "상대 연결 끊김 · 10초 재접속 대기";
  } else if (session.screen === "ready") {
    el("ready-status").textContent = "상대 연결 끊김 · 10초 재접속 대기";
  }
  const expectedDeadline = session.reconnectDeadline;
  setTimeout(() => {
    if (!session.opponentDisconnected || session.reconnectDeadline !== expectedDeadline || session.screen === "playing") return;
    cancelDisconnectedMatchBeforeStart();
  }, 10100);
}

function handleOpponentReconnect() {
  if (!session.opponentDisconnected) return;
  session.opponentDisconnected = false;
  session.reconnectDeadline = 0;
  el("connection-status").classList.remove("visible");
  if (session.screen === "playing") {
    triggerGameText("상대 재접속 완료", "good");
    sound.play("match");
  } else if (session.screen === "wager") {
    el("wager-error").textContent = "상대가 다시 연결되었습니다.";
  } else if (session.screen === "ready") {
    el("ready-status").textContent = "상대가 다시 연결되었습니다. 준비 상태를 확인하세요.";
  }
}

async function cancelDisconnectedMatchBeforeStart() {
  if (wagerPaymentPollTimer) {
    clearInterval(wagerPaymentPollTimer);
    wagerPaymentPollTimer = null;
  }
  if (session.wagerTrackingToken) {
    const token = session.wagerTrackingToken;
    session.wagerTrackingToken = "";
    await cancelPaymentRequest(token).catch(() => {});
  }
  if (session.wagerPaid && session.wagerAmount > 0) {
    try {
      await requestReward({
        rewardType: "disconnect_refund",
        gameToken: session.wagerToken,
      });
    } catch (error) {
      console.warn("Disconnect refund pending", error);
    }
  }
  matchmaker.leaveRoom();
  session.multiplayer = false;
  session.opponentDisconnected = false;
  session.reconnectDeadline = 0;
  session.screen = "mode";
  showScreen("screen-mode");
}

function updateConnectionRecovery(now) {
  const status = el("connection-status");
  if (!session.opponentDisconnected) {
    status.classList.remove("visible");
    return;
  }
  const remaining = Math.max(0, Math.ceil(session.reconnectDeadline - now));
  status.textContent = `상대 연결 끊김 · ${remaining}초 후 기권 처리`;
  status.classList.add("visible");
  if (remaining <= 0 && !session.matchOutcome) {
    session.opponentDisconnected = false;
    status.classList.remove("visible");
    setMatchResult("win", "상대 연결 종료로 기권승", now);
  }
}

function showGameCountdown(value) {
  const target = el("game-countdown-fx");
  target.textContent = value;
  restartFxClass(target, "show", 800);
}

function showFlowCountdown(value) {
  const target = el("flow-countdown");
  target.textContent = value;
  restartFxClass(target, "show", 760);
}

function showGameOverEffect(reason) {
  const target = el("game-over-fx");
  const label = target.querySelector("span");
  const title = target.querySelector("strong");
  if (reason === "time") {
    label.textContent = "TIME LIMIT REACHED";
    title.textContent = "TIME UP";
  } else {
    label.textContent = "STACK LIMIT REACHED";
    title.textContent = "GAME OVER";
  }
  restartFxClass(target, "show", 1550);
  sound.playGameOver(reason);
}

function handleGameEvent(type, detail) {
  if (session.screen !== "playing") return;
  if (type === "discard") {
    triggerGameFlash(detail.value > 0 ? "good" : "bad");
    triggerGameText(detail.value > 0 ? "COMPOSITE +" : "PRIME -", detail.value > 0 ? "good" : "bad");
  } else if (type === "clearScore") {
    const strong = detail.lines >= 3 || detail.multiplier >= 3;
    triggerGameFlash(detail.value >= 0 ? "good" : "bad", strong);
    const comboText = detail.comboBonus > 0 ? ` · COMBO x${detail.combo} +${detail.comboBonus}` : "";
    triggerGameText(detail.value >= 0 ? `${detail.lines} LINE +${detail.value}${comboText}` : `${detail.lines} LINE ${detail.value}${comboText}`, detail.value >= 0 ? "good" : "bad");
    if (detail.allPrime) gainRandomItem();
  } else if (type === "gameOver") {
    if (detail.reason !== "match") showGameOverEffect(detail.reason);
  }
}

function resetRecordCelebration() {
  el("screen-result").classList.remove("record-breaking");
  el("record-confetti").innerHTML = "";
}

function playRecordCelebration() {
  resetRecordCelebration();
  const colors = ["#f6c945", "#2f6b4f", "#c0783c", "#e45b5b", "#4fa9a1", "#9d6cad", "#fff2a8"];
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < 78; index += 1) {
    const piece = document.createElement("i");
    piece.className = "confetti-piece";
    piece.style.setProperty("--x", `${Math.random() * 100}%`);
    piece.style.setProperty("--w", `${5 + Math.random() * 7}px`);
    piece.style.setProperty("--color", colors[index % colors.length]);
    piece.style.setProperty("--rotation", `${Math.random() * 360}deg`);
    piece.style.setProperty("--duration", `${2.5 + Math.random() * 2.2}s`);
    piece.style.setProperty("--delay", `${Math.random() * 1.1}s`);
    piece.style.setProperty("--drift", `${-130 + Math.random() * 260}px`);
    fragment.appendChild(piece);
  }
  el("record-confetti").appendChild(fragment);
  void el("screen-result").offsetWidth;
  el("screen-result").classList.add("record-breaking");
  sound.playRecordFanfare();
}

// ---------- Screen: student ----------

function showCoinScreen(student) {
  const name = student.name || session.studentName;
  const sid = student.student_id || session.studentId;
  const info = el("coin-student-info");
  const nameLine = document.createElement("p");
  const idLine = document.createElement("p");
  nameLine.className = "coin-student-name";
  idLine.className = "coin-student-id";
  nameLine.textContent = name;
  idLine.textContent = sid;
  info.replaceChildren(nameLine, idLine);
  el("coin-price-label").textContent = COIN_PRICE === 0 ? "테스트 참가비: 0코인" : `참가비: ${COIN_PRICE} 코인`;
  el("coin-status").textContent = COIN_PRICE === 0
    ? "테스트 모드에서는 실제 코인이 차감되지 않습니다."
    : "결제 내용을 확인하면 Naplace Coin에서 즉시 차감됩니다.";
  el("coin-error").textContent = "";
  const payBtn = el("coin-pay");
  payBtn.disabled = false;
  payBtn.textContent = COIN_PRICE === 0 ? "0코인으로 입장" : `${COIN_PRICE.toLocaleString()}코인 바로 결제`;
  session.screen = "coin";
  showScreen("screen-coin");
}

async function initStudentScreen() {
  if (paymentPollTimer) clearInterval(paymentPollTimer);
  paymentPollTimer = null;
  activeEntryTrackingToken = "";
  entryPaymentAttemptId = "";
  session.entryPaid = false;
  session.entryToken = "";
  session.screen = "student";
  showScreen("screen-student");
  el("qr-scan-area").style.display = "none";
  el("manual-login-area").style.display = "block";
  loadTopScoreForStudentScreen();
}

async function loadTopScoreForStudentScreen() {
  const top1El = el("student-top1");
  top1El.style.display = "none";
  top1El.textContent = "";
  try {
    const scoreboard = dedupeScoreboardBest((await loadScoreboard()).filter((row) => !isRankingExcludedName(row.name)));
    if (scoreboard.length > 0) {
      const top = scoreboard[0];
      top1El.textContent = `🏆 현재 1등: ${top.name} (${Number(top.best_score).toLocaleString()}점)`;
      top1El.style.display = "block";
    }
  } catch (error) {
    // scoreboard unavailable, leave blank
  }
}

function hasCurrentEntryAccess() {
  const testBypass = ALLOW_TEST_NICKNAME && session.studentName === "한교동";
  return session.entryPaid && (Boolean(session.entryToken) || testBypass);
}

function requireCurrentEntryAccess() {
  if (hasCurrentEntryAccess()) return true;
  showCoinScreen({ student_id: session.studentId, name: session.studentName });
  el("coin-error").textContent = "새 게임을 시작하려면 참가비 결제가 필요합니다.";
  return false;
}

// Manual fallback
el("student-next").addEventListener("click", submitStudent);
el("student-id").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); e.stopPropagation(); submitStudent(); }
});
el("student-name").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); e.stopPropagation(); submitStudent(); }
});

function submitStudent() {
  clickSound();
  const id = el("student-id").value.trim();
  const name = el("student-name").value.trim();
  if (!id || !name) { el("student-error").textContent = "학번과 이름을 모두 입력하세요."; return; }
  if (!/^\d{4}$/.test(id)) { el("student-error").textContent = "학번은 숫자 4자리로 입력하세요."; return; }
  if (name.length > 20 || /[<>\u0000-\u001f]/.test(name)) { el("student-error").textContent = "이름은 20자 이내의 일반 문자로 입력하세요."; return; }
  el("student-error").textContent = "";
  session.studentId = id;
  session.studentName = name;
  session.entryPaid = false;
  session.entryToken = "";
  if (ALLOW_TEST_NICKNAME && name === "한교동") {
    session.entryPaid = true;
    session.screen = "mode";
    showScreen("screen-mode");
    return;
  }
  showCoinScreen({ student_id: id, name });
}

// ---------- Screen: coin ----------
el("coin-pay").addEventListener("click", async () => {
  clickSound();
  const payBtn = el("coin-pay");
  payBtn.disabled = true;
  payBtn.textContent = "잔액 확인 중...";
  el("coin-error").textContent = "";
  try {
    const confirmed = await confirmCoinPayment(session.studentId, COIN_PRICE);
    if (!confirmed) {
      payBtn.disabled = false;
      payBtn.textContent = COIN_PRICE === 0 ? "0코인으로 입장" : `${COIN_PRICE.toLocaleString()}코인 바로 결제`;
      el("coin-status").textContent = "결제가 취소되었습니다. 원할 때 다시 요청할 수 있습니다.";
      return;
    }
    payBtn.textContent = "처리 중...";
    entryPaymentAttemptId ||= crypto.randomUUID();
    const request = await createPaymentRequest(session.studentId, COIN_PRICE, "entry", "", entryPaymentAttemptId);
    if (request.status === "approved") {
      if (!request.game_token) throw new Error("승인 토큰을 받지 못했습니다.");
      session.entryPaid = true;
      session.entryToken = request.game_token;
      entryPaymentAttemptId = "";
      el("coin-status").textContent = COIN_PRICE === 0
        ? "계정 확인 완료 · 코인 차감 없이 입장합니다."
        : request.duplicate ? "이미 완료된 결제를 확인했습니다." : "결제가 즉시 완료되었습니다.";
      session.screen = "mode";
      showScreen("screen-mode");
      return;
    }
    payBtn.textContent = "승인 대기 중...";
    activeEntryTrackingToken = request.tracking_token || "";
    el("coin-status").textContent = `${session.studentName}님의 결제 승인을 기다리는 중입니다.`;
    const check = async () => {
      const result = await getPaymentStatus(request.tracking_token);
      if (result.status === "approved") {
        clearInterval(paymentPollTimer);
        paymentPollTimer = null;
        if (session.screen !== "coin") return;
        session.entryPaid = true;
        session.entryToken = result.game_token || "";
        activeEntryTrackingToken = "";
        if (!session.entryToken) throw new Error("승인 토큰을 받지 못했습니다.");
        el("coin-status").textContent = "결제가 승인되었습니다. 모드를 선택하세요.";
        session.screen = "mode";
        showScreen("screen-mode");
      } else if (["rejected", "expired", "canceled"].includes(result.status)) {
        clearInterval(paymentPollTimer);
        paymentPollTimer = null;
        if (session.screen === "coin") handleEntryPaymentError(new Error(`결제 요청이 ${result.status === "rejected" ? "거절" : "종료"}되었습니다.`));
      }
    };
    paymentPollTimer = setInterval(() => check().catch(handleEntryPollWarning), PAYMENT_POLL_MS);
    await check().catch(handleEntryPollWarning);
  } catch (err) {
    if (["payment_failed", "payment_conflict"].includes(err.code)) entryPaymentAttemptId = "";
    handleEntryPaymentError(err);
  }
});

function handleEntryPaymentError(err) {
  if (paymentPollTimer) clearInterval(paymentPollTimer);
  paymentPollTimer = null;
  activeEntryTrackingToken = "";
  el("coin-error").textContent = err.message || "결제 실패";
  el("coin-status").textContent = "결제가 완료되지 않았습니다. 아래 버튼으로 다시 시도할 수 있습니다.";
  el("coin-pay").disabled = false;
  el("coin-pay").textContent = "바로 결제 다시 시도";
}

function handleEntryPollWarning(err) {
  if (/토큰.*(만료|올바르지|서명)/.test(err.message || "")) {
    handleEntryPaymentError(new Error("결제 확인 시간이 만료되었습니다. 다시 요청해주세요."));
    return;
  }
  el("coin-error").textContent = `상태 확인 재시도 중: ${err.message || "일시적인 연결 오류"}`;
  el("coin-status").textContent = "기존 결제 요청의 승인 상태를 계속 확인하고 있습니다.";
}

el("coin-back").addEventListener("click", async () => {
  clickSound();
  if (activeEntryTrackingToken) {
    const token = activeEntryTrackingToken;
    activeEntryTrackingToken = "";
    await cancelPaymentRequest(token).catch(() => {});
  }
  await initStudentScreen();
});

initStudentScreen();

// ---------- Screen: mode ----------
function beginSoloSetup() {
  clearFlowTimers();
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
  session.rewardHandled = false;
  session.rewardAmount = 0;
  session.rewardStatusText = "";
  session.finishing = false;
  session.finalScore = 0;
  session.leaderboardBonus = 0;
  session.pendingDifficultyIndex = null;
  el("finished-reward").textContent = "";
  remoteState = null;
  renderDifficultyScreen();
  session.screen = "difficulty";
  showScreen("screen-difficulty");
}

el("mode-single").addEventListener("click", () => {
  clickSound();
  if (!requireCurrentEntryAccess()) return;
  beginSoloSetup();
});

el("mode-multiplayer").addEventListener("click", () => {
  clickSound();
  if (!requireCurrentEntryAccess()) return;
  clearFlowTimers();
  matchmaker.leaveRoom();
  prepareMultiplayerSession();
  showRoomScreen();
});

function showRoomScreen() {
  el("room-actions").style.display = "block";
  el("room-waiting").style.display = "none";
  el("room-error").textContent = "";
  el("room-list").innerHTML = '<p class="room-empty">열린 방을 찾는 중...</p>';
  el("room-count").textContent = "0개";
  if (isSupabaseConfigured()) {
    matchmaker.watchRooms(renderPublicRooms).catch((error) => {
      el("room-error").textContent = error.message;
      el("room-list").innerHTML = '<p class="room-empty">온라인 인증 설정을 확인하세요.</p>';
    });
  }
  session.screen = "room";
  showScreen("screen-room");
}

function renderPublicRooms(rooms) {
  const list = el("room-list");
  el("room-count").textContent = `${rooms.length}개`;
  list.innerHTML = "";
  if (!rooms.length) {
    list.innerHTML = '<p class="room-empty">현재 열린 방이 없습니다. 새 방을 만들어보세요.</p>';
    return;
  }
  rooms.forEach((room) => {
    const button = document.createElement("button");
    button.className = "room-entry";
    const info = document.createElement("span");
    const title = document.createElement("b");
    title.textContent = `${room.name || "플레이어"}의 방`;
    const detail = document.createElement("small");
    detail.textContent = "1 / 2명 · 참가 대기 중";
    if (room.itemMode) {
      const badge = document.createElement("small");
      badge.className = "room-mode-badge";
      badge.textContent = "아이템전";
      title.appendChild(badge);
    }
    const joinLabel = document.createElement("span");
    joinLabel.className = "room-join-label";
    joinLabel.textContent = "참가";
    info.append(title, detail);
    button.append(info, joinLabel);
    button.addEventListener("click", () => joinPublicRoom(room));
    list.appendChild(button);
  });
}

function showRoomWaiting(code, joining = false, itemMode = false) {
  el("room-actions").style.display = "none";
  el("room-waiting").style.display = "block";
  el("room-code-display").textContent = joining ? "참가 요청 중" : "내 방 생성 완료";
  el("room-waiting-title").textContent = joining ? "방에 참가하는 중" : "상대를 기다리는 중";
  el("room-waiting-hint").textContent = joining ? "방 생성자가 연결되면 자동으로 시작합니다." : "방 목록에서 상대가 참가하면 자동으로 시작합니다.";
  const itemModeInput = el("room-item-mode");
  itemModeInput.checked = itemMode;
  itemModeInput.disabled = joining;
  el("room-item-mode-control").style.display = joining ? "none" : "flex";
  el("room-item-mode-title").textContent = `아이템전 ${itemMode ? "ON" : "OFF"}`;
  el("room-item-mode-hint").textContent = "상대가 참가하기 전까지 켜거나 끌 수 있습니다.";
  el("item-rules-toggle").setAttribute("aria-expanded", "false");
  el("item-rules-panel").hidden = true;
  el("room-error").textContent = "";
}

el("item-rules-toggle").addEventListener("click", () => {
  const button = el("item-rules-toggle");
  const panel = el("item-rules-panel");
  const expanded = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!expanded));
  panel.hidden = expanded;
  clickSound();
});

el("room-item-mode").addEventListener("change", async (event) => {
  const itemMode = event.currentTarget.checked;
  try {
    await matchmaker.updateRoomOptions({ itemMode });
  } catch (error) {
    event.currentTarget.checked = !itemMode;
    el("room-error").textContent = error.message;
    return;
  }
  el("room-item-mode-title").textContent = `아이템전 ${itemMode ? "ON" : "OFF"}`;
  el("room-item-mode-hint").textContent = itemMode
    ? "올소수 줄을 지우면 방해 아이템을 얻습니다."
    : "일반전으로 진행합니다.";
  clickSound();
});

el("room-create").addEventListener("click", async () => {
  clickSound();
  if (!isSupabaseConfigured()) {
    el("room-error").textContent = "Supabase 온라인 설정이 필요합니다.";
    return;
  }
  try {
    const code = await matchmaker.createRoom(onMultiplayerMatched, session.studentName, { itemMode: false });
    showRoomWaiting(code, false, false);
  } catch (error) {
    el("room-error").textContent = error.message;
  }
});

async function joinPublicRoom(room) {
  clickSound();
  if (!isSupabaseConfigured()) {
    el("room-error").textContent = "Supabase 온라인 설정이 필요합니다.";
    return;
  }
  try {
    const roomCode = typeof room === "string" ? room : room.code;
    const itemMode = typeof room === "object" && Boolean(room.itemMode);
    const code = await matchmaker.joinRoom(roomCode, onMultiplayerMatched, session.studentName);
    showRoomWaiting(code, true, itemMode);
    if (roomJoinTimer) clearTimeout(roomJoinTimer);
    roomJoinTimer = setTimeout(() => {
      if (session.screen !== "room" || matchmaker.matched) return;
      matchmaker.leaveRoom();
      el("room-actions").style.display = "block";
      el("room-waiting").style.display = "none";
      el("room-error").textContent = "방이 이미 시작됐거나 닫혔습니다. 다른 방을 선택하세요.";
    }, 8000);
  } catch (error) {
    el("room-error").textContent = error.message;
  }
}

el("room-cancel").addEventListener("click", () => {
  clickSound();
  clearFlowTimers();
  if (roomJoinTimer) clearTimeout(roomJoinTimer);
  roomJoinTimer = null;
  matchmaker.leaveRoom();
  matchmaker.cancelRoomDirectory();
  session.multiplayer = false;
  session.screen = "mode";
  showScreen("screen-mode");
});

el("mode-back").addEventListener("click", async () => {
  clickSound();
  clearFlowTimers();
  await initStudentScreen();
});

// ---------- Screen: difficulty ----------
function renderDifficultyScreen() {
  el("difficulty-list-status").textContent = session.mode === "multi"
    ? "각자 하나씩 투표합니다. 의견이 다르면 돌림판으로 결정합니다."
    : "선택한 난이도의 점수별 코인 보상을 확인하세요.";
  el("difficulty-back").textContent = session.mode === "multi" ? "매칭 취소" : "모드 선택";
  el("difficulty-vote-status").textContent = session.myDifficultyVote === null ? "" : "내 투표 완료 · 상대 투표 대기 중";
  el("difficulty-confirm").disabled = session.pendingDifficultyIndex === null || session.myDifficultyVote !== null;
  el("difficulty-confirm").textContent = session.mode === "multi" ? "이 난이도에 투표" : "이 난이도로 확정";
  const list = el("difficulty-list");
  const hadFocus = list.contains(document.activeElement);
  list.innerHTML = "";
  DIFFICULTIES.forEach((diff, index) => {
    const [, label, minNumber, maxNumber, desc] = diff;
    const row = document.createElement("button");
    row.type = "button";
    row.className = "difficulty-row" + (session.pendingDifficultyIndex === index ? " selected" : "");
    row.innerHTML = `<span class="d-label">${index + 1}. ${label}</span><span class="d-range">${minNumber}~${maxNumber}</span><span class="d-desc">${desc}</span>`;
    row.addEventListener("click", () => previewDifficulty(index));
    list.appendChild(row);
    if (hadFocus && session.pendingDifficultyIndex === index) row.focus();
  });
  if (session.pendingDifficultyIndex === null) {
    el("difficulty-score-multiplier").textContent = "×—";
    renderDifficultyRewardTable();
  } else {
    renderDifficultyDetail(session.pendingDifficultyIndex);
  }
}

function renderDifficultyDetail(index) {
  el("difficulty-score-multiplier").textContent = `×${scoreMultiplierForDifficulty(index)}`;
  renderDifficultyRewardTable();
}

function renderDifficultyRewardTable() {
  const tierRows = rewardTiersForDifficulty()
    .slice().reverse()
    .map(({ minScore, coins }) => `<span><em>${minScore.toLocaleString()}점</em><strong>${coins.toLocaleString()}코인</strong></span>`)
    .join("");
  const topRow = `<span class="reward-top1"><em>전체 1등</em><strong>+${LEADERBOARD_FIRST_BONUS.toLocaleString()}코인</strong></span>`;
  el("difficulty-reward-list").innerHTML = tierRows + topRow;
}

function previewDifficulty(index) {
  if (session.myDifficultyVote !== null) return;
  clickSound();
  session.pendingDifficultyIndex = index;
  renderDifficultyScreen();
}

el("difficulty-back").addEventListener("click", () => {
  clickSound();
  clearFlowTimers();
  if (session.mode === "multi") {
    matchmaker.leaveRoom();
    session.multiplayer = false;
    session.screen = "mode";
    showScreen("screen-mode");
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

function showReadyScreen() {
  const [, label, minNumber, maxNumber] = DIFFICULTIES[session.difficultyIndex];
  el("ready-my-name").textContent = session.studentName;
  el("ready-opponent-name").textContent = session.opponentName || "상대방";
  el("ready-difficulty-label").textContent = `난이도: ${label} (${minNumber}~${maxNumber})`;
  el("ready-btn").disabled = false;
  el("ready-btn").textContent = "준비 완료";
  el("ready-status").textContent = "준비 완료를 눌러 게임을 시작하세요.";
  session.screen = "ready";
  showScreen("screen-ready");
}

el("difficulty-confirm").addEventListener("click", () => {
  const index = session.pendingDifficultyIndex;
  if (index === null) return;
  clickSound();
  if (session.mode === "multi" && session.multiplayer && matchmaker.connected()) {
    session.myDifficultyVote = index;
    el("difficulty-confirm").disabled = true;
    el("difficulty-vote-status").textContent = "내 투표 완료 · 상대 투표 대기 중";
    matchmaker.sendCommand("difficulty_vote", { index });
    resolveDifficultyVotes();
    return;
  }
  finalizeDifficulty(index);
});

function finalizeDifficulty(index) {
  session.difficultyIndex = index;
  session.difficultyResolved = true;
  const [, label, minNumber, maxNumber] = DIFFICULTIES[index];
  el("instructions-subtitle").textContent = `${session.studentName} / ${session.totalRuns}회 플레이 / ${label} ${minNumber}~${maxNumber}`;
  renderRewardGuide(index);
  if (session.mode === "multi") showReadyScreen();
  else showInstructions();
}

function deterministicVoteWinner(a, b) {
  const seed = String(matchmaker.roomId || "").split("").reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);
  const options = [a, b].sort((left, right) => left - right);
  return options[seed % options.length];
}

function resolveDifficultyVotes() {
  if (session.difficultyResolved || session.myDifficultyVote === null || session.opponentDifficultyVote === null) return;
  session.difficultyResolved = true;
  if (session.myDifficultyVote === session.opponentDifficultyVote) {
    el("difficulty-vote-status").textContent = "의견 일치! 난이도가 확정되었습니다.";
    scheduleFlow(() => finalizeDifficulty(session.myDifficultyVote), 600, "difficulty");
    return;
  }
  const chosen = deterministicVoteWinner(session.myDifficultyVote, session.opponentDifficultyVote);
  showDifficultyWheel(session.myDifficultyVote, session.opponentDifficultyVote, chosen);
}

function showDifficultyWheel(myVote, opponentVote, chosen) {
  const myLabel = DIFFICULTIES[myVote][1];
  const opponentLabel = DIFFICULTIES[opponentVote][1];
  el("wheel-options").textContent = `${myLabel} VS ${opponentLabel}`;
  el("wheel-status").textContent = "돌림판으로 최종 난이도를 정하는 중...";
  const wheel = el("difficulty-wheel");
  wheel.classList.remove("spinning");
  void wheel.offsetWidth;
  wheel.classList.add("spinning");
  session.screen = "wheel";
  showScreen("screen-wheel");
  scheduleFlow(() => {
    el("wheel-status").textContent = `${DIFFICULTIES[chosen][1]} 난이도 당첨!`;
    scheduleFlow(() => finalizeDifficulty(chosen), 900, "wheel");
  }, 2600, "wheel");
}

// ---------- Screen: instructions ----------
el("instructions-start").addEventListener("click", () => { clickSound(); startNextRun(); });
el("instructions-sensitivity").addEventListener("click", () => { clickSound(); session.screen = "sensitivity"; renderSensitivityScreen(); showScreen("screen-sensitivity"); });
el("instructions-difficulty").addEventListener("click", () => { clickSound(); session.screen = "difficulty"; showScreen("screen-difficulty"); });

function prepareMultiplayerSession() {
  if (wagerPaymentPollTimer) clearInterval(wagerPaymentPollTimer);
  wagerPaymentPollTimer = null;
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
  session.myReady = false;
  session.opponentReady = false;
  session.matchCountdownStarted = false;
  session.wagerAmount = 0;
  session.opponentWager = 0;
  session.wagerPaid = false;
  session.opponentWagerPaid = false;
  session.wagerToken = "";
  session.wagerTrackingToken = "";
  session.wagerPaymentAttemptId = "";
  session.opponentWagerToken = "";
  session.rewardHandled = false;
  session.rewardAmount = 0;
  session.rewardStatusText = "";
  session.pendingDifficultyIndex = null;
  session.myDifficultyVote = null;
  session.opponentDifficultyVote = null;
  session.difficultyResolved = false;
  session.finishing = false;
  session.finalScore = 0;
  session.leaderboardBonus = 0;
  session.itemMode = false;
  session.opponentDisconnected = false;
  session.reconnectDeadline = 0;
  resetItemBattle();
  remoteState = null;
}

function showWagerScreen() {
  el("wager-my-name").textContent = session.studentName;
  el("wager-opponent-name").textContent = session.opponentName;
  el("wager-amount").disabled = session.wagerPaid || COIN_PRICE === 0;
  if (COIN_PRICE === 0) {
    el("wager-amount").value = "0";
  } else if (!session.wagerPaid && Number(el("wager-amount").value) < MIN_WAGER_AMOUNT) {
    el("wager-amount").value = String(MIN_WAGER_AMOUNT);
  }
  el("wager-submit").disabled = session.wagerPaid;
  const displayAmount = Number(el("wager-amount").value) || 0;
  el("wager-status").textContent = session.wagerPaid
    ? "내 배팅 확정 완료"
    : COIN_PRICE === 0
      ? "0코인 배팅을 확정하세요."
      : `최소 ${MIN_WAGER_AMOUNT.toLocaleString()}코인부터 배팅을 확정하세요.`;
  el("wager-submit").textContent = session.wagerPaid ? "배팅 확정 완료" : `${displayAmount.toLocaleString()}코인 배팅 확정`;
  el("wager-opponent-status").textContent = session.opponentWagerPaid
    ? `상대 배팅: ${session.opponentWager}코인 · 확정 완료`
    : "상대 배팅 확정 대기 중";
  el("wager-error").textContent = "";
  session.screen = "wager";
  showScreen("screen-wager");
}

function maybeAdvanceFromWager() {
  if (session.screen !== "wager") return;
  if (!session.wagerPaid || !session.opponentWagerPaid || !session.wagerToken || !session.opponentWagerToken) return;
  el("wager-status").textContent = `총 배팅 ${session.wagerAmount + session.opponentWager}코인 확정!`;
  if (!flowTimers.size) scheduleFlow(showMatchedDifficulty, 700, "wager");
}

el("wager-amount").addEventListener("input", () => {
  if (session.wagerPaid || COIN_PRICE === 0) return;
  const amount = Number(el("wager-amount").value) || 0;
  el("wager-submit").textContent = `${amount.toLocaleString()}코인 배팅 확정`;
});

el("wager-submit").addEventListener("click", async () => {
  clickSound();
  const amount = Number(el("wager-amount").value);
  if (COIN_PRICE === 0 && amount !== 0) {
    el("wager-error").textContent = "베타테스트 배팅은 0코인으로만 진행됩니다.";
    return;
  }
  if (!Number.isFinite(amount) || amount < 0 || !Number.isInteger(amount)) {
    el("wager-error").textContent = "0 이상의 정수 금액을 입력하세요.";
    return;
  }
  if (COIN_PRICE > 0 && amount < MIN_WAGER_AMOUNT) {
    el("wager-error").textContent = `배팅 금액은 최소 ${MIN_WAGER_AMOUNT.toLocaleString()}코인부터 가능합니다.`;
    return;
  }
  el("wager-submit").disabled = true;
  el("wager-amount").disabled = true;
  el("wager-status").textContent = "잔액 확인 중...";
  el("wager-error").textContent = "";
  try {
    const confirmed = await confirmCoinPayment(session.studentId, amount);
    if (!confirmed) {
      el("wager-submit").disabled = false;
      el("wager-amount").disabled = COIN_PRICE === 0;
      el("wager-status").textContent = "결제가 취소되었습니다. 금액을 확인하고 다시 요청하세요.";
      return;
    }
    session.wagerAmount = amount;
    matchmaker.sendCommand("wager", { amount });
    el("wager-status").textContent = amount === 0 ? "0코인 배팅 확인 중..." : "배팅 금액 즉시 결제 중...";
    session.wagerPaymentAttemptId ||= crypto.randomUUID();
    const request = await createPaymentRequest(session.studentId, amount, "wager", matchmaker.roomId, session.wagerPaymentAttemptId);
    session.wagerTrackingToken = request.tracking_token || "";
    const approveWager = (gameToken) => {
      if (!gameToken) throw new Error("배팅 승인 토큰을 받지 못했습니다.");
      session.wagerToken = gameToken;
      session.wagerPaymentAttemptId = "";
      session.wagerTrackingToken = "";
      session.wagerPaid = true;
      if (session.screen !== "wager" || !matchmaker.connected()) return;
      sound.play("coin");
      matchmaker.sendCommand("wager_paid", { amount, gameToken });
      showWagerScreen();
      maybeAdvanceFromWager();
    };
    if (request.status === "approved") {
      approveWager(request.game_token);
      return;
    }
    el("wager-status").textContent = `${amount}코인 승인 대기 중...`;
    const handleWagerPollError = (error) => {
      const terminal = error.terminal || /토큰.*(만료|올바르지|서명)/.test(error.message || "");
      if (!terminal) {
        el("wager-error").textContent = `상태 확인 재시도 중: ${error.message || "일시적인 연결 오류"}`;
        el("wager-status").textContent = "기존 배팅 요청의 승인 상태를 계속 확인하고 있습니다.";
        return;
      }
      if (wagerPaymentPollTimer) clearInterval(wagerPaymentPollTimer);
      wagerPaymentPollTimer = null;
      session.wagerTrackingToken = "";
      el("wager-error").textContent = error.message;
      el("wager-status").textContent = "승인 대기 종료 · 다시 요청 가능";
      el("wager-submit").disabled = false;
      el("wager-amount").disabled = COIN_PRICE === 0;
      el("wager-submit").textContent = "배팅 결제 다시 요청";
    };
    const poll = async () => {
      const result = await getPaymentStatus(request.tracking_token);
      if (result.status === "approved") {
        if (wagerPaymentPollTimer) clearInterval(wagerPaymentPollTimer);
        wagerPaymentPollTimer = null;
        approveWager(result.game_token);
      } else if (["rejected", "expired", "canceled"].includes(result.status)) {
        if (wagerPaymentPollTimer) clearInterval(wagerPaymentPollTimer);
        wagerPaymentPollTimer = null;
        const error = new Error("배팅 결제가 승인되지 않았습니다. 금액을 확인하고 다시 요청하세요.");
        error.terminal = true;
        throw error;
      }
    };
    wagerPaymentPollTimer = setInterval(() => poll().catch(handleWagerPollError), PAYMENT_POLL_MS);
    await poll().catch(handleWagerPollError);
  } catch (error) {
    if (["payment_failed", "payment_conflict"].includes(error.code)) session.wagerPaymentAttemptId = "";
    el("wager-error").textContent = error.message || "배팅 요청에 실패했습니다.";
    el("wager-submit").disabled = false;
    el("wager-amount").disabled = COIN_PRICE === 0;
  }
});

el("wager-cancel").addEventListener("click", async () => {
  clickSound();
  if (wagerPaymentPollTimer) clearInterval(wagerPaymentPollTimer);
  wagerPaymentPollTimer = null;
  if (session.wagerTrackingToken) {
    const token = session.wagerTrackingToken;
    session.wagerTrackingToken = "";
    await cancelPaymentRequest(token).catch(() => {});
  }
  clearFlowTimers();
  matchmaker.leaveRoom();
  session.multiplayer = false;
  session.screen = "mode";
  showScreen("screen-mode");
});

function showMatchedDifficulty() {
  renderDifficultyScreen();
  session.screen = "difficulty";
  showScreen("screen-difficulty");
}

function startMatchedRun(index, shouldBroadcast = false) {
  if (session.screen === "playing" || session.runNumber > 0) return;
  session.difficultyIndex = index;
  startNextRun();
}

function onMultiplayerMatched(opponent) {
  if (roomJoinTimer) clearTimeout(roomJoinTimer);
  roomJoinTimer = null;
  matchmaker.onRemoteState = handleRemoteState;
  matchmaker.onDisconnect = handleOpponentDisconnect;
  matchmaker.onReconnect = handleOpponentReconnect;
  matchmaker.onCommand = (cmd, data) => {
    if (cmd === "difficulty_vote") {
      session.opponentDifficultyVote = Number(data.index);
      if (session.screen === "difficulty") {
        el("difficulty-vote-status").textContent = session.myDifficultyVote === null
          ? "상대 투표 완료 · 내 난이도를 선택하세요"
          : "양쪽 투표 확인 중...";
      }
      resolveDifficultyVotes();
    } else if (cmd === "ready") {
      session.opponentReady = true;
      if (session.screen === "ready") {
        el("ready-status").textContent = "상대방 준비 완료! " + (session.myReady ? "게임 시작 중..." : "당신도 준비하세요.");
      }
      checkBothReady();
    } else if (cmd === "wager") {
      session.opponentWager = Number(data.amount) || 0;
      if (session.screen === "wager") showWagerScreen();
    } else if (cmd === "wager_paid") {
      session.opponentWager = Number(data.amount) || session.opponentWager;
      session.opponentWagerToken = String(data.gameToken || "");
      session.opponentWagerPaid = Boolean(session.opponentWagerToken);
      sound.play("coin");
      if (session.screen === "wager") showWagerScreen();
      maybeAdvanceFromWager();
    } else if (cmd === "item_attack") {
      receiveIncomingItem(data);
    }
  };
  remoteState = {};
  session.multiplayer = true;
  session.opponentName = opponent?.name || "상대방";
  session.opponentStudentId = "";
  session.itemMode = Boolean(opponent?.roomOptions?.itemMode);
  playMatchFoundTransition(showWagerScreen);
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
  matchmaker.joinQueue((opponent) => {
    matchmaker.onRemoteState = handleRemoteState;
    matchmaker.onDisconnect = handleOpponentDisconnect;
    matchmaker.onReconnect = handleOpponentReconnect;
    matchmaker.onCommand = (cmd, data) => {
      if (cmd === "difficulty_vote") {
        session.opponentDifficultyVote = Number(data.index);
        if (session.screen === "difficulty") {
          el("difficulty-vote-status").textContent = session.myDifficultyVote === null
            ? "상대 투표 완료 · 내 난이도를 선택하세요"
            : "양쪽 투표 확인 중...";
        }
        resolveDifficultyVotes();
      } else if (cmd === "ready") {
        session.opponentReady = true;
        if (session.screen === "ready") {
          el("ready-status").textContent = "상대방 준비 완료! " + (session.myReady ? "게임 시작 중..." : "당신도 준비하세요.");
        }
        checkBothReady();
      } else if (cmd === "wager") {
        session.opponentWager = Number(data.amount) || 0;
        if (session.screen === "wager") showWagerScreen();
      } else if (cmd === "wager_paid") {
        session.opponentWager = Number(data.amount) || session.opponentWager;
        session.opponentWagerToken = String(data.gameToken || "");
        session.opponentWagerPaid = Boolean(session.opponentWagerToken);
        sound.play("coin");
        if (session.screen === "wager") showWagerScreen();
        maybeAdvanceFromWager();
      } else if (cmd === "item_attack") {
        receiveIncomingItem(data);
      }
    };
    remoteState = {};
    session.multiplayer = true;
    session.opponentName = opponent?.name || "상대방";
    session.opponentStudentId = "";
    el("matching-waiting").style.display = "none";
    el("matching-found").style.display = "block";
    el("match-my-name").textContent = session.studentName;
    el("match-opponent-name").textContent = session.opponentName;
    playMatchFoundTransition(showWagerScreen);
  }, session.studentName).catch((error) => {
    el("matching-waiting").style.display = "none";
    el("matching-found").style.display = "block";
    el("matching-found").querySelector(".match-found-badge").textContent = "온라인 인증 실패";
    el("matching-found").querySelector(".hint").textContent = error.message;
  });
}

function checkBothReady() {
  if (session.myReady && session.opponentReady) {
    beginMatchCountdown();
  }
}

function beginMatchCountdown() {
  if (session.matchCountdownStarted || session.screen !== "ready") return;
  session.matchCountdownStarted = true;
  [3, 2, 1].forEach((value, index) => {
    scheduleFlow(() => {
      showFlowCountdown(value);
      sound.play("ready");
    }, index * 800, "ready");
  });
  scheduleFlow(() => {
    showFlowCountdown("START");
    sound.play("start");
  }, 2400, "ready");
  scheduleFlow(() => startMatchedRun(session.difficultyIndex, false), 2900, "ready");
}

el("ready-btn").addEventListener("click", () => {
  clickSound();
  session.myReady = true;
  sound.play("ready");
  matchmaker.sendCommand("ready");
  el("ready-btn").disabled = true;
  el("ready-btn").textContent = "대기 중...";
  el("ready-status").textContent = session.opponentReady ? "게임 시작 중..." : "상대방을 기다리는 중...";
  checkBothReady();
});

el("ready-cancel").addEventListener("click", () => {
  clickSound();
  clearFlowTimers();
  matchmaker.leaveRoom();
  session.multiplayer = false;
  remoteState = null;
  el("matching-waiting").style.display = "block";
  el("matching-found").style.display = "none";
  session.screen = "mode";
  showScreen("screen-mode");
});

// ---------- Screen: online matching ----------
el("instructions-multiplayer").addEventListener("click", () => {
  clickSound();
  matchmaker.leaveRoom();
  prepareMultiplayerSession();
  showRoomScreen();
});
el("matching-cancel").addEventListener("click", () => {
  clickSound();
  clearFlowTimers();
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
  ctx.fillStyle = prime ? "#24543e" : "#96582c";
  ctx.fillRect(left, top, w, w);
  ctx.fillStyle = prime ? "#2f6b4f" : "#c0783c";
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
  ctx.fillStyle = "#fdfcf8";
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
  ctx.strokeStyle = "#d5decf";
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
  ctx.strokeStyle = "#d8ceb8";
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
  ctx.fillStyle = "#fdfcf8";
  ctx.fillRect(0, 0, sensitivityCanvas.width, sensitivityCanvas.height);
  ctx.fillStyle = "#2a2620";
  ctx.font = "bold 11px Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("← / → / ↓ 로 테스트", x0 + (cols * cell) / 2, 18);
  ctx.strokeStyle = "#d5decf";
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
  ctx.strokeStyle = "#2f6b4f";
  ctx.lineWidth = 2;
  for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [1, 1]]) {
    const left = x0 + (sensitivityTest.x + dx) * cell + 2;
    const top = y0 + (sensitivityTest.y + dy) * cell + 2;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(left, top, cell - 4, cell - 4);
    ctx.strokeRect(left, top, cell - 4, cell - 4);
  }
  ctx.fillStyle = "#7a7264";
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
  const [, , minNumber, maxNumber] = DIFFICULTIES[session.difficultyIndex];
  game = new TetrisGame(session.settings, minNumber, maxNumber);
  game.sound = sound;
  game.onEvent = handleGameEvent;
  lastCountdownSecond = null;
  lastDangerSoundAt = 0;
  lastDangerLevel = 0;
  multiplayerLeadState = "tie";
  lastLeadEffectAt = 0;
  session.settingsOpen = false;
  session.settingsIndex = 0;
  pressedKeys.clear();
  game.pressed = pressedKeys;
  session.screen = "playing";
  el("single-reward-guide").classList.toggle("visible", session.mode === "single");
  el("item-battle-ui").classList.toggle("visible", session.multiplayer && session.itemMode);
  el("connection-status").classList.remove("visible");
  session.opponentDisconnected = false;
  session.reconnectDeadline = 0;
  resetItemBattle();
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

async function finishSession() {
  if (session.finishing) return;
  session.finishing = true;
  session.entryPaid = false;
  sound.stopMusic();
  if (game && !game.runRecorded) recordRunScore();
  if (session.bestSessionScore === null && game) session.bestSessionScore = game.score;
  const rawScore = session.bestSessionScore ?? 0;
  const scoreMultiplier = scoreMultiplierForDifficulty(session.difficultyIndex);
  session.finalScore = finalScoreFor(rawScore, session.difficultyIndex);
  const [, label] = DIFFICULTIES[session.difficultyIndex];
  el("result-score").textContent = session.finalScore.toLocaleString();
  el("result-difficulty").textContent = label;
  el("result-coins").textContent = "집계 중...";
  el("result-reward-status").textContent = "코인 보상을 계산하고 있습니다.";
  const scoreCalculation = `원점수 ${rawScore.toLocaleString()} × 난이도 ${scoreMultiplier} = ${session.finalScore.toLocaleString()}점`;
  el("result-detail").textContent = session.mode === "multi"
    ? `${session.matchDetail || "대전 결과"} · ${scoreCalculation}`
    : scoreCalculation;
  el("result-title").textContent = session.mode === "multi"
    ? session.matchOutcome === "win" ? "승리!" : session.matchOutcome === "lose" ? "패배" : "무승부"
    : "게임 종료";
  el("result-badge").textContent = session.mode === "multi" ? "MATCH RESULT" : "SINGLE RESULT";
  el("result-scoreboard").disabled = true;
  resetRecordCelebration();
  session.screen = "result";
  showScreen("screen-result");

  const rankingExcluded = isRankingExcludedName(session.studentName);
  session.leaderboardBonus = 0;
  session.personalBest = false;

  if (!session.recordSaved && !rankingExcluded) {
    const [, label, , maxNumber] = DIFFICULTIES[session.difficultyIndex];
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const playedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    try {
      const priorBest = await loadStudentBestScore(session.studentId).catch(() => null);
      session.personalBest = priorBest === null || session.finalScore > priorBest;
      const saved = await appendScoreboardEntry({
        student_id: session.studentId,
        name: session.studentName,
        best_score: session.finalScore,
        runs: session.totalRuns,
        difficulty: label,
        max_number: maxNumber,
        played_at: playedAt,
      }, session.entryToken);
      session.currentScoreboardId = saved.scoreboard_id || null;
      session.leaderboardBonus = Number(saved.leaderboard_bonus) === 3000 ? 3000 : 0;
    } catch (error) {
      session.currentScoreboardId = null;
      el("result-detail").textContent += ` · 랭킹 저장 실패: ${error.message}`;
    }
    session.recordSaved = true;
  } else if (rankingExcluded) {
    session.currentScoreboardId = null;
    session.recordSaved = true;
    el("result-detail").textContent += " · 테스트 닉네임: 랭킹 미등록";
  }
  if (session.leaderboardBonus > 0) {
    el("result-detail").textContent += ` · NEW 1위! 추가 ${session.leaderboardBonus.toLocaleString()}코인`;
    playRecordCelebration();
  } else if (session.personalBest) {
    el("result-detail").textContent += " · NEW RECORD! 개인 최고 기록 경신";
    playRecordCelebration();
  }
  await settleCoinResult();
  const resultCoins = el("result-coins");
  resultCoins.textContent = `${session.rewardAmount.toLocaleString()}코인`;
  restartFxClass(resultCoins, "coin-total-reveal", 1600);
  if (session.rewardAmount > 0) sound.play("coin");
  el("result-reward-status").textContent = session.rewardStatusText;
  el("result-scoreboard").disabled = false;
}

async function settleCoinResult() {
  if (session.rewardHandled) return;
  session.rewardHandled = true;
  if (isRankingExcludedName(session.studentName)) {
    session.rewardAmount = 0;
    session.rewardStatusText = "테스트 닉네임은 코인 정산에서 제외됩니다.";
    return;
  }
  const score = session.finalScore;
  let amount = 0;
  let requestPayload = null;

  if (session.mode === "single") {
    amount = singleRewardFor(score);
    requestPayload = {
      rewardType: "single",
      gameToken: session.entryToken,
      finalScore: score,
    };
  } else if (session.matchOutcome === "win") {
    amount = session.wagerAmount + session.opponentWager;
    requestPayload = { rewardType: "multi_win", gameToken: session.wagerToken, opponentGameToken: session.opponentWagerToken };
  } else if (session.matchOutcome === "draw") {
    amount = session.wagerAmount;
    requestPayload = { rewardType: "multi_draw", gameToken: session.wagerToken, opponentGameToken: session.opponentWagerToken };
  }

  if (session.leaderboardBonus > 0) {
    amount += session.leaderboardBonus;
  }

  if (amount <= 0) {
    session.rewardAmount = 0;
    session.rewardStatusText = session.mode === "single"
      ? "임시 보상 기준에 도달하지 못했습니다."
      : session.matchOutcome === "lose" ? "패배하여 배팅 보상이 없습니다." : "정산할 코인이 없습니다.";
    return;
  }

  session.rewardAmount = amount;
  session.rewardStatusText = `${amount}코인 정산 요청 중...`;
  try {
    if (!requestPayload?.gameToken) throw new Error("검증된 결제 토큰이 없어 정산할 수 없습니다.");
    const result = await requestReward(requestPayload);
    session.rewardAmount = Number(result.amount) || 0;
    session.rewardStatusText = result.mock
      ? `${session.rewardAmount}코인 검증된 테스트 정산 완료 (실제 지급 없음)`
      : `${session.rewardAmount}코인 지급 완료`;
  } catch (error) {
    session.rewardStatusText = `${amount}코인 정산 대기: ${error.message}`;
  }
}

el("result-scoreboard").addEventListener("click", async () => {
  clickSound();
  session.scoreboardOrigin = "result";
  session.screen = "finished";
  showScreen("screen-finished");
  el("finished-restart").textContent = "처음으로";
  el("finished-reward").textContent = session.rewardStatusText;
  el("scoreboard-body").innerHTML = "<tr><td colspan='5' style='text-align:center;color:#7a7264;'>불러오는 중...</td></tr>";
  await showFinishedScreen();
});

el("difficulty-scoreboard").addEventListener("click", async () => {
  clickSound();
  session.scoreboardOrigin = "difficulty";
  session.screen = "finished";
  showScreen("screen-finished");
  el("finished-restart").textContent = "돌아가기";
  el("finished-reward").textContent = "";
  el("scoreboard-body").innerHTML = "<tr><td colspan='5' style='text-align:center;color:#7a7264;'>불러오는 중...</td></tr>";
  await showFinishedScreen();
});

el("student-top1").addEventListener("click", async () => {
  clickSound();
  session.scoreboardOrigin = "student";
  session.screen = "finished";
  showScreen("screen-finished");
  el("finished-restart").textContent = "돌아가기";
  el("finished-reward").textContent = "";
  el("scoreboard-body").innerHTML = "<tr><td colspan='5' style='text-align:center;color:#7a7264;'>불러오는 중...</td></tr>";
  await showFinishedScreen();
});

const SCOREBOARD_PAGE_SIZE = 10;
let scoreboardRows = [];

function dedupeScoreboardBest(rows) {
  const bestByStudent = new Map();
  for (const row of rows) {
    const existing = bestByStudent.get(row.student_id);
    if (!existing || Number(row.best_score) > Number(existing.best_score)) bestByStudent.set(row.student_id, row);
  }
  return [...bestByStudent.values()].sort((a, b) => b.best_score - a.best_score);
}

async function showFinishedScreen() {
  el("finished-subtitle").textContent = session.scoreboardOrigin === "result"
    ? `${session.studentName} 최종 점수: ${session.finalScore.toLocaleString()}`
    : "전체 스코어보드";
  const rawScoreboard = (await loadScoreboard()).filter((row) => !isRankingExcludedName(row.name));
  scoreboardRows = dedupeScoreboardBest(rawScoreboard);
  const currentIndex = scoreboardRows.findIndex((row) => row.student_id === session.studentId);
  session.scoreboardPage = currentIndex >= 0 ? Math.floor(currentIndex / SCOREBOARD_PAGE_SIZE) : 0;
  renderScoreboardPage();
}

function renderScoreboardPage() {
  const body = el("scoreboard-body");
  body.innerHTML = "";
  const totalPages = Math.max(1, Math.ceil(scoreboardRows.length / SCOREBOARD_PAGE_SIZE));
  session.scoreboardPage = Math.min(Math.max(session.scoreboardPage, 0), totalPages - 1);
  const start = session.scoreboardPage * SCOREBOARD_PAGE_SIZE;
  const pageRows = scoreboardRows.slice(start, start + SCOREBOARD_PAGE_SIZE);
  pageRows.forEach((row, index) => {
    const rank = start + index + 1;
    const isPlayer = row.student_id === session.studentId;
    const tr = document.createElement("tr");
    tr.className = "score-row" + (isPlayer ? " is-player" : "");
    [rank, row.student_id, row.name, row.best_score, row.difficulty].forEach((value) => {
      const td = document.createElement("td");
      td.textContent = String(value ?? "");
      tr.appendChild(td);
    });
    body.appendChild(tr);
    setTimeout(() => tr.classList.add("shown"), 60 + index * 90);
  });
  el("scoreboard-page-label").textContent = `${session.scoreboardPage + 1} / ${totalPages}`;
  el("scoreboard-prev").disabled = session.scoreboardPage === 0;
  el("scoreboard-next").disabled = session.scoreboardPage >= totalPages - 1;
}

el("scoreboard-prev").addEventListener("click", () => {
  clickSound();
  session.scoreboardPage -= 1;
  renderScoreboardPage();
});

el("scoreboard-next").addEventListener("click", () => {
  clickSound();
  session.scoreboardPage += 1;
  renderScoreboardPage();
});

el("finished-restart").addEventListener("click", () => {
  clickSound();
  if (session.scoreboardOrigin === "difficulty") {
    session.scoreboardOrigin = null;
    session.screen = "difficulty";
    showScreen("screen-difficulty");
    return;
  }
  if (session.scoreboardOrigin === "student") {
    session.scoreboardOrigin = null;
    initStudentScreen();
    return;
  }
  clearFlowTimers();
  matchmaker.leaveRoom();
  sound.stopMusic();
  session.mode = "single";
  session.multiplayer = false;
  session.youWin = false;
  session.matchOutcome = null;
  session.matchDetail = "";
  session.currentScoreboardId = null;
  session.musicStoppedOnEnd = false;
  session.rewardHandled = false;
  session.entryPaid = false;
  session.entryToken = "";
  session.wagerToken = "";
  session.wagerTrackingToken = "";
  session.wagerPaymentAttemptId = "";
  session.opponentWagerToken = "";
  remoteState = null;
  el("student-id").value = "";
  el("student-name").value = "";
  initStudentScreen();
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

function reverseControlKey(key) {
  if (!itemEffectActive("reverse")) return key;
  return { left: "right", right: "left", a: "d", d: "a" }[key] || key;
}

document.querySelectorAll(".item-slot").forEach((button) => {
  button.addEventListener("click", () => useItem(Number(button.dataset.slot)));
});

function setMatchResult(outcome, detail, now) {
  if (session.matchOutcome) return;
  session.matchOutcome = outcome;
  session.matchDetail = detail;
  session.youWin = outcome === "win";
  sound.play(outcome === "win" ? "win" : outcome === "lose" ? "lose" : "final");
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
  let key = normalizeKey(event);
  if (MENU_SCREENS.has(session.screen) && ["up", "down", "left", "right"].includes(key) && document.activeElement?.tagName !== "INPUT") {
    event.preventDefault();
    moveMenuFocus(key === "up" || key === "left" ? -1 : 1);
    return;
  }
  if (session.screen === "mode") {
    if (key === "escape") el("mode-back").click();
    return;
  }
  if (session.screen === "difficulty") {
    if (["1", "2", "3", "4", "5"].includes(key)) previewDifficulty(parseInt(key, 10) - 1);
    else if (key === "escape") el("difficulty-back").click();
    return;
  }
  if (session.screen === "matching") {
    if (key === "escape") el("matching-cancel").click();
    return;
  }
  if (session.screen === "room") {
    if (key === "escape") el("room-cancel").click();
    return;
  }
  if (session.screen === "wager") {
    if (key === "escape") el("wager-cancel").click();
    return;
  }
  if (session.screen === "ready") {
    if (key === "escape") el("ready-cancel").click();
    return;
  }
  if (session.screen === "coin") {
    if (key === "escape") el("coin-back").click();
    return;
  }
  if (session.screen === "instructions") {
    if (key === "s") { session.screen = "sensitivity"; renderSensitivityScreen(); showScreen("screen-sensitivity"); }
    else if (key === "escape") { session.screen = "difficulty"; showScreen("screen-difficulty"); }
    return;
  }
  if (session.screen === "sensitivity") {
    const screenEl = el("screen-sensitivity");
    const focusedButton = document.activeElement?.tagName === "BUTTON" && screenEl.contains(document.activeElement)
      ? document.activeElement
      : null;
    if (REPEAT_KEYS.has(key) && !focusedButton) { pressedKeys.add(key); event.preventDefault(); return; }
    if ((key === "return" || key === "space") && !focusedButton) { pressedKeys.clear(); startNextRun(); }
    else if (key === "escape") { pressedKeys.clear(); showInstructions(); }
    else if (key === "r" && !focusedButton) { resetSensitivityTest(); }
    return;
  }
  if (session.screen === "finished") {
    if (key === "r") el("finished-restart").click();
    return;
  }
  if (session.screen === "result") {
    return;
  }
  if (session.screen !== "playing" || !game) return;
  if (["1", "2", "3"].includes(key) && session.multiplayer && session.itemMode) {
    event.preventDefault();
    useItem(Number(key) - 1);
    return;
  }
  if (game.gameOver) return;
  if (game.clearingAnimation) return;
  key = reverseControlKey(key);
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
  if (itemEffectActive("seal") && (key === "c" || key === "shift_l" || key === "shift_r")) {
    event.preventDefault();
    triggerGameText("HOLD SEALED", "bad");
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
  let key = normalizeKey(event);
  if (session.screen === "playing") key = reverseControlKey(key);
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
function updateLiveGameEffects(now) {
  if (!game) return;
  updateItemBattleEffects(now);
  if (game.gameOver) return;
  const remaining = game.remainingTime(now);
  sound.setMusicPressure(remaining);
  if (remaining <= 10 && remaining > 0 && remaining !== lastCountdownSecond) {
    lastCountdownSecond = remaining;
    sound.play(remaining <= 3 ? "tickFinal" : "tick");
    if (remaining <= 3) showGameCountdown(remaining);
  }

  const danger = game.dangerLevel();
  if (danger >= 2 && (lastDangerLevel < 2 || now - lastDangerSoundAt >= 3.2)) {
    sound.play("warning");
    lastDangerSoundAt = now;
  }
  lastDangerLevel = danger;

  if (session.multiplayer && Number.isFinite(remoteState?.score)) {
    const nextLead = game.score > remoteState.score ? "lead" : game.score < remoteState.score ? "behind" : "tie";
    if (nextLead !== multiplayerLeadState && nextLead !== "tie" && now - lastLeadEffectAt >= 1.8) {
      multiplayerLeadState = nextLead;
      lastLeadEffectAt = now;
      triggerGameText(nextLead === "lead" ? "LEAD!" : "상대가 앞서는 중", nextLead === "lead" ? "good" : "bad");
      sound.play(nextLead === "lead" ? "lead" : "behind");
    } else if (nextLead === "tie") {
      multiplayerLeadState = "tie";
    }
  }
}

function frame() {
  const now = performance.now() / 1000;
  if (session.screen === "playing" && game) {
    game.tick(now, session.settingsOpen);
    updateLiveGameEffects(now);
    updateConnectionRecovery(now);
    resolveMultiplayerResult(now);
    if (game.gameOver) {
      recordRunScore();
      if (!session.musicStoppedOnEnd) {
        sound.stopMusic();
        session.musicStoppedOnEnd = true;
      }
      if (session.multiplayer && session.runNumber >= session.totalRuns) {
        // 버튼 클릭으로만 finishSession 진행
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
      minNumber: DIFFICULTIES[session.difficultyIndex][2],
      maxNumber: DIFFICULTIES[session.difficultyIndex][3],
      bestSessionScore: session.bestSessionScore,
      settingsOpen: session.settingsOpen,
      settingsIndex: session.settingsIndex,
      settingRows: SETTING_ROWS,
      multiplayerConnected: opponentActive,
      remoteState,
      youWin: session.youWin,
      matchOutcome: session.matchOutcome,
      matchDetail: session.matchDetail,
      hideNext: itemEffectActive("preview", now),
      holdSealed: itemEffectActive("seal", now),
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
