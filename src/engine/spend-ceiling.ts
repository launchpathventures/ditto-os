/**
 * Ditto — Global Daily Spend Ceiling for Front Door
 *
 * Circuit breaker that tracks cumulative front-door LLM spend per day.
 * When the ceiling is hit, all front-door chat requests get a static
 * response instead of an LLM call — preventing runaway token costs
 * from bot spam or coordinated abuse.
 *
 * Uses in-memory tracking (resets on deploy/restart, which is the safe
 * direction — undercounting spend just means the ceiling triggers later).
 *
 * Configure via FRONT_DOOR_DAILY_SPEND_LIMIT_CENTS env var.
 * Default: 1000 cents ($10/day) if not set.
 */

interface DailySpend {
  date: string; // YYYY-MM-DD
  totalCents: number;
}

let dailySpend: DailySpend = {
  date: todayKey(),
  totalCents: 0,
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getLimitCents(): number {
  const envLimit = process.env.FRONT_DOOR_DAILY_SPEND_LIMIT_CENTS;
  if (envLimit) {
    const parsed = parseInt(envLimit, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 1000; // $10/day default
}

/**
 * Check whether the daily spend ceiling has been reached.
 * Call this BEFORE making an LLM call.
 */
export function isSpendCeilingReached(): boolean {
  const today = todayKey();
  if (dailySpend.date !== today) {
    // New day — reset counter
    dailySpend = { date: today, totalCents: 0 };
  }
  return dailySpend.totalCents >= getLimitCents();
}

/**
 * Record spend from a front-door LLM call.
 * Call this AFTER an LLM call completes, with the costCents from the response.
 */
export function recordFrontDoorSpend(costCents: number): void {
  const today = todayKey();
  if (dailySpend.date !== today) {
    dailySpend = { date: today, totalCents: 0 };
  }
  dailySpend.totalCents += costCents;
}

/**
 * Get current daily spend status (for logging/monitoring).
 */
export function getSpendStatus(): { date: string; spentCents: number; limitCents: number; percentUsed: number } {
  const today = todayKey();
  if (dailySpend.date !== today) {
    dailySpend = { date: today, totalCents: 0 };
  }
  const limitCents = getLimitCents();
  return {
    date: dailySpend.date,
    spentCents: dailySpend.totalCents,
    limitCents,
    percentUsed: Math.round((dailySpend.totalCents / limitCents) * 100),
  };
}
