const crypto = require("crypto");
const { json } = require("./_http");
const { enforceJsonRequest, enforceRateLimit, enforceSameOrigin, safeString } = require("./_security");
const { supabaseAdminFetch } = require("./_supabase-admin");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { message: "POST만 지원합니다." });
  if (!enforceRateLimit(req, res, "scoreboard-write", 10, 60 * 1000)) return;
  if (!enforceSameOrigin(req, res) || !enforceJsonRequest(req, res)) return;
  try {
    const entry = req.body?.entry || {};
    const studentId = safeString(entry.student_id, 4);
    const name = safeString(entry.name, 20);
    const difficulty = safeString(entry.difficulty, 12);
    const score = Number(entry.best_score);
    const runs = Number(entry.runs);
    const maxNumber = Number(entry.max_number);
    if (!studentId || !name || !difficulty || !Number.isInteger(score) || Math.abs(score) > 250000) return json(res, 400, { message: "스코어보드 기록이 올바르지 않습니다." });
    if (runs !== 1 || ![50, 100, 200, 300, 600].includes(maxNumber)) return json(res, 400, { message: "플레이 정보가 올바르지 않습니다." });

    const row = {
      scoreboard_id: crypto.randomUUID(),
      student_id: studentId,
      name,
      best_score: score,
      runs: 1,
      difficulty,
      max_number: maxNumber,
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
    });
  } catch (error) {
    return json(res, 500, { message: error.message || "스코어보드 저장 중 오류가 발생했습니다." });
  }
};
