/**
 * Rate limiting for authentication attempts.
 *
 * IN-PROCESS AND DELIBERATELY SO — with a stated limitation.
 *
 * This counter lives in the memory of one server instance. Behind two or more
 * instances an attacker gets the allowance once per instance, and a restart
 * clears it entirely. For a single-school pilot on one instance that is a real
 * defence against credential stuffing; at scale it is not, and the deployment
 * guide says so rather than leaving somebody to discover it.
 *
 * The alternative — a shared store — is a deployment dependency this MVP does
 * not otherwise need. Adding one for a pilot would be the wrong trade; pretending
 * the in-process version scales would be worse.
 */

interface Attempt {
  count: number;
  firstAt: number;
  blockedUntil: number | null;
}

const attempts = new Map<string, Attempt>();

/** Sliding window. Deliberately generous: a teacher mistyping is not an attack. */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const BLOCK_MS = 15 * 60 * 1000;

/** Keeps the map from growing without bound on a long-running instance. */
function sweep(now: number) {
  if (attempts.size < 1000) return;
  for (const [key, a] of attempts) {
    if (now - a.firstAt > WINDOW_MS && (a.blockedUntil ?? 0) < now) attempts.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
}

export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = attempts.get(key);

  if (existing?.blockedUntil && existing.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((existing.blockedUntil - now) / 1000),
      remaining: 0,
    };
  }

  if (!existing || now - existing.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now, blockedUntil: null });
    return { allowed: true, retryAfterSeconds: 0, remaining: MAX_ATTEMPTS - 1 };
  }

  existing.count += 1;
  if (existing.count > MAX_ATTEMPTS) {
    existing.blockedUntil = now + BLOCK_MS;
    return { allowed: false, retryAfterSeconds: Math.ceil(BLOCK_MS / 1000), remaining: 0 };
  }

  return { allowed: true, retryAfterSeconds: 0, remaining: MAX_ATTEMPTS - existing.count };
}

/** Called after a successful sign-in, so one good login clears the count. */
export function clearRateLimit(key: string) {
  attempts.delete(key);
}

/** Only for tests. */
export function resetAllRateLimits() {
  attempts.clear();
}
