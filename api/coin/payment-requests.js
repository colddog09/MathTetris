const { json } = require("../_http");
const { naplaceFetch } = require("../_naplace");
const { supabaseAdminFetch } = require("../_supabase-admin");
const { enforceJsonRequest, enforceRateLimit, enforceSameOrigin, issueGameToken } = require("../_security");

function validAttemptId(value) {
  const id = String(value || "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

async function existingCharge(settlementKey) {
  const path = `/rest/v1/coin_settlements?select=settlement_key,student_id,amount,reason,status&settlement_key=eq.${encodeURIComponent(settlementKey)}&limit=1`;
  const response = await supabaseAdminFetch(path);
  const rows = await response.json().catch(() => []);
  if (!response.ok) throw new Error("기존 결제 처리 상태를 확인하지 못했습니다.");
  return rows[0] || null;
}

async function reserveCharge(charge) {
  const response = await supabaseAdminFetch("/rest/v1/coin_settlements", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      settlement_key: charge.settlementKey,
      student_id: charge.studentId,
      amount: charge.amount,
      reason: charge.reason,
      status: "processing",
    }),
  });
  if (response.ok) return { reserved: true };
  if (response.status !== 409) throw new Error("결제 중복 방지 원장을 생성하지 못했습니다.");
  const existing = await existingCharge(charge.settlementKey);
  const matches = existing
    && String(existing.student_id) === charge.studentId
    && Number(existing.amount) === charge.amount
    && String(existing.reason) === charge.reason;
  if (!matches) return { conflict: true };
  if (existing.status === "completed") return { completed: true };
  return { blockedStatus: existing.status || "unknown" };
}

async function updateCharge(settlementKey, changes) {
  const response = await supabaseAdminFetch(`/rest/v1/coin_settlements?settlement_key=eq.${encodeURIComponent(settlementKey)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(changes),
  });
  if (!response.ok) throw new Error("결제 원장 갱신에 실패했습니다.");
}

function approvedResponse(res, charge, duplicate = false) {
  const requestId = `direct-${charge.attemptId}`;
  return json(res, 200, {
    status: "approved",
    direct: true,
    duplicate,
    game_token: issueGameToken({
      requestId,
      studentId: charge.studentId,
      amount: charge.amount,
      purpose: charge.purpose,
      roomId: charge.roomId,
    }),
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { message: "POST만 지원합니다." });
  if (!enforceRateLimit(req, res, "payment-create", 5, 60 * 1000)) return;
  if (!enforceSameOrigin(req, res) || !enforceJsonRequest(req, res)) return;
  try {
    const { studentId, amount, purpose = "entry", roomId = "", paymentAttemptId } = req.body || {};
    const coinAmount = Number(amount);
    const attemptId = validAttemptId(paymentAttemptId);
    if (!/^\d{4}$/.test(String(studentId || ""))) return json(res, 400, { message: "올바른 4자리 학번을 입력하세요." });
    if (!attemptId) return json(res, 400, { message: "결제 시도 번호가 올바르지 않습니다." });
    if (!["entry", "wager"].includes(purpose)) return json(res, 400, { message: "결제 목적이 올바르지 않습니다." });
    const entryPrice = Number(process.env.ENTRY_COIN_PRICE ?? 0);
    const freeBetaMode = entryPrice === 0;
    const minWager = Number(process.env.MIN_WAGER_COINS || 100);
    if (purpose === "wager" && freeBetaMode && coinAmount !== 0) return json(res, 400, { message: "베타테스트 배팅은 0코인으로만 진행됩니다." });
    if (!Number.isInteger(coinAmount) || coinAmount < 0 || (purpose === "wager" && coinAmount === 0 && !freeBetaMode)) {
      return json(res, 400, { message: purpose === "wager" ? `배팅 금액은 최소 ${minWager}코인부터 정수로 입력하세요.` : "참가비가 올바르지 않습니다." });
    }
    if (purpose === "wager" && !freeBetaMode && coinAmount < minWager) {
      return json(res, 400, { message: `배팅 금액은 최소 ${minWager}코인부터 가능합니다.` });
    }
    const maxWager = Number(process.env.MAX_WAGER_COINS || 10000);
    if (purpose === "entry" && coinAmount !== entryPrice) return json(res, 400, { message: `참가비는 ${entryPrice}코인입니다.` });
    if (purpose === "wager" && (coinAmount > maxWager || !/^invite-[A-Z0-9]{6}-\d+$/.test(String(roomId)))) {
      return json(res, 400, { message: "배팅 금액 또는 방 정보가 올바르지 않습니다." });
    }

    const title = purpose === "entry" ? "PRIME STACK 게임 참가비" : `PRIME STACK 멀티 배팅 (${roomId})`;
    const charge = {
      attemptId,
      studentId: String(studentId),
      amount: coinAmount,
      purpose,
      roomId: String(roomId),
      reason: title,
      settlementKey: `charge:${purpose}:${attemptId}`,
    };
    if (charge.amount === 0 && freeBetaMode) {
      const studentResponse = await naplaceFetch(`/students/${encodeURIComponent(charge.studentId)}`);
      const studentData = await studentResponse.json().catch(() => ({}));
      if (!studentResponse.ok) return json(res, studentResponse.status, { message: studentData.message || "Naplace Coin 계정을 확인하지 못했습니다." });
      const student = studentData.student || studentData.data || studentData;
      const returnedId = String(student.id ?? student.student_id ?? "");
      if (returnedId && returnedId !== charge.studentId) return json(res, 502, { message: "Naplace Coin 계정 정보가 일치하지 않습니다." });
      return approvedResponse(res, charge);
    }

    const reservation = await reserveCharge(charge);
    if (reservation.completed) return approvedResponse(res, charge, true);
    if (reservation.conflict) return json(res, 409, { code: "payment_conflict", message: "결제 시도 정보가 이전 요청과 일치하지 않습니다." });
    if (reservation.blockedStatus) {
      return json(res, 409, {
        code: reservation.blockedStatus === "failed" ? "payment_failed" : "payment_unknown",
        message: reservation.blockedStatus === "failed"
          ? "이 결제 시도는 실패했습니다. 다시 결제 버튼을 눌러주세요."
          : "이전 결제 결과를 확인 중입니다. 중복 결제를 막기 위해 관리자 확인이 필요합니다.",
      });
    }

    let response;
    let data = {};
    try {
      response = await naplaceFetch("/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: charge.studentId, amount: charge.amount, type: "student_to_club", title }),
      });
      data = await response.json().catch(() => ({}));
    } catch {
      await updateCharge(charge.settlementKey, { status: "unknown", provider_message: "전송 결과 확인 불가" }).catch(() => {});
      return json(res, 502, { code: "payment_unknown", message: "결제 결과를 확인할 수 없습니다. 중복 결제를 막기 위해 관리자에게 문의하세요." });
    }
    if (!response.ok) {
      await updateCharge(charge.settlementKey, { status: "failed", provider_message: String(data.message || `HTTP ${response.status}`).slice(0, 300) }).catch(() => {});
      return json(res, response.status, { code: "payment_failed", message: data.message || "즉시 결제에 실패했습니다." });
    }
    await updateCharge(charge.settlementKey, {
      status: "completed",
      provider_message: String(data.message || "즉시 결제 완료").slice(0, 300),
      completed_at: new Date().toISOString(),
    });
    return approvedResponse(res, charge);
  } catch (error) {
    return json(res, 500, { message: error.message || "Naplace Coin 즉시 결제에 실패했습니다." });
  }
};
