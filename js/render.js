import {
  COLS, ROWS, CELL, SIDE, TOP_PAD, BOARD_X, BOARD_W, WIDTH, HEIGHT,
  COLORS_BG, COLORS, COLOR_EDGES, COLOR_LIGHTS, COLOR_SHADOWS, SHAPES,
} from "./constants.js";

function drawCell(ctx, x, y, cell, { alpha = false, showNumber = true, pixelDx = 0, pixelDy = 0 } = {}) {
  const left = BOARD_X + x * CELL + 1 + pixelDx;
  const top = TOP_PAD + y * CELL + 1 + pixelDy;
  const right = left + CELL - 2;
  const bottom = top + CELL - 2;
  if (alpha) {
    ctx.fillStyle = "rgba(203, 213, 225, 0.45)";
    ctx.fillRect(left + 3, top + 3, right - left - 6, bottom - top - 6);
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(left + 1, top + 1, right - left - 2, bottom - top - 2);
    ctx.setLineDash([]);
    return;
  }
  const kind = cell.kind || "I";
  const fill = COLORS[kind] || COLORS_BG.BLOCK_FILL;
  const edge = COLOR_EDGES[kind] || COLORS_BG.BLOCK_EDGE;
  const light = COLOR_LIGHTS[kind] || "#ffffff";
  const shadow = COLOR_SHADOWS[kind] || edge;
  const textFill = ["O", "S", "J", "L"].includes(kind) ? "#111827" : "#ffffff";
  const textShadow = textFill === "#111827" ? "#ffffff" : "#111827";

  ctx.fillStyle = edge;
  ctx.fillRect(left, top, right - left, bottom - top);
  ctx.fillStyle = fill;
  ctx.fillRect(left + 3, top + 3, right - left - 6, bottom - top - 6);

  ctx.strokeStyle = light;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(left + 4, top + 4);
  ctx.lineTo(right - 4, top + 4);
  ctx.moveTo(left + 4, top + 4);
  ctx.lineTo(left + 4, bottom - 4);
  ctx.stroke();

  ctx.strokeStyle = shadow;
  ctx.beginPath();
  ctx.moveTo(left + 4, bottom - 4);
  ctx.lineTo(right - 4, bottom - 4);
  ctx.moveTo(right - 4, top + 4);
  ctx.lineTo(right - 4, bottom - 4);
  ctx.stroke();

  const inset = Math.max(7, CELL * 0.23);
  ctx.strokeStyle = shadow;
  ctx.lineWidth = 3;
  ctx.strokeRect(left + inset, top + inset, right - left - inset * 2, bottom - top - inset * 2);
  ctx.strokeStyle = light;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left + inset + 2, top + inset + 2);
  ctx.lineTo(right - inset - 2, top + inset + 2);
  ctx.moveTo(left + inset + 2, top + inset + 2);
  ctx.lineTo(left + inset + 2, bottom - inset - 2);
  ctx.stroke();

  if (showNumber) {
    const number = String(cell.number);
    const size = number.length <= 2 ? 13 : 10;
    const tx = (left + right) / 2;
    const ty = (top + bottom) / 2 + 2;
    ctx.font = `bold ${size}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = textShadow;
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      ctx.fillText(number, tx + ox, ty + oy);
    }
    ctx.fillStyle = textFill;
    ctx.fillText(number, tx, ty);
  }
}

function drawCurrentPieceNumber(ctx, game, pixelDx, pixelDy) {
  const cells = game.currentCells().filter(([, y]) => y >= 0);
  if (!cells.length) return;
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  const cx = BOARD_X + (Math.min(...xs) + Math.max(...xs) + 1) * CELL / 2 + pixelDx;
  const cy = TOP_PAD + (Math.min(...ys) + Math.max(...ys) + 1) * CELL / 2 + pixelDy;
  const number = String(game.current.number);
  const size = number.length <= 2 ? 24 : 20;
  const kind = game.current.kind;
  const fill = ["O", "S", "J", "L"].includes(kind) ? "#111827" : "#ffffff";
  const outline = fill === "#111827" ? "#ffffff" : "#111827";
  ctx.font = `bold ${size}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = outline;
  for (const [ox, oy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, 1], [-1, 1], [1, -1]]) {
    ctx.fillText(number, cx + ox, cy + oy);
  }
  ctx.fillStyle = fill;
  ctx.fillText(number, cx, cy);
}

