export interface SponsoredAvailability {
  enabled: boolean;
  available: boolean;
  remainingToday: number;
  resetAt: string | null;
  reason: "disabled" | "unavailable" | "daily_limit" | "monthly_limit" | "resetting" | null;
}

export const NO_SPONSORSHIP: SponsoredAvailability = {
  enabled: false, available: false, remainingToday: 0, resetAt: null, reason: "disabled",
};

export interface Suggestion { label: string; prompt: string }
