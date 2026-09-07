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
  suggestionOutput: 2_000,
} as const;

export class SponsorshipError extends Error {
  constructor(readonly code: string, message: string, readonly resetAt: string | null = null, readonly status = 429) {
    super(message);
  }
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