function drawMiniPiece(ctx, piece, ox, oy) {
  if (!piece) return;
  const coords = SHAPES[piece.kind][0];
  const xs = coords.map(([x]) => x);
  const ys = coords.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const size = 26;
  const width = (maxX - minX + 1) * size;
  const height = (maxY - minY + 1) * size;
  const startX = ox - width / 2;
  const startY = oy - height / 2;
  const kind = piece.kind;
  const fill = COLORS[kind];
  const edge = COLOR_EDGES[kind];
  const light = COLOR_LIGHTS[kind];
  const shadow = COLOR_SHADOWS[kind];
  for (const [x, y] of coords) {
    const left = startX + (x - minX) * size;
    const top = startY + (y - minY) * size;
    const right = left + size - 2;
    const bottom = top + size - 2;
    ctx.fillStyle = edge;
    ctx.fillRect(left, top, right - left, bottom - top);
    ctx.fillStyle = fill;
    ctx.fillRect(left + 2, top + 2, right - left - 4, bottom - top - 4);
    ctx.strokeStyle = light;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left + 3, top + 3);
    ctx.lineTo(right - 3, top + 3);
    ctx.moveTo(left + 3, top + 3);
    ctx.lineTo(left + 3, bottom - 3);
    ctx.stroke();
    ctx.strokeStyle = shadow;
    ctx.beginPath();
    ctx.moveTo(left + 3, bottom - 3);
    ctx.lineTo(right - 3, bottom - 3);
    ctx.moveTo(right - 3, top + 3);
    ctx.lineTo(right - 3, bottom - 3);
    ctx.stroke();
    ctx.strokeRect(left + 8, top + 8, right - left - 16, bottom - top - 16);
  }
}

function drawDangerWarning(ctx, game) {
  const danger = game.dangerLevel();
  if (!danger || game.gameOver) return;
  const now = performance.now() / 1000;
  const flash = Math.floor(now * (danger >= 2 ? 5 : 3)) % 2 === 0;
  ctx.fillStyle = flash ? "rgba(239,68,68,0.22)" : "rgba(239,68,68,0.12)";
  ctx.fillRect(BOARD_X, TOP_PAD, BOARD_W, ROWS * CELL);
  const outline = danger >= 2 ? "#dc2626" : "#f87171";
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  for (let offset = 0; offset < 3; offset++) {
    ctx.strokeRect(BOARD_X + offset * 2, TOP_PAD + offset * 2, BOARD_W - offset * 4, ROWS * CELL - offset * 4);
  }
  if (danger >= 2 && flash) {
    ctx.fillStyle = "#b91c1c";
    ctx.font = "bold 18px Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("DANGER", BOARD_X + BOARD_W / 2, TOP_PAD + 34);
  }
}

