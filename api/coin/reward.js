const { json } = require("../_http");
const { naplaceFetch } = require("../_naplace");
const { enforceJsonRequest, enforceRateLimit, enforceSameOrigin, verifyPayload } = require("../_security");
const { supabaseAdminFetch } = require("../_supabase-admin");

const mockCompleted = new Map();
const SINGLE_REWARD_TIERS = [
  { minScore: 10000, coins: 2000 },
  { minScore: 8500, coins: 1500 },
  { minScore: 7000, coins: 1000 },
  { minScore: 5500, coins: 750 },
  { minScore: 4000, coins: 500 },
  { minScore: 2500, coins: 250 },
  { minScore: 1000, coins: 100 },
];

function singleCoins(finalScore) {
  return SINGLE_REWARD_TIERS.find((tier) => finalScore >= tier.minScore)?.coins || 0;
}

function checkedGameToken(token, purpose) {
  const payload = verifyPayload(token, "game");
  if (payload.purpose !== purpose) throw new Error("결제 토큰의 용도가 올바르지 않습니다.");
  if (!/^\d{4}$/.test(payload.studentId || "")) throw new Error("결제 토큰의 학번이 올바르지 않습니다.");
  return payload;
}

async function singleSettlement(body, realRewards) {
  const player = checkedGameToken(body.gameToken, "entry");
  let finalScore;
  let leaderboardBonus = 0;

  if (realRewards) {
    const query = `/rest/v1/scoreboard?select=student_id,best_score,leaderboard_bonus&scoreboard_id=eq.${encodeURIComponent(player.jti)}&limit=1`;
    const response = await supabaseAdminFetch(query);
    const rows = await response.json().catch(() => []);
    if (!response.ok) throw new Error("저장된 게임 점수를 확인하지 못했습니다.");
    const row = rows[0];
    if (!row || String(row.student_id) !== player.studentId) throw new Error("정산할 스코어보드 기록을 찾지 못했습니다.");
    finalScore = Number(row.best_score);
    leaderboardBonus = Number(row.leaderboard_bonus) === 3000 ? 3000 : 0;
  } else {
    finalScore = Number(body.finalScore);
  }

  if (!Number.isInteger(finalScore) || finalScore < -250000 || finalScore > 250000) throw new Error("최종 점수가 허용 범위를 벗어났습니다.");
  return {
    studentId: player.studentId,
    amount: singleCoins(finalScore) + leaderboardBonus,
    reason: `PRIME STACK 싱글 보상 (${finalScore}점)${leaderboardBonus ? " + 1위 보너스" : ""}`,
    settlementKey: `single:${player.jti}`,
  };
}

function multiplayerSettlement(body) {
  const rewardType = String(body.rewardType || "");
  if (["multi_win", "multi_draw"].includes(rewardType)) {
    const player = checkedGameToken(body.gameToken, "wager");
    const opponent = checkedGameToken(body.opponentGameToken, "wager");
    if (!player.roomId || player.roomId !== opponent.roomId || player.studentId === opponent.studentId) throw new Error("대전 결제 토큰이 서로 일치하지 않습니다.");
    const pairKey = [player.jti, opponent.jti].sort().join(":");
    return {
      studentId: player.studentId,
      amount: rewardType === "multi_win" ? Number(player.amount) + Number(opponent.amount) : Number(player.amount),
      reason: rewardType === "multi_win" ? `PRIME STACK 멀티 승리 보상 (${player.roomId})` : `PRIME STACK 멀티 무승부 환불 (${player.roomId})`,
      settlementKey: rewardType === "multi_win" ? `match:${pairKey}:winner` : `match:${pairKey}:draw:${player.studentId}`,
    };
  }
  if (rewardType === "disconnect_refund") {
    const player = checkedGameToken(body.gameToken, "wager");
    return {
      studentId: player.studentId,
      amount: Number(player.amount),
      reason: `PRIME STACK 시작 전 연결 종료 환불 (${player.roomId})`,
      settlementKey: `match:${player.jti}:disconnect-refund`,
    };
  }
  throw new Error("지원하지 않는 정산 종류입니다.");
}

async function existingSettlement(settlementKey) {
  const path = `/rest/v1/coin_settlements?select=settlement_key,student_id,amount,reason,status&settlement_key=eq.${encodeURIComponent(settlementKey)}&limit=1`;
  const response = await supabaseAdminFetch(path);
  const rows = await response.json().catch(() => []);
  if (!response.ok) throw new Error("기존 정산 상태를 확인하지 못했습니다.");
  return rows[0] || null;
}

