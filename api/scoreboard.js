const { json } = require("./_http");
const { enforceJsonRequest, enforceRateLimit, enforceSameOrigin, safeString, verifyPayload } = require("./_security");
const { supabaseAdminFetch } = require("./_supabase-admin");

const LEADERBOARD_FIRST_BONUS = 2000;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { message: "POST만 지원합니다." });
  if (!enforceRateLimit(req, res, "scoreboard-write", 10, 60 * 1000)) return;
  if (!enforceSameOrigin(req, res) || !enforceJsonRequest(req, res)) return;
  try {
    const token = verifyPayload(req.body?.gameToken, "game");
    if (token.purpose !== "entry") return json(res, 403, { message: "참가 결제 토큰이 필요합니다." });
    const entry = req.body?.entry || {};
    const name = safeString(entry.name, 20);
    const difficulty = safeString(entry.difficulty, 12);
    const score = Number(entry.best_score);
    const runs = Number(entry.runs);
    const maxNumber = Number(entry.max_number);
    if (!name || !difficulty || !Number.isInteger(score) || Math.abs(score) > 250000) return json(res, 400, { message: "스코어보드 기록이 올바르지 않습니다." });
    if (String(entry.student_id) !== token.studentId || runs !== 1 || ![50, 100, 200, 300, 600].includes(maxNumber)) return json(res, 400, { message: "플레이 정보가 결제 토큰과 일치하지 않습니다." });

    const topResponse = await supabaseAdminFetch("/rest/v1/scoreboard?select=best_score&order=best_score.desc&limit=1");
    const topRows = await topResponse.json().catch(() => []);
    if (!topResponse.ok) return json(res, 502, { message: "현재 최고 기록을 확인하지 못했습니다." });
    const previousTopScore = Math.max(0, Number(topRows[0]?.best_score) || 0);
    const leaderboardBonus = score > previousTopScore ? LEADERBOARD_FIRST_BONUS : 0;
    const row = {
      scoreboard_id: token.jti,
      student_id: token.studentId,
      name,
      best_score: score,
      runs: 1,
      difficulty,
      max_number: maxNumber,
      leaderboard_bonus: leaderboardBonus,
      played_at: safeString(entry.played_at, 24) || new Date().toISOString(),
    };
    const response = await supabaseAdminFetch("/rest/v1/scoreboard", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(row),
    });
    const data = await response.json().catch(() => []);
    if (!response.ok) return json(res, response.status === 409 ? 409 : 502, { message: response.status === 409 ? "이미 저장된 게임 기록입니다." : "스코어보드 저장에 실패했습니다." });
    return json(res, 201, {
      scoreboard_id: data[0]?.scoreboard_id || row.scoreboard_id,
      leaderboard_bonus: Number(data[0]?.leaderboard_bonus ?? leaderboardBonus) || 0,
    });
  } catch (error) {
    const status = /토큰|서명|만료/.test(error.message || "") ? 401 : 500;
    return json(res, status, { message: error.message || "스코어보드 저장 중 오류가 발생했습니다." });
  }
};