function drawPanel(ctx, game, uiInfo) {
  const leftX = 18;
  const rightX = BOARD_X + BOARD_W + 18;
  const panelW = SIDE - 36;
  const headerH = 25;

  ctx.fillStyle = COLORS_BG.PLAY_PANEL;
  ctx.fillRect(leftX, 54, panelW, 190 - 54);
  ctx.strokeStyle = COLORS_BG.PLAY_LINE;
  ctx.lineWidth = 3;
  ctx.strokeRect(leftX, 54, panelW, 190 - 54);
  ctx.fillStyle = "#e2e8f0";
  ctx.fillRect(leftX, 54, panelW, headerH);
  ctx.strokeRect(leftX, 54, panelW, headerH);
  ctx.fillStyle = COLORS_BG.PLAY_LINE;
  ctx.font = "bold 14px Helvetica, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("HOLD", leftX + 7, 67);
  drawMiniPiece(ctx, game.hold, leftX + panelW / 2, 132);

  ctx.fillStyle = COLORS_BG.PLAY_PANEL;
  ctx.fillRect(rightX, 54, panelW, 586 - 54);
  ctx.strokeStyle = COLORS_BG.PLAY_LINE;
  ctx.strokeRect(rightX, 54, panelW, 586 - 54);
  ctx.fillStyle = "#e2e8f0";
  ctx.fillRect(rightX, 54, panelW, headerH);
  ctx.strokeRect(rightX, 54, panelW, headerH);
  ctx.fillStyle = COLORS_BG.PLAY_LINE;
  ctx.fillText("NEXT", rightX + 7, 67);
  game.queue.slice(0, 5).forEach((piece, i) => drawMiniPiece(ctx, piece, rightX + panelW / 2, 128 + i * 88));

  const scoreText = String(game.score);
  const scoreSize = scoreText.length <= 5 ? 31 : scoreText.length <= 7 ? 25 : 20;
  const remaining = game.remainingTime(performance.now() / 1000);
  const timeText = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
  ctx.textAlign = "right";
  ctx.fillStyle = remaining <= 30 ? COLORS_BG.BAD : COLORS_BG.PLAY_LINE;
  ctx.font = "bold 28px Helvetica, Arial, sans-serif";
  ctx.fillText(timeText, leftX + panelW - 8, 372);
  ctx.fillStyle = COLORS_BG.PLAY_LINE;
  ctx.font = "bold 11px Helvetica, Arial, sans-serif";
  ctx.fillText("TIME", leftX + panelW - 8, 344);
  ctx.font = `bold ${scoreSize}px Helvetica, Arial, sans-serif`;
  ctx.fillText(scoreText, leftX + panelW - 8, 438);
  ctx.font = "bold 11px Helvetica, Arial, sans-serif";
  ctx.fillText("SCORE", leftX + panelW - 8, 405);
  ctx.font = "bold 28px Helvetica, Arial, sans-serif";
  ctx.fillText(String(game.lines), leftX + panelW - 8, 498);
  ctx.font = "bold 11px Helvetica, Arial, sans-serif";
  ctx.fillText("LINES", leftX + panelW - 8, 470);
  ctx.font = "bold 27px Helvetica, Arial, sans-serif";
  ctx.fillText(String(game.discards), leftX + panelW - 8, 558);
  ctx.font = "bold 11px Helvetica, Arial, sans-serif";
  ctx.fillText("TRASH", leftX + panelW - 8, 530);

  if (uiInfo.multiplayerConnected || uiInfo.remoteState) {
    const remote = uiInfo.remoteState || {};
    const remoteScore = remote.score ?? "-";
    const remoteLines = remote.lines ?? "-";
    let remoteTime = remote.time;
    remoteTime = typeof remoteTime === "number" ? `${Math.floor(remoteTime / 60)}:${String(remoteTime % 60).padStart(2, "0")}` : "-";
    const status = remote.gameOver ? "KO" : "LIVE";
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS_BG.GOOD;
    ctx.font = "bold 12px Helvetica, Arial, sans-serif";
    ctx.fillText("VS", leftX + 10, 604);
    ctx.textAlign = "right";
    ctx.fillStyle = remote.gameOver ? COLORS_BG.BAD : COLORS_BG.GOOD;
    ctx.font = "bold 11px Helvetica, Arial, sans-serif";
    ctx.fillText(status, leftX + panelW - 8, 604);
    ctx.textAlign = "left";
    ctx.fillStyle = "#64748b";
    ctx.font = "bold 9px Helvetica, Arial, sans-serif";
    ctx.fillText("OP SCORE", leftX + 10, 626);
    ctx.textAlign = "right";
    ctx.fillStyle = COLORS_BG.PLAY_LINE;
    ctx.font = "bold 11px Helvetica, Arial, sans-serif";
    ctx.fillText(String(remoteScore), leftX + panelW - 8, 626);
    ctx.textAlign = "left";
    ctx.fillStyle = "#64748b";
    ctx.font = "bold 9px Helvetica, Arial, sans-serif";
    ctx.fillText(`LINES ${remoteLines}`, leftX + 10, 646);
    ctx.textAlign = "right";
    ctx.fillStyle = COLORS_BG.PLAY_LINE;
    ctx.font = "bold 10px Helvetica, Arial, sans-serif";
    ctx.fillText(String(remoteTime), leftX + panelW - 8, 646);
  }

  const infoTop = HEIGHT - 192;
  ctx.fillStyle = COLORS_BG.PLAY_PANEL;
  ctx.fillRect(rightX, infoTop, panelW, 172);
  ctx.strokeStyle = COLORS_BG.PLAY_LINE;
  ctx.strokeRect(rightX, infoTop, panelW, 172);
  ctx.fillStyle = "#e2e8f0";
  ctx.fillRect(rightX, infoTop, panelW, 34);
  ctx.strokeRect(rightX, infoTop, panelW, 34);
  ctx.textAlign = "left";
  ctx.fillStyle = COLORS_BG.PLAY_LINE;
  ctx.font = "bold 16px Helvetica, Arial, sans-serif";
  ctx.fillText("PLACEMENT", rightX + 10, infoTop + 18);
  const best = uiInfo.bestSessionScore === null ? "-" : uiInfo.bestSessionScore;
  const speed = `${Math.round(game.gravityDelay() * 1000)}ms`;
  const rows = [
    ["RUN", `${uiInfo.runNumber}/${uiInfo.totalRuns}`],
    ["MODE", `${uiInfo.difficultyLabel} 0~${uiInfo.maxNumber}`],
    ["BEST", best],
    ["LEVEL", game.level],
    ["SPEED", speed],
    ["LAST", `${game.lastClear >= 0 ? "+" : ""}${game.lastClear}`],
  ];
  rows.forEach(([label, value], index) => {
    const y = infoTop + 52 + index * 19;
    const valueFill = label === "LAST" ? (game.lastClear >= 0 ? COLORS_BG.GOOD : COLORS_BG.BAD) : COLORS_BG.PLAY_LINE;
    ctx.fillStyle = "#64748b";
    ctx.font = "bold 11px Helvetica, Arial, sans-serif";
    ctx.fillText(label, rightX + 12, y);
    ctx.fillStyle = valueFill;
    ctx.fillText(String(value), rightX + 82, y);
  });
  ctx.textAlign = "center";
  ctx.fillStyle = COLORS_BG.PLAY_LINE;
  ctx.font = "bold 11px Helvetica, Arial, sans-serif";
  ctx.fillText("소수만을 쌓아라!", WIDTH / 2, 9);
}

