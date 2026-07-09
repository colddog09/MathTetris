import { PRIME_CHANCE, EVEN_COMPOSITE_WEIGHT, FIVE_COMPOSITE_WEIGHT, THREE_COMPOSITE_WEIGHT } from "./constants.js";

export function isPrime(number) {
  if (number < 2) return false;
  if (number === 2) return true;
  if (number % 2 === 0) return false;
  const limit = Math.floor(Math.sqrt(number)) + 1;
  for (let divisor = 3; divisor < limit; divisor += 2) {
    if (number % divisor === 0) return false;
  }
  return true;
}

const poolCache = new Map();

function numberPools(maxNumber) {
  if (poolCache.has(maxNumber)) return poolCache.get(maxNumber);
  const primes = [];
  const composites = [];
  for (let number = 2; number <= maxNumber; number++) {
    (isPrime(number) ? primes : composites).push(number);
  }
  const pools = { primes, composites };
  poolCache.set(maxNumber, pools);
  return pools;
}

function compositeWeight(number) {
  if (number % 2 === 0) return EVEN_COMPOSITE_WEIGHT;
  if (number % 5 === 0) return FIVE_COMPOSITE_WEIGHT;
  if (number % 3 === 0) return THREE_COMPOSITE_WEIGHT;
  return 1.0;
}

function weightedCompositeChoice(composites) {
  const weights = composites.map(compositeWeight);
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < composites.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return composites[i];
  }
  return composites[composites.length - 1];
}

export function randomTileNumber(maxNumber) {
  const { primes, composites } = numberPools(maxNumber);
  if (primes.length && (!composites.length || Math.random() < PRIME_CHANCE)) {
    return primes[Math.floor(Math.random() * primes.length)];
  }
  return weightedCompositeChoice(composites);
}
