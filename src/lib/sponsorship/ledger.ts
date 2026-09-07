import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { ensureSchema, pool } from "@/lib/db/client";
import { listFloors, reserveFloor } from "@/lib/db/floors";
import { POLICY, SponsorshipError, type Funding } from "./policy";
import type { SponsoredAvailability } from "./types";

export async function locked<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  await ensureSchema();
  const client = await pool().connect();
  try {
    await client.query("begin");
    await client.query("set local statement_timeout = '5s'");
    await client.query("select pg_advisory_xact_lock(hashtext('nextfloor:sponsorship'))");
    const result = await run(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally { client.release(); }
}

export async function allowance(client: PoolClient, now = new Date()) {
  // Unfinished work counts in future periods; completed cross-boundary work
  // counts in both. Nothing is automatically refunded after a crash.
  const { rows: [row] } = await client.query<{
    day_end: Date; month_end: Date; attempts: string; floors: string; suggestions: string;
  }>(`
    with periods as (
      select date_trunc('day', $1::timestamptz at time zone $2) at time zone $2 as day_start,
             date_trunc('month', $1::timestamptz at time zone $2) at time zone $2 as month_start,
             (date_trunc('day', $1::timestamptz at time zone $2) + interval '1 day') at time zone $2 as day_end,
             (date_trunc('month', $1::timestamptz at time zone $2) + interval '1 month') at time zone $2 as month_end
    )
    select p.day_end, p.month_end,
      (select count(*) from sponsored_reservations where kind = 'floor'
        and (created_at >= p.day_start or finished_at >= p.day_start or finished_at is null)) as attempts,
      (select coalesce(sum(coalesce(cost, reserved)), 0) from sponsored_reservations where kind = 'floor'
        and (created_at >= p.month_start or finished_at >= p.month_start or finished_at is null)) as floors,
      (select coalesce(sum(coalesce(cost, reserved)), 0) from sponsored_reservations where kind = 'suggestion'
        and (created_at >= p.month_start or finished_at >= p.month_start or finished_at is null)) as suggestions
    from periods p`, [now.toISOString(), POLICY.timezone]);
  return {
    dayEnd: row.day_end, monthEnd: row.month_end,
    attempts: Number(row.attempts), floors: Number(row.floors), suggestions: Number(row.suggestions),
  };
}

export async function reserveBudget(client: PoolClient, kind: "floor" | "suggestion", now = new Date()): Promise<Funding> {
  const budget = await allowance(client, now);
  if (budget.dayEnd.getTime() - now.getTime() < 10 * 60_000) {
    throw new SponsorshipError("resetting", "The free allowance resets shortly.", budget.dayEnd.toISOString());
  }
  if (kind === "floor" && budget.attempts >= POLICY.dailyAttempts) {
    throw new SponsorshipError("daily_limit", "Today's free floors have been claimed. Bring your own keys or come back tomorrow.", budget.dayEnd.toISOString());
  }
  const reserved = kind === "floor" ? POLICY.floorReservation : POLICY.suggestionReservation;
  if (budget.floors + budget.suggestions + reserved > POLICY.monthly ||
      (kind === "floor" ? budget.floors + reserved > POLICY.floorsMonthly : budget.suggestions + reserved > POLICY.suggestionsMonthly)) {
    throw new SponsorshipError("monthly_limit", "This month's free allowance has been used. You can still bring your own keys.", budget.monthEnd.toISOString());
  }
  const id = randomUUID();
  await client.query("insert into sponsored_reservations(id, kind, reserved, created_at) values ($1,$2,$3,$4)", [id, kind, reserved, now]);
  return { id, deadline: budget.dayEnd.getTime(), cost: 0, certain: false };
}

export async function settleBudget(funding: Funding) {
  if (!funding.certain) return;
  await pool().query(`update sponsored_reservations set cost = $2, finished_at = now()
    where id = $1 and finished_at is null and $2 <= reserved`, [funding.id, Math.ceil(funding.cost)]);
}

export async function availability(): Promise<SponsoredAvailability> {
  return locked(async (client) => {
    const budget = await allowance(client);
    const monthly = budget.floors + POLICY.floorReservation > POLICY.floorsMonthly;
    const resetting = budget.dayEnd.getTime() - Date.now() < 10 * 60_000;
    const reason = monthly ? "monthly_limit" : budget.attempts >= POLICY.dailyAttempts ? "daily_limit" : resetting ? "resetting" : null;
    return { enabled: true, available: !reason, remainingToday: Math.max(0, Math.min(POLICY.dailyAttempts - budget.attempts,
      Math.floor((POLICY.floorsMonthly - budget.floors) / POLICY.floorReservation))),
      resetAt: (monthly ? budget.monthEnd : budget.dayEnd).toISOString(), reason };
  });
}

export async function reserveGeneration(theme: string, effort: string, requestId: string, sponsored: boolean) {
  const fingerprint = createHash("sha256").update(JSON.stringify({ theme, effort, sponsored })).digest("hex");
  const reservation = await locked(async (client) => {
    const { rows: [existing] } = await client.query<{ fingerprint: string; floor_id: string }>(
      "select fingerprint, floor_id from generation_requests where id = $1", [requestId]);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new SponsorshipError("idempotency_conflict", "That request was already used for a different description.", null, 409);
      return { floorId: existing.floor_id, funding: undefined, duplicate: true };
    }
    const funding = sponsored ? await reserveBudget(client, "floor") : undefined;
    const floor = await reserveFloor(theme, client);
    await client.query("insert into generation_requests(id, fingerprint, floor_id) values ($1,$2,$3)", [requestId, fingerprint, floor.id]);
    return { floorId: floor.id, floor, funding, duplicate: false };
  });
  const floor = reservation.floor ?? (await listFloors()).find((floor) => floor.id === reservation.floorId);
  if (!floor) throw new SponsorshipError("already_completed", "This request was already processed and its floor has since been removed.", null, 409);
  return { floor, funding: reservation.funding, duplicate: reservation.duplicate };
}
