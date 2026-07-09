const SADA_API_BASE = "https://api.sada.ai.kr";
export const HOUSE_ID = "2218";

// 점수 1점당 지급 코인 배율 - 필요할 때 이 값만 바꾸면 됨
export const SCORE_TO_COIN_RATIO = 1;

export async function getBalance(studentId) {
  const res = await fetch(`${SADA_API_BASE}/users/${studentId}/balance`);
  if (!res.ok) throw new Error(`balance lookup failed: ${res.status}`);
  const data = await res.json();
  return data.balance;
}

export async function transfer(senderId, receiverId, amount, title) {
  const res = await fetch(`${SADA_API_BASE}/transfer_id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sender_id: String(senderId),
      receiver_id: String(receiverId),
      amount,
      title,
    }),
  });
  if (!res.ok) throw new Error(`transfer failed: ${res.status}`);
  return res.json().catch(() => null);
}

export function scoreToCoin(score) {
  return Math.max(0, Math.floor(score * SCORE_TO_COIN_RATIO));
}

export async function payoutScore(studentId, studentName, score) {
  const coin = scoreToCoin(score);
  if (coin <= 0) return { coin: 0, paid: false };
  await transfer(HOUSE_ID, studentId, coin, `MathTetris ${studentName}(${studentId}) 점수 보상 ${coin}코인`);
  return { coin, paid: true };
}