function drawScorePopup(ctx, game) {
  const now = performance.now() / 1000;
  if (!game.scorePopupUntil || now >= game.scorePopupUntil) return;
  const value = game.scorePopupValue;
  const fill = value > 0 ? COLORS_BG.GOOD : value < 0 ? COLORS_BG.BAD : COLORS_BG.MUTED;
  const text = `${value >= 0 ? "+" : ""}${value}`;
  const cx = BOARD_X + COLS * CELL / 2;
  const cy = TOP_PAD + ROWS * CELL / 2;
  const flashOn = Math.floor(now * 6) % 2 === 0;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (game.scorePopupLabel) {
    ctx.font = "bold 28px Helvetica, Arial, sans-serif";
    ctx.fillStyle = "#111827";
    ctx.fillText(game.scorePopupLabel, cx + 2, cy - 64);
    ctx.fillStyle = flashOn ? "#fde047" : "#a855f7";
    ctx.fillText(game.scorePopupLabel, cx, cy - 66);
  }
  ctx.font = "bold 70px Helvetica, Arial, sans-serif";
  ctx.fillStyle = flashOn ? "#ffffff" : "#fde68a";
  ctx.fillText(text, cx + 4, cy + 4);
  ctx.fillStyle = fill;
  ctx.fillText(text, cx, cy);
}

function drawRotateEffect(ctx, game) {
  const now = performance.now() / 1000;
  if (!game.rotateEffectCells.length || now >= game.rotateEffectUntil) return;
  const remaining = Math.max(0, game.rotateEffectUntil - now);
  const progress = 1 - remaining / 0.16;
  const inset = 1 + progress * 5;
  ctx.strokeStyle = Math.floor(now * 30) % 2 === 0 ? "#f59e0b" : "#fde047";
  ctx.lineWidth = 2;
  for (const [x, y] of game.rotateEffectCells) {
    ctx.strokeRect(BOARD_X + x * CELL + inset, TOP_PAD + y * CELL + inset, CELL - inset * 2, CELL - inset * 2);
  }
}

