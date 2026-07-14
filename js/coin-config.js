import { ALLOW_TEST_NICKNAME, ENTRY_COIN_PRICE, MIN_WAGER_COINS } from "./runtime-config.js";

export const COIN_PRICE = ENTRY_COIN_PRICE;
export const MIN_WAGER_AMOUNT = MIN_WAGER_COINS;
export { ALLOW_TEST_NICKNAME };
export const PAYMENT_POLL_MS = 1500;
export const LEADERBOARD_FIRST_BONUS = 2000;

export const DIFFICULTY_SCORE_MULTIPLIERS = [0.5, 0.75, 1, 1.3, 1.8];

export const SINGLE_REWARD_TIERS = [
  { minScore: 10000, coins: 1500 },
  { minScore: 8500, coins: 1250 },
  { minScore: 7000, coins: 1000 },
  { minScore: 5500, coins: 750 },
  { minScore: 4000, coins: 500 },
  { minScore: 2500, coins: 250 },
  { minScore: 1000, coins: 100 },
];

export function scoreMultiplierForDifficulty(difficultyIndex) {
  return DIFFICULTY_SCORE_MULTIPLIERS[difficultyIndex] || 1;
}

export function finalScoreFor(rawScore, difficultyIndex) {
  return Math.round(rawScore * scoreMultiplierForDifficulty(difficultyIndex));
}

export function rewardTiersForDifficulty() {
  return SINGLE_REWARD_TIERS;
}

export function singleRewardFor(finalScore) {
  return SINGLE_REWARD_TIERS.find((tier) => finalScore >= tier.minScore)?.coins || 0;
}
