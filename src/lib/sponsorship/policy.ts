/** Integer microdollars keep reservations exact. Public callers cannot override these. */
export const POLICY = {
  timezone: "America/Los_Angeles",
  monthly: 10_000_000,
  floorsMonthly: 9_500_000,
  suggestionsMonthly: 500_000,
  dailyAttempts: 4,
  floorReservation: 600_000,
  suggestionReservation: 20_000,
  imageCeiling: 200_000,
  specModel: "claude-sonnet-5",
  suggestionModel: "claude-haiku-4-5-20251001",
  imageModel: "fal-ai/nano-banana-pro/edit",
  specInput: 20_000,
  specOutput: 16_000,
  suggestionInput: 8_000,
  suggestionOutput: 2_400,
} as const;

export class SponsorshipError extends Error {
  constructor(readonly code: string, message: string, readonly resetAt: string | null = null, readonly status = 429) {
    super(message);
  }
}

/** Public budgets accrue by calendar day; unused daily credit carries within
 * the month. Legacy sponsorship keeps its original fixed allowance. */
export function publicBudget(now = new Date()) {
  if (process.env.PUBLIC_GENERATION !== "true") return {
    monthly: POLICY.monthly, floors: POLICY.floorsMonthly, suggestions: POLICY.suggestionsMonthly, accrued: POLICY.monthly,
  };
  const value = process.env.PUBLIC_MONTHLY_BUDGET_USD ?? "10";
  if (!/^\d+(\.\d{1,2})?$/.test(value) || !Number.isSafeInteger(Math.round(Number(value) * 1_000_000))) {
    throw new SponsorshipError("unavailable", "The public budget configuration is invalid.", null, 503);
  }
  const monthly = Math.round(Number(value) * 1_000_000);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: POLICY.timezone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now).map((part) => [part.type, part.value]));
  const days = new Date(Date.UTC(Number(parts.year), Number(parts.month), 0)).getUTCDate();
  const suggestions = Math.floor(monthly * 0.05);
  return { monthly, floors: monthly - suggestions, suggestions, accrued: Math.floor(monthly * Number(parts.day) / days) };
}

export interface Funding {
  id: string;
  deadline: number;
  cost: number;
  /** False until the interpreter returns an authoritative usage record. */
  certain: boolean;
}

export function assertBeforeDeadline(funding: Funding) {
  if (Date.now() >= funding.deadline) throw new SponsorshipError("resetting", "The sponsored allowance is resetting. Please try again shortly.");
}