function drawClearAnimation(ctx, game) {
  if (!game.clearingAnimation) return;
  const processed = game.clearSteps.slice(0, game.clearStepIndex);
  const current = game.clearStepIndex < game.clearSteps.length ? game.clearSteps[game.clearStepIndex] : null;
  ctx.textAlign = "center";
  for (const [x, y, value] of processed) {
    const left = BOARD_X + x * CELL + 2;
    const top = TOP_PAD + y * CELL + 2;
    const w = CELL - 4;
    const fill = value > 0 ? COLORS_BG.GOOD : COLORS_BG.BAD;
    ctx.strokeStyle = fill;
    ctx.lineWidth = 3;
    ctx.strokeRect(left, top, w, w);
    ctx.fillStyle = fill;
    ctx.font = "bold 7px Helvetica, Arial, sans-serif";
    ctx.fillText(`${value >= 0 ? "+" : ""}${value}`, left + w / 2, top + w - 7);
  }
  if (current) {
    const [x, y] = current;
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 4;
    ctx.strokeRect(BOARD_X + x * CELL + 1, TOP_PAD + y * CELL + 1, CELL - 2, CELL - 2);
  }
  const cx = BOARD_X + COLS * CELL / 2;
  ctx.fillStyle = "#fffdf5";
  ctx.fillRect(cx - 76, TOP_PAD + 36, 152, 46);
  ctx.strokeStyle = "#facc15";
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - 76, TOP_PAD + 36, 152, 46);
  ctx.fillStyle = COLORS_BG.MUTED;
  ctx.font = "bold 9px Helvetica, Arial, sans-serif";
  ctx.fillText("COUNTING", cx, TOP_PAD + 53);
  ctx.fillStyle = game.clearRunningTotal >= 0 ? COLORS_BG.GOOD : COLORS_BG.BAD;
  ctx.font = "bold 17px Helvetica, Arial, sans-serif";
  ctx.fillText(`${game.clearRunningTotal >= 0 ? "+" : ""}${game.clearRunningTotal}`, cx, TOP_PAD + 72);
}

export function drawGameOverButtons(ctx, game, uiInfo) {
  const buttons = uiInfo.runNumber < uiInfo.totalRuns
    ? [["다음 판", "next"], ["스코어보드", "finish"]]
    : [["스코어보드", "finish"]];
  const cx = BOARD_X + BOARD_W / 2;
  const y = 336;
  const totalWidth = buttons.length * 112 + (buttons.length - 1) * 12;
  const startX = cx - totalWidth / 2;
  const rects = [];
  buttons.forEach(([label, action], index) => {
    const left = startX + index * 124;
    const top = y;
    const right = left + 112;
    const bottom = y + 38;
    ctx.fillStyle = "#cbd5e1";
    ctx.fillRect(left + 2, top + 2, right - left, bottom - top);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(left, top, right - left, bottom - top);
    ctx.strokeStyle = COLORS_BG.PLAY_LINE;
    ctx.lineWidth = 2;
    ctx.strokeRect(left, top, right - left, bottom - top);
    ctx.fillStyle = COLORS_BG.PLAY_LINE;
    ctx.font = "bold 12px Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, (left + right) / 2, (top + bottom) / 2);
    rects.push({ left, top, right, bottom, action });
  });
  return rects;
}

