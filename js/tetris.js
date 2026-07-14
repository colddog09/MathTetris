import {
  COLS, ROWS, SPAWN_Y, SHAPES, JLSTZ_KICKS, I_KICKS, IMMOBILE_SPIN_KINDS,
  PRIME_SCORE, COMPOSITE_SCORE, DISCARD_PRIME_PENALTY, DISCARD_COMPOSITE_BONUS, SOFT_DROP_SLOWDOWN,
  T_SPIN_SCORE_MULTIPLIER, OTHER_SPIN_SCORE_MULTIPLIER,
  DANGER_TOP_ROWS, CLEAR_STEP_DELAY, CLEAR_FINAL_DELAY, PIECE_ANIMATION_SPEED,
  GAME_TIME_LIMIT, LOCK_DELAY, LOCK_RESET_LIMIT, TIME_SPEEDUP_MS_PER_SECOND,
  COMBO_SCORE_STEP,
} from "./constants.js";
import { isPrime, createNumberBag, drawFromNumberBag } from "./numbers.js";

function pieceCells(piece, x = piece.x, y = piece.y, rotation = piece.rotation) {
  return SHAPES[piece.kind][rotation].map(([dx, dy]) => [x + dx, y + dy]);
}

export class TetrisGame {
  constructor(settings, minNumber, maxNumber) {
    this.settings = settings;
    this.minNumber = minNumber;
    this.maxNumber = maxNumber;
    this.sound = null;
    this.onEvent = null;
    this.reset(performance.now() / 1000);
  }

  reset(now) {
    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    this.bag = [];
    this.queue = [];
    this.hold = null;
    this.canHold = true;
    this.score = 0;
    this.lines = 0;
    this.discards = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.lastClear = 0;
    this.level = this.settings.starting_level;

    this.lastMoveWasRotation = false;
    this.lastRotationKickIndex = null;
    this.current = null;
    this.gameOver = false;
    this.gameOverReason = "";
    this.runRecorded = false;

    this.pressed = new Set();
    this.moveDir = 0;
    this.nextSideMove = 0;
    this.nextSoftDrop = 0;
    this.lastGravity = now;
    this.runStartedAt = now;
    this.lockStartedAt = null;
    this.lockResets = 0;
    this.gameOverAt = null;

    this.scorePopupValue = 0;
    this.scorePopupUntil = 0;
    this.scorePopupLabel = "";

    this.clearingAnimation = false;
    this.clearRows = [];
    this.clearSteps = [];
    this.clearStepIndex = 0;
    this.clearRunningTotal = 0;
    this.clearTotalMultiplier = 1;
    this.clearAllPrime = false;
    this.clearMultiplierLabel = "";
    this.clearStepDelay = CLEAR_STEP_DELAY;
    this.nextClearStepAt = 0;
    this.clearFinishAt = 0;

    this.numberBag = createNumberBag(this.minNumber, this.maxNumber);

    this.rotateEffectCells = [];
    this.rotateEffectUntil = 0;
    this.nextDangerFlashAt = 0;

    this.visualX = 4;
    this.visualY = 0;
    this.lastVisualUpdate = now;

    while (this.queue.length < 5) this.queue.push(this.makePiece(this.drawFromBag()));
    this.current = this.nextPiece();
    this.syncVisualToCurrent();
  }

  playSound(name) {
    if (this.sound) this.sound.play(name);
  }

  emitEvent(type, detail = {}) {
    if (this.onEvent) this.onEvent(type, detail);
  }

  makePiece(kind) {
    return { kind, number: drawFromNumberBag(this.numberBag), x: 4, y: 0, rotation: 0 };
  }