async function reserveSettlement(settlement) {
  const response = await supabaseAdminFetch("/rest/v1/coin_settlements", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      settlement_key: settlement.settlementKey,
      student_id: settlement.studentId,
      amount: settlement.amount,
      reason: settlement.reason,
      status: "processing",
    }),
  });
  if (response.ok) return { reserved: true };
  if (response.status !== 409) throw new Error("코인 정산 원장을 생성하지 못했습니다.");
  const existing = await existingSettlement(settlement.settlementKey);
  if (existing?.status === "completed") return { reserved: false, completed: existing };
  const error = new Error("이미 처리 중이거나 확인이 필요한 정산입니다. 관리자에게 문의하세요.");
  error.statusCode = 409;
  throw error;
}

async function updateSettlement(settlementKey, changes) {
  const response = await supabaseAdminFetch(`/rest/v1/coin_settlements?settlement_key=eq.${encodeURIComponent(settlementKey)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(changes),
  });
  if (!response.ok) throw new Error("코인 정산 원장 갱신에 실패했습니다.");
}

async function transferRealCoins(settlement) {
  const reservation = await reserveSettlement(settlement);
  if (!reservation.reserved) {
    return { success: true, duplicate: true, amount: Number(reservation.completed.amount) || 0, message: "이미 지급 완료된 보상입니다." };
  }

  let response;
  let data = {};
  try {
    response = await naplaceFetch("/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: settlement.studentId,
        amount: settlement.amount,
        type: "club_to_student",
        title: settlement.reason,
      }),
    });
    data = await response.json().catch(() => ({}));
  } catch (error) {
    await updateSettlement(settlement.settlementKey, { status: "unknown", provider_message: "전송 결과 확인 불가" }).catch(() => {});
    const wrapped = new Error("코인 서버 응답을 확인할 수 없습니다. 자동 재시도하지 말고 관리자에게 문의하세요.");
    wrapped.statusCode = 502;
    throw wrapped;
  }

  if (!response.ok) {
    await updateSettlement(settlement.settlementKey, { status: "failed", provider_message: String(data.message || `HTTP ${response.status}`).slice(0, 300) }).catch(() => {});
    const error = new Error(data.message || "실제 코인 지급이 거절되었습니다.");
    error.statusCode = 502;
    throw error;
  }

  let ledgerWarning = false;
  try {
    await updateSettlement(settlement.settlementKey, {
      status: "completed",
      provider_message: String(data.message || "지급 완료").slice(0, 300),
      completed_at: new Date().toISOString(),
    });
  } catch {
    ledgerWarning = true;
  }
  return {
    success: true,
    amount: settlement.amount,
    message: ledgerWarning ? "코인은 지급됐지만 원장 확인이 필요합니다. 다시 요청하지 마세요." : "실제 코인 지급이 완료되었습니다.",
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { message: "POST만 지원합니다." });
  if (!enforceRateLimit(req, res, "reward", 20, 60 * 1000)) return;
  if (!enforceSameOrigin(req, res) || !enforceJsonRequest(req, res)) return;
  try {
    const body = req.body || {};
    const rewardType = String(body.rewardType || "");
    const realRewards = process.env.ALLOW_REAL_REWARDS === "true";
    if (realRewards && rewardType === "disconnect_refund") {
      return json(res, 503, { message: "시작 전 자동 환불은 중복 정산 방지를 위해 관리자 확인이 필요합니다." });
    }
    const settlement = rewardType === "single"
      ? await singleSettlement(body, realRewards)
      : multiplayerSettlement(body);
    if (!Number.isInteger(settlement.amount) || settlement.amount < 0 || settlement.amount > 50000) {
      return json(res, 400, { message: "정산 금액이 허용 범위를 벗어났습니다." });
    }
    if (settlement.amount === 0) return json(res, 200, { success: true, amount: 0, message: "지급할 코인이 없습니다." });

    if (realRewards) {
      const result = await transferRealCoins(settlement);
      return json(res, 200, { ...result, studentId: settlement.studentId, reason: settlement.reason });
    }

    if (mockCompleted.has(settlement.settlementKey)) return json(res, 200, mockCompleted.get(settlement.settlementKey));
    const result = { success: true, mock: true, ...settlement, message: "검증된 테스트 정산 (실제 코인 지급 없음)" };
    if (mockCompleted.size > 5000) mockCompleted.clear();
    mockCompleted.set(settlement.settlementKey, result);
    return json(res, 200, result);
  } catch (error) {
    const status = error.statusCode || (/토큰|서명|만료/.test(error.message || "") ? 401 : 400);
    return json(res, status, { message: error.message || "정산 요청이 올바르지 않습니다." });
  }
};

module.exports._test = { singleCoins };