export function drawSettingsOverlay(ctx, settings, settingsIndex, settingRows) {
  ctx.fillStyle = "#fffdf5";
  ctx.fillRect(28, 118, WIDTH - 56, 492 - 118);
  ctx.strokeStyle = "#f59e0b";
  ctx.lineWidth = 2;
  ctx.strokeRect(28, 118, WIDTH - 56, 492 - 118);
  ctx.fillStyle = COLORS_BG.TEXT;
  ctx.font = "bold 24px Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("SETTINGS", WIDTH / 2, 154);
  ctx.fillStyle = COLORS_BG.MUTED;
  ctx.font = "bold 11px Helvetica, Arial, sans-serif";
  ctx.fillText("Up/Down select   Left/Right adjust   F1 close", WIDTH / 2, 184);
  let y = 232;
  for (let i = 0; i < settingRows.length; i++) {
    const [key, label, desc, , , , suffix] = settingRows[i];
    const selected = i === settingsIndex;
    ctx.fillStyle = selected ? "#dbeafe" : "#fff7ed";
    ctx.fillRect(58, y - 24, WIDTH - 116, 50);
    ctx.strokeStyle = selected ? "#2563eb" : "#fdba74";
    ctx.lineWidth = 2;
    ctx.strokeRect(58, y - 24, WIDTH - 116, 50);
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS_BG.TEXT;
    ctx.font = "bold 15px Helvetica, Arial, sans-serif";
    ctx.fillText(label, 80, y);
    ctx.fillStyle = selected ? COLORS_BG.TEXT : COLORS_BG.MUTED;
    ctx.font = "bold 11px Helvetica, Arial, sans-serif";
    ctx.fillText(desc, 168, y);
    ctx.textAlign = "right";
    ctx.fillStyle = COLORS_BG.TEXT;
    ctx.font = "bold 16px Helvetica, Arial, sans-serif";
    ctx.fillText(`${settings[key]}${suffix}`, WIDTH - 82, y);
    y += 62;
  }
}

export function renderGame(ctx, game, uiInfo) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = COLORS_BG.PLAY_BG;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#f8fbff";
  ctx.fillRect(BOARD_X, TOP_PAD, BOARD_W, ROWS * CELL);
  ctx.strokeStyle = COLORS_BG.PLAY_GRID;
  ctx.lineWidth = 1;
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(BOARD_X + x * CELL, TOP_PAD);
    ctx.lineTo(BOARD_X + x * CELL, TOP_PAD + ROWS * CELL);
    ctx.stroke();
  }
  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(BOARD_X, TOP_PAD + y * CELL);
    ctx.lineTo(BOARD_X + BOARD_W, TOP_PAD + y * CELL);
    ctx.stroke();
  }

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const cell = game.board[y][x];
      if (cell) drawCell(ctx, x, y, cell);
    }
  }

  if (!game.gameOver && !game.clearingAnimation && game.current) {
    const currentCell = { kind: game.current.kind, number: game.current.number, prime: game.isPrimePiece(game.current) };
    for (const [x, y] of game.ghostCells()) {
      if (y >= 0) drawCell(ctx, x, y, currentCell, { alpha: true });
    }
    const pixelDx = (game.visualX - game.current.x) * CELL;
    const pixelDy = (game.visualY - game.current.y) * CELL;
    for (const [x, y] of game.currentCells()) {
      if (y >= 0) drawCell(ctx, x, y, currentCell, { pixelDx, pixelDy });
    }
    drawCurrentPieceNumber(ctx, game, pixelDx, pixelDy);
  }

  drawDangerWarning(ctx, game);
  drawPanel(ctx, game, uiInfo);
  ctx.strokeStyle = COLORS_BG.PLAY_LINE;
  ctx.lineWidth = 3;
  ctx.strokeRect(BOARD_X, TOP_PAD, BOARD_W, ROWS * CELL);
  ctx.fillStyle = COLORS_BG.PLAY_LINE;
  ctx.font = "bold 12px Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("PRIME STACK", BOARD_X + BOARD_W / 2, HEIGHT - 11);
  drawRotateEffect(ctx, game);
  drawClearAnimation(ctx, game);
  drawScorePopup(ctx, game);

  let gameOverRects = [];
  if (uiInfo.settingsOpen) {
    drawSettingsOverlay(ctx, game.settings, uiInfo.settingsIndex, uiInfo.settingRows);
  } else if (game.gameOver) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(BOARD_X + 34, 250, BOARD_W - 68, 140);
    ctx.strokeStyle = COLORS_BG.PLAY_LINE;
    ctx.lineWidth = 2;
    ctx.strokeRect(BOARD_X + 34, 250, BOARD_W - 68, 140);
    ctx.fillStyle = COLORS_BG.PLAY_LINE;
    ctx.font = "bold 24px Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("GAME OVER", BOARD_X + BOARD_W / 2, 292);
    gameOverRects = drawGameOverButtons(ctx, game, uiInfo);
  }
  return { gameOverRects };
}