  drawFromBag() {
    if (!this.bag.length) {
      this.bag = Object.keys(SHAPES);
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop();
  }

  nextPiece() {
    const piece = this.queue.shift();
    this.queue.push(this.makePiece(this.drawFromBag()));
    piece.x = 4;
    piece.y = SPAWN_Y[piece.kind];
    piece.rotation = 0;
    this.lastMoveWasRotation = false;
    this.lastRotationKickIndex = null;
    if (!this.valid(pieceCells(piece))) {
      this.triggerGameOver(undefined, "topout");
    }
    return piece;
  }

  isPrimePiece(piece) {
    return isPrime(piece.number);
  }

  currentCells() {
    return pieceCells(this.current);
  }

  syncVisualToCurrent() {
    if (!this.current) return;
    this.visualX = this.current.x;
    this.visualY = this.current.y;
    this.lastVisualUpdate = performance.now() / 1000;
  }

  updateVisualPiece(now) {
    if (!this.current || this.clearingAnimation) {
      this.lastVisualUpdate = now;
      return;
    }
    const dt = Math.max(0, now - this.lastVisualUpdate);
    this.lastVisualUpdate = now;
    const targetX = this.current.x;
    const targetY = this.current.y;
    const factor = Math.min(1, dt * PIECE_ANIMATION_SPEED);
    this.visualX += (targetX - this.visualX) * factor;
    this.visualY += (targetY - this.visualY) * factor;
    if (Math.abs(this.visualX - targetX) < 0.01) this.visualX = targetX;
    if (Math.abs(this.visualY - targetY) < 0.01) this.visualY = targetY;
  }

  valid(cells) {
    for (const [x, y] of cells) {
      if (x < 0 || x >= COLS || y >= ROWS) return false;
      if (y >= 0 && this.board[y][x]) return false;
    }
    return true;
  }

  move(dx, dy) {
    if (this.gameOver || this.clearingAnimation) return false;
    const cells = pieceCells(this.current, this.current.x + dx, this.current.y + dy);
    if (!this.valid(cells)) return false;
    this.current.x += dx;
    this.current.y += dy;
    if (dx !== 0) {
      this.lastMoveWasRotation = false;
      this.lastRotationKickIndex = null;
    }
    if (dy > 0) {
      this.lockStartedAt = null;
      this.lockResets = 0;
    } else {
      this.resetLockDelay();
    }
    return true;
  }

  rotationKicks(oldRotation, newRotation) {
    if (this.current.kind === "O") return [[0, 0]];
    const key = `${oldRotation},${newRotation}`;
    const kicks = this.current.kind === "I" ? I_KICKS[key] : JLSTZ_KICKS[key];
    if (kicks) return kicks;
    return [[0, 0], [1, 0], [-1, 0], [0, -1], [0, 1], [2, 0], [-2, 0], [0, -2], [0, 2], [1, -1], [-1, -1], [1, 1], [-1, 1]];
  }

  rotate(direction) {
    if (this.gameOver || this.clearingAnimation) return;
    const oldRotation = this.current.rotation;
    const newRotation = ((this.current.rotation + direction) % 4 + 4) % 4;
    const kicks = this.rotationKicks(oldRotation, newRotation);
    for (let kickIndex = 0; kickIndex < kicks.length; kickIndex++) {
      const [ox, oy] = kicks[kickIndex];
      const cells = pieceCells(this.current, this.current.x + ox, this.current.y + oy, newRotation);
      if (this.valid(cells)) {
        this.current.x += ox;
        this.current.y += oy;
        this.current.rotation = newRotation;
        this.lastMoveWasRotation = true;
        this.lastRotationKickIndex = kickIndex;
        this.resetLockDelay();
        this.playSound("rotate");
        this.emitEvent("rotate");
        return;
      }
    }
  }

  touchingGround() {
    if (!this.current) return false;
    return !this.valid(pieceCells(this.current, this.current.x, this.current.y + 1));
  }

  resetLockDelay() {
    if (this.touchingGround() && this.lockResets < LOCK_RESET_LIMIT) {
      this.lockStartedAt = performance.now() / 1000;
      this.lockResets += 1;
    } else if (!this.touchingGround()) {
      this.lockStartedAt = null;
      this.lockResets = 0;
    }
  }

  hardDrop() {
    if (this.gameOver || this.clearingAnimation) return;
    let distance = 0;
    while (this.move(0, 1)) {
      distance += 1;
      // fall until blocked
    }
    this.lockStartedAt = 0;
    this.playSound("drop");
    this.emitEvent("hardDrop", { distance });
    this.lockPiece();
  }

  softDrop() {
    return this.move(0, 1);
  }

  holdPiece() {
    if (this.gameOver || this.clearingAnimation || !this.canHold) return;
    this.canHold = false;
    if (this.hold === null) {
      this.hold = this.current;
      this.current = this.nextPiece();
      this.syncVisualToCurrent();
    } else {
      [this.hold, this.current] = [this.current, this.hold];
      this.current.x = 4;
      this.current.y = SPAWN_Y[this.current.kind];
      this.current.rotation = 0;
      this.lastMoveWasRotation = false;
      this.lastRotationKickIndex = null;
      this.syncVisualToCurrent();
      if (!this.valid(pieceCells(this.current))) this.triggerGameOver(undefined, "topout");
    }
    this.playSound("hold");
    this.emitEvent("hold");
  }

  discardPiece() {
    if (this.gameOver || this.clearingAnimation) return;
    this.combo = 0;
    this.discards += 1;
    const discardScore = this.isPrimePiece(this.current) ? DISCARD_PRIME_PENALTY : DISCARD_COMPOSITE_BONUS;
    this.score += discardScore;
    this.lastClear = discardScore;
    this.showScorePopup(discardScore, "TRASH");
    this.playSound("discard");
    this.playSound(discardScore > 0 ? "good" : "bad");
    this.emitEvent("discard", { value: discardScore });
    this.lastMoveWasRotation = false;
    this.lastRotationKickIndex = null;
    this.canHold = true;
    this.current = this.nextPiece();
    this.syncVisualToCurrent();
  }

  lockPiece() {
    const [spinLabel, spinMultiplier] = this.spinResultForLock();
    for (const [x, y] of pieceCells(this.current)) {
      if (y < 0) {
        this.triggerGameOver(undefined, "topout");
        return;
      }
      this.board[y][x] = { kind: this.current.kind, number: this.current.number, prime: this.isPrimePiece(this.current) };
    }
    this.playSound("lock");
    const clearRows = this.findClearRows();
    if (spinMultiplier > 1) {
      this.playSound("rotate");
      this.rotateEffectCells = pieceCells(this.current).filter(([, y]) => y >= 0);
      this.rotateEffectUntil = performance.now() / 1000 + 0.28;
    }
    if (clearRows.length) {
      this.startClearAnimation(clearRows, spinMultiplier, spinLabel);
      return;
    }
    this.combo = 0;
    this.spawnAfterLock();
  }

  spinResultForLock() {
    if (!this.lastMoveWasRotation) return ["", 1];
    const spinKind = this.tSpinKindForLock();
    if (spinKind === "full") return ["T-SPIN", T_SPIN_SCORE_MULTIPLIER];
    if (this.immobileSpinForLock()) return [`${this.current.kind}-SPIN`, OTHER_SPIN_SCORE_MULTIPLIER];
    return ["", 1];
  }

  tSpinKindForLock() {
    if (this.current.kind !== "T" || !this.lastMoveWasRotation) return null;
    const corners = this.tSpinCornerStatus();
    const occupiedCount = Object.values(corners).filter(Boolean).length;
    if (occupiedCount < 3) return null;
    if (this.tSpinFrontCornersFilled(corners) || this.lastRotationKickIndex === 4) return "full";
    return "mini";
  }

  tSpinCornerStatus() {
    const corners = {
      up_left: [this.current.x - 1, this.current.y - 1],
      up_right: [this.current.x + 1, this.current.y - 1],
      down_left: [this.current.x - 1, this.current.y + 1],
      down_right: [this.current.x + 1, this.current.y + 1],
    };
    const status = {};
    for (const name in corners) status[name] = this.isCornerOccupied(...corners[name]);
    return status;
  }

  isCornerOccupied(x, y) {
    if (x < 0 || x >= COLS || y >= ROWS) return true;
    return y >= 0 && Boolean(this.board[y][x]);
  }

  tSpinFrontCornersFilled(corners) {
    const frontCorners = {
      0: ["up_left", "up_right"],
      1: ["up_right", "down_right"],
      2: ["down_left", "down_right"],
      3: ["up_left", "down_left"],
    }[this.current.rotation];
    return frontCorners.every((name) => corners[name]);
  }

  immobileSpinForLock() {
    if (!IMMOBILE_SPIN_KINDS.has(this.current.kind)) return false;
    return !this.valid(pieceCells(this.current, this.current.x, this.current.y - 1));
  }

  dangerLevel() {
    let topRow = null;
    for (let y = 0; y < ROWS; y++) {
      if (this.board[y].some(Boolean)) {
        topRow = y;
        break;
      }
    }
    if (topRow === null) return 0;
    if (topRow <= 1) return 2;
    if (topRow < DANGER_TOP_ROWS) return 1;
    return 0;
  }

  findClearRows() {
    const rows = [];
    for (let y = 0; y < ROWS; y++) {
      if (this.board[y].every(Boolean)) rows.push(y);
    }
    return rows;
  }

  startClearAnimation(clearRows, spinMultiplier = 1, spinLabel = "") {
    this.clearingAnimation = true;
    this.clearRows = [...clearRows].sort((a, b) => a - b);
    this.clearAllPrime = this.clearRows.length > 0
      && this.clearRows.every((y) => this.board[y].every((cell) => cell && cell.prime));
    this.clearSteps = [];
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const lineMultiplier = this.clearRows.length;
    const totalMultiplier = lineMultiplier * spinMultiplier;
    for (const y of this.clearRows) {
      for (let x = 0; x < COLS; x++) {
        const cell = this.board[y][x];
        const value = cell.prime ? PRIME_SCORE : COMPOSITE_SCORE;
        this.clearSteps.push([x, y, value]);
      }
    }
    this.clearStepIndex = 0;
    this.clearRunningTotal = 0;
    this.clearTotalMultiplier = totalMultiplier;
    const labels = [];
    if (lineMultiplier > 1) labels.push(`x${lineMultiplier}`);
    if (spinMultiplier > 1) labels.push(`${spinLabel || "SPIN"} x${spinMultiplier}`);
    this.clearMultiplierLabel = totalMultiplier > 1 ? labels.join("  ") : "";
    this.lastClear = 0;
    this.pressed.clear();
    this.moveDir = 0;
    this.canHold = false;
    this.clearStepDelay = Math.max(0.026, Math.min(CLEAR_STEP_DELAY, 0.95 / Math.max(1, this.clearSteps.length)));
    this.nextClearStepAt = performance.now() / 1000 + this.clearStepDelay;
    this.clearFinishAt = 0;
  }

  advanceClearAnimation(now) {
    if (!this.clearingAnimation) return;
    if (this.clearStepIndex < this.clearSteps.length) {
      if (now < this.nextClearStepAt) return;
      const [, , value] = this.clearSteps[this.clearStepIndex];
      this.clearStepIndex += 1;
      this.clearRunningTotal += value;
      this.lastClear = this.clearRunningTotal;
      this.playSound("count");
      this.nextClearStepAt = now + this.clearStepDelay;
      if (this.clearStepIndex === this.clearSteps.length) {
        const comboBonus = Math.max(0, this.combo - 1) * COMBO_SCORE_STEP;
        const finalTotal = this.clearRunningTotal * this.clearTotalMultiplier + comboBonus;
        this.clearRunningTotal = finalTotal;
        this.score += finalTotal;
        this.lastClear = finalTotal;
        const popupLabels = [this.clearMultiplierLabel];
        if (comboBonus > 0) popupLabels.push(`COMBO x${this.combo}  +${comboBonus}`);
        this.showScorePopup(finalTotal, popupLabels.filter(Boolean).join("  "));
        this.playSound("final");
        this.playSound(finalTotal >= 0 ? "good" : "bad");
        this.emitEvent("clearScore", {
          value: finalTotal,
          lines: this.clearRows.length,
          multiplier: this.clearTotalMultiplier,
          allPrime: this.clearAllPrime,
          combo: this.combo,
          comboBonus,
        });
        this.clearFinishAt = now + CLEAR_FINAL_DELAY;
      }
      return;
    }
    if (now >= this.clearFinishAt) this.finishClearAnimation();
  }

  finishClearAnimation() {
    this.playSound("clear");
    const cleared = this.clearRows.length;
    const kept = this.board.filter((_, y) => !this.clearRows.includes(y));
    this.board = Array.from({ length: cleared }, () => Array(COLS).fill(null)).concat(kept);
    this.lines += cleared;
    this.emitEvent("lineClear", { lines: cleared });
    this.level = this.settings.starting_level + Math.floor(this.lines / 10);
    this.clearingAnimation = false;
    this.clearRows = [];
    this.clearSteps = [];
    this.clearStepIndex = 0;
    this.clearRunningTotal = 0;
    this.clearTotalMultiplier = 1;
    this.clearAllPrime = false;
    this.clearMultiplierLabel = "";
    this.clearStepDelay = CLEAR_STEP_DELAY;
    this.clearFinishAt = 0;
    this.spawnAfterLock();
  }

  spawnAfterLock() {
    this.canHold = true;
    this.lockStartedAt = null;
    this.lockResets = 0;
    this.current = this.nextPiece();
    this.syncVisualToCurrent();
  }

  showScorePopup(value, multiplierLabel = "") {
    this.scorePopupValue = value;
    this.scorePopupLabel = multiplierLabel;
    this.scorePopupUntil = performance.now() / 1000 + CLEAR_FINAL_DELAY;
  }

  ghostCells() {
    let y = this.current.y;
    while (this.valid(pieceCells(this.current, this.current.x, y + 1))) y += 1;
    return pieceCells(this.current, this.current.x, y);
  }

  gravityDelay() {
    const elapsed = Math.max(0, performance.now() / 1000 - this.runStartedAt);
    const timePressure = elapsed * TIME_SPEEDUP_MS_PER_SECOND;
    const linePressure = this.lines * 3;
    const delayMs = 1230 - timePressure - linePressure;
    const externalSpeedMultiplier = Math.max(1, this.externalSpeedMultiplier || 1);
    return Math.max(35, Math.max(90, delayMs) / externalSpeedMultiplier) / 1000;
  }

  remainingTime(now) {
    const clock = this.gameOverAt !== null ? this.gameOverAt : now;
    return Math.max(0, GAME_TIME_LIMIT - Math.floor(clock - this.runStartedAt));
  }

  triggerGameOver(now = performance.now() / 1000, reason = "topout") {
    if (this.gameOver) return;
    this.gameOver = true;
    this.gameOverReason = reason;
    this.gameOverAt = now;
    this.emitEvent("gameOver", { reason });
  }

  advanceGravity(now) {
    if (this.move(0, 1)) {
      this.lockStartedAt = null;
      this.lockResets = 0;
    } else if (this.lockStartedAt === null) {
      this.lockStartedAt = now;
    }
  }

  applyLockDelay(now) {
    if (!this.current || this.clearingAnimation) return;
    if (!this.touchingGround()) {
      this.lockStartedAt = null;
      this.lockResets = 0;
      return;
    }
    if (this.lockStartedAt === null) {
      this.lockStartedAt = now;
      return;
    }
    if (now - this.lockStartedAt >= LOCK_DELAY) this.lockPiece();
  }

  applyHeldMovement(now) {
    let direction = 0;
    if (this.pressed.has("left")) direction -= 1;
    if (this.pressed.has("right") || this.pressed.has("d")) direction += 1;

    if (direction !== this.moveDir) {
      this.moveDir = direction;
      if (direction) {
        this.move(direction, 0);
        this.nextSideMove = now + this.settings.das_ms / 1000;
      }
    } else if (direction && now >= this.nextSideMove) {
      this.move(direction, 0);
      this.nextSideMove = now + this.settings.arr_ms / 1000;
    }

    if (this.pressed.has("down") || this.pressed.has("s")) {
      const interval = (this.settings.soft_drop_ms * SOFT_DROP_SLOWDOWN) / 1000;
      if (this.nextSoftDrop <= 0 || this.nextSoftDrop < now - interval * 4) this.nextSoftDrop = now;
      let steps = 0;
      while (now >= this.nextSoftDrop && steps < 3) {
        const moved = this.softDrop();
        this.nextSoftDrop += interval;
        steps += 1;
        if (!moved) break;
      }
    }
  }

  tick(now, settingsOpen = false) {
    this.updateVisualPiece(now);
    if (this.scorePopupUntil && now >= this.scorePopupUntil) {
      this.scorePopupValue = 0;
      this.scorePopupUntil = 0;
      this.scorePopupLabel = "";
    }
    if (this.rotateEffectCells.length && now >= this.rotateEffectUntil) {
      this.rotateEffectCells = [];
    }
    if (this.gameOver) return;
    if (this.remainingTime(now) <= 0) {
      this.triggerGameOver(now, "time");
      return;
    }
    if (this.clearingAnimation) {
      this.advanceClearAnimation(now);
      return;
    }
    if (settingsOpen) return;
    if (now - this.lastGravity >= this.gravityDelay()) {
      this.advanceGravity(now);
      this.lastGravity = now;
    }
    this.applyLockDelay(now);
    this.applyHeldMovement(now);
  }
}