const OPP_WIDTH = 300;
const OPP_HEIGHT = 620;
const OPP_BOARD_X = 10;
const OPP_BOARD_Y = 40;
const OPP_CELL = 28;

function drawOpponentCell(ctx, x, y, cell) {
  const left = OPP_BOARD_X + x * OPP_CELL + 1;
  const top = OPP_BOARD_Y + y * OPP_CELL + 1;
  const w = OPP_CELL - 2;
  const fill = COLORS[cell.kind] || COLORS_BG.BLOCK_FILL;
  const edge = COLOR_EDGES[cell.kind] || COLORS_BG.BLOCK_EDGE;
  const textFill = ["O", "S", "J", "L"].includes(cell.kind) ? "#111827" : "#ffffff";
  ctx.fillStyle = edge;
  ctx.fillRect(left, top, w, w);
  ctx.fillStyle = fill;
  ctx.fillRect(left + 2, top + 2, w - 4, w - 4);
  ctx.fillStyle = textFill;
  ctx.font = "bold 9px Helvetica, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(cell.number), left + w / 2, top + w / 2);
}

export function renderOpponentBoard(ctx, remote) {
  ctx.clearRect(0, 0, OPP_WIDTH, OPP_HEIGHT);
  ctx.fillStyle = "#f8fbff";
  ctx.fillRect(0, 0, OPP_WIDTH, OPP_HEIGHT);

  if (!remote || !remote.board) {
    ctx.fillStyle = COLORS_BG.MUTED;
    ctx.font = "bold 13px Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("연결 대기 중...", OPP_WIDTH / 2, OPP_HEIGHT / 2);
    return;
  }

  ctx.textAlign = "left";
  ctx.fillStyle = COLORS_BG.PLAY_LINE;
  ctx.font = "bold 12px Helvetica, Arial, sans-serif";
  ctx.fillText(`SCORE ${remote.score ?? 0}`, OPP_BOARD_X, 18);
  ctx.textAlign = "right";
  ctx.fillStyle = remote.gameOver ? COLORS_BG.BAD : COLORS_BG.GOOD;
  ctx.fillText(remote.gameOver ? "KO" : "LIVE", OPP_BOARD_X + COLS * OPP_CELL, 18);

  ctx.strokeStyle = COLORS_BG.PLAY_GRID;
  ctx.lineWidth = 1;
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(OPP_BOARD_X + x * OPP_CELL, OPP_BOARD_Y);
    ctx.lineTo(OPP_BOARD_X + x * OPP_CELL, OPP_BOARD_Y + ROWS * OPP_CELL);
    ctx.stroke();
  }
  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(OPP_BOARD_X, OPP_BOARD_Y + y * OPP_CELL);
    ctx.lineTo(OPP_BOARD_X + COLS * OPP_CELL, OPP_BOARD_Y + y * OPP_CELL);
    ctx.stroke();
  }

  for (let y = 0; y < ROWS; y++) {
    const row = remote.board[y];
    if (!row) continue;
    for (let x = 0; x < COLS; x++) {
      const cell = row[x];
      if (cell) drawOpponentCell(ctx, x, y, cell);
    }
  }

  if (remote.piece && !remote.gameOver) {
    for (const [x, y] of remote.piece.cells) {
      if (y >= 0) drawOpponentCell(ctx, x, y, remote.piece);
    }
  }

  ctx.strokeStyle = COLORS_BG.PLAY_LINE;
  ctx.lineWidth = 2;
  ctx.strokeRect(OPP_BOARD_X, OPP_BOARD_Y, COLS * OPP_CELL, ROWS * OPP_CELL);

  if (remote.gameOver) {
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillRect(OPP_BOARD_X, OPP_BOARD_Y, COLS * OPP_CELL, ROWS * OPP_CELL);
    ctx.fillStyle = COLORS_BG.BAD;
    ctx.font = "bold 16px Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("GAME OVER", OPP_BOARD_X + (COLS * OPP_CELL) / 2, OPP_BOARD_Y + (ROWS * OPP_CELL) / 2);
  }
}
