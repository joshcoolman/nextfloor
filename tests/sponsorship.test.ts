import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pool, ensureSchema } from "../src/lib/db/client";
import { allowance, locked, reserveBudget, reserveGeneration, settleBudget } from "../src/lib/sponsorship/ledger";
import { POLICY, publicBudget } from "../src/lib/sponsorship/policy";
import { visitorKeys, sponsoredKeys, suggestionKey } from "../src/lib/ai/keys";
import { anthropicPricesSafe, falPriceSafe } from "../src/lib/sponsorship/pricing";
import { relevantSuggestions, getSuggestions } from "../src/lib/sponsorship/suggestions";
import { generateFloorSpec } from "../src/lib/ai/spec";
import { fal } from "../src/lib/ai/providers/fal";
import { ensureBuilding, generateFloor } from "../src/lib/pipeline";
import { deleteFloor, sweepStalePending } from "../src/lib/db/floors";

const database = process.env.TEST_DATABASE_URL;
if (!database || !["localhost", "127.0.0.1"].includes(new URL(database).hostname) || !new URL(database).pathname.endsWith("_test")) {
  throw new Error("Set TEST_DATABASE_URL to an isolated localhost database ending in _test. Production is never used.");
}
process.env.DATABASE_URL = database;
process.env.DATABASE_SSL = "false";
const noon = new Date("2026-09-07T19:00:00Z");

beforeEach(async () => {
  await ensureSchema();
  await pool().query("truncate generation_requests, sponsored_reservations, floors, floor_suggestions");
});
after(async () => { await pool().end(); });

test("twenty simultaneous attempts admit exactly four", async () => {
  const attempts = await Promise.allSettled(Array.from({ length: 20 }, () => locked((client) => reserveBudget(client, "floor", noon))));
  assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 4);
  assert.equal(attempts.filter((r) => r.status === "rejected" && r.reason.code === "daily_limit").length, 16);
});

test("independent Node processes share the same global allowance", async () => {
  const script = `import { locked, reserveBudget } from './src/lib/sponsorship/ledger.ts';
    import { pool } from './src/lib/db/client.ts';
    const attempts = await Promise.allSettled(Array.from({length:3}, () => locked(c => reserveBudget(c, 'floor', new Date('2026-09-07T19:00:00Z')))));
    console.log(attempts.filter(r => r.status === 'fulfilled').length); await pool().end();`;
  const results = await Promise.all(Array.from({ length: 3 }, () => promisify(execFile)(process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script], { env: { ...process.env, DATABASE_URL: database! } })));
  assert.equal(results.reduce((sum, result) => sum + Number(result.stdout.trim()), 0), 4);
});

test("monthly limit reserves worst-case cost and suggestions have a separate ceiling", async () => {
  await pool().query(`insert into sponsored_reservations(id,kind,reserved,cost,created_at,finished_at)
    values ($1,'floor',9000000,9000000,'2026-09-01T19:00:00Z','2026-09-01T19:00:00Z')`, [randomUUID()]);
  await assert.rejects(locked((c) => reserveBudget(c, "floor", noon)), { code: "monthly_limit" });
  const results = await Promise.allSettled(Array.from({ length: 30 }, () => locked((c) => reserveBudget(c, "suggestion", noon))));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 25);
  const usage = await locked((c) => allowance(c, noon));
  assert.equal(usage.floors + usage.suggestions, 9_500_000);
});

test("known unused cost is released once, uncertain work carries across resets", async () => {
  const funded = await locked((c) => reserveBudget(c, "floor", noon));
  await settleBudget({ ...funded, certain: true, cost: 230_000 });
  await settleBudget({ ...funded, certain: true, cost: 0 });
  const { rows: [row] } = await pool().query("select cost from sponsored_reservations where id=$1", [funded.id]);
  assert.equal(row.cost, 230_000);
  await locked((c) => reserveBudget(c, "floor", noon));
  const nextMonth = await locked((c) => allowance(c, new Date("2026-12-01T20:00:00Z")));
  assert.equal(nextMonth.floors, POLICY.floorReservation);
  assert.equal(nextMonth.attempts, 1);
});

test("LA reset uses DST-aware midnight and rejects work just before reset", async () => {
  const summer = await locked((c) => allowance(c, noon));
  assert.equal(summer.dayEnd.toISOString(), "2026-09-08T07:00:00.000Z");
  const winter = await locked((c) => allowance(c, new Date("2026-12-01T20:00:00Z")));
  assert.equal(winter.dayEnd.toISOString(), "2026-12-02T08:00:00.000Z");
  await assert.rejects(locked((c) => reserveBudget(c, "floor", new Date("2026-09-08T06:55:00Z"))), { code: "resetting" });
});

test("duplicate creation claims one floor; deletion cannot replay the request", async () => {
  const id = randomUUID();
  const results = await Promise.all(Array.from({ length: 8 }, () => reserveGeneration("A room", "medium", id, false)));
  assert.equal(new Set(results.map((r) => r.floor.id)).size, 1);
  assert.equal(results.filter((r) => !r.duplicate).length, 1);
  await assert.rejects(reserveGeneration("Different room", "medium", id, false), { code: "idempotency_conflict" });
  await deleteFloor(results[0].floor.id);
  await assert.rejects(reserveGeneration("A room", "medium", id, false), { code: "already_completed" });
  assert.equal((await pool().query("select * from sponsored_reservations")).rowCount, 0);
});

test("floor deletion and stale cleanup never refund sponsor reservations", async () => {
  const reservation = await locked((c) => reserveBudget(c, "floor", noon));
  const floor = await reserveGeneration("A room", "medium", randomUUID(), false);
  await pool().query("update floors set created_at = now() - interval '20 minutes' where id=$1", [floor.floor.id]);
  await sweepStalePending();
  await deleteFloor(floor.floor.id);
  assert.equal((await pool().query("select reserved from sponsored_reservations where id=$1", [reservation.id])).rows[0].reserved, POLICY.floorReservation);
});

test("production requires public opt-in; BYOK and development keys work independently", (t) => {
  const saved = { ...process.env };
  t.after(() => {
    for (const key of ["NODE_ENV", "ALLOW_SERVER_KEYS", "PUBLIC_GENERATION", "ANTHROPIC_API_KEY", "FAL_KEY"]) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  });
  Object.assign(process.env, { NODE_ENV: "production", PUBLIC_GENERATION: "false" });
  process.env.ALLOW_SERVER_KEYS = "true";
  process.env.ANTHROPIC_API_KEY = "unused-host";
  process.env.FAL_KEY = "unused-host";
  assert.equal(visitorKeys(new Request("http://localhost")), null);
  assert.throws(() => visitorKeys(new Request("http://localhost", { headers: { "x-fal-key": "visitor" } })), /Missing/);
  assert.deepEqual(visitorKeys(new Request("http://localhost", { headers: { "x-fal-key": "visitor-fal", "x-anthropic-key": "visitor-anthropic" } })), { fal: "visitor-fal", anthropic: "visitor-anthropic" });
  assert.equal(sponsoredKeys(), null);
  assert.equal(suggestionKey(new Request("http://localhost")), "");
  process.env.PUBLIC_GENERATION = "true";
  assert.deepEqual(sponsoredKeys(), { anthropic: "unused-host", fal: "unused-host" });
  assert.equal(visitorKeys(new Request("http://localhost")), null);
  Object.assign(process.env, { NODE_ENV: "development", PUBLIC_GENERATION: "false" });
  assert.deepEqual(visitorKeys(new Request("http://localhost")), { anthropic: "unused-host", fal: "unused-host" });
  assert.deepEqual(visitorKeys(new Request("http://localhost", { headers: { "x-anthropic-key": "visitor" } })), { anthropic: "visitor", fal: "unused-host" });
  assert.equal(suggestionKey(new Request("http://localhost", { headers: { "x-anthropic-key": "visitor" } })), "visitor");
});

test("public monthly budget trickles daily, carries unused credit, and validates configuration", async (t) => {
  process.env.PUBLIC_GENERATION = "true";
  process.env.PUBLIC_MONTHLY_BUDGET_USD = "30";
  t.after(() => { delete process.env.PUBLIC_GENERATION; delete process.env.PUBLIC_MONTHLY_BUDGET_USD; });
  const day1 = new Date("2026-09-01T19:00:00Z");
  const day2 = new Date("2026-09-02T19:00:00Z");
  assert.equal(publicBudget(day1).accrued, 1_000_000);
  assert.equal(publicBudget(day2).accrued, 2_000_000);
  await locked((c) => reserveBudget(c, "floor", day1));
  await assert.rejects(locked((c) => reserveBudget(c, "floor", day1)), { code: "daily_limit" });
  await locked((c) => reserveBudget(c, "floor", day2));
  await locked((c) => reserveBudget(c, "floor", day2));
  await assert.rejects(locked((c) => reserveBudget(c, "floor", day2)), { code: "daily_limit" });
  process.env.PUBLIC_MONTHLY_BUDGET_USD = "10";
  assert.equal(publicBudget(day1).suggestions, 500_000);
  assert.equal(publicBudget(new Date("2026-02-28T19:00:00Z")).accrued, 10_000_000);
  assert.equal(publicBudget(new Date("2026-03-01T19:00:00Z")).accrued, Math.floor(10_000_000 / 31));
  process.env.PUBLIC_MONTHLY_BUDGET_USD = "invalid";
  assert.throws(() => publicBudget(day1), { code: "unavailable" });
});

test("Anthropic-only hints bypass sponsorship and refresh on context changes without cooldown", async (t) => {
  let calls = 0;
  const suggestions = Array.from({ length: 12 }, (_, n) => ({ label: `Idea ${n}`, prompt: `A secret laboratory number ${n} where suspicious librarians catalog impossible machines while three visitors argue about who moved the moon. Dusty books crowd every desk and nobody trusts the cat.` }));
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    assert.ok(String(input).includes("api.anthropic.com/v1/messages"));
    assert.equal(new Headers(init?.headers).get("x-api-key"), "visitor-hints-key");
    calls++;
    return Response.json({ id: "msg-test", type: "message", role: "assistant", model: POLICY.suggestionModel,
      stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 1000 },
      content: [{ type: "text", text: JSON.stringify({ suggestions }) }] });
  });
  await Promise.all(Array.from({ length: 8 }, () => getSuggestions("visitor-hints-key")));
  assert.equal(calls, 1);
  assert.equal((await getSuggestions("visitor-hints-key")).suggestions.length, 12);
  assert.equal((await pool().query("select * from sponsored_reservations")).rowCount, 0);
  await reserveGeneration("A new room", "medium", randomUUID(), false);
  assert.equal((await getSuggestions("visitor-hints-key")).suggestions.length, 12);
  assert.equal(calls, 2);
});

test("pricing rejects missing, malformed, increased and differently metered prices", () => {
  const text = "| Claude Sonnet 5 | $2 / MTok | $2.5 / MTok | $4 / MTok | $0.2 / MTok | $10 / MTok |\n| Claude Haiku 4.5 | $1 / MTok | $1.25 / MTok | $2 / MTok | $0.1 / MTok | $5 / MTok |";
  assert.equal(anthropicPricesSafe(text), true);
  assert.equal(anthropicPricesSafe(text.replace("$10 / MTok", "$15 / MTok")), false);
  assert.equal(anthropicPricesSafe("unavailable"), false);
  const price = { endpoint_id: POLICY.imageModel, unit: "image", unit_price: .15, currency: "USD" };
  assert.equal(falPriceSafe({ prices: [price] }), true);
  assert.equal(falPriceSafe({ prices: [{ ...price, unit: "megapixel" }] }), false);
  assert.equal(falPriceSafe({ prices: [{ ...price, unit_price: .25 }] }), false);
});

test("suggestions remove duplicate and malformed content", () => {
  const prompt = "A secret laboratory where suspicious librarians catalog impossible machines while three visitors argue about who moved the moon. Dusty books crowd every desk and nobody trusts the cat.";
  assert.equal(relevantSuggestions([{ label: "Moon Library", prompt }, { label: "Moon Library", prompt }, { label: "Short", prompt: "Too short" }], []).length, 1);
});

test("sponsored interpreter bounds tokens, pins model, and never automatically retries", async (t) => {
  let paidCalls = 0;
  let tokens = 30_000;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("count_tokens")) return Response.json({ input_tokens: tokens });
    assert.ok(url.includes("api.anthropic.com/v1/messages"));
    paidCalls++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, POLICY.specModel);
    assert.equal(body.max_tokens, POLICY.specOutput);
    return Response.json({ type: "error", error: { type: "api_error", message: "Simulated outage" } }, { status: 500 });
  });
  const funding = { id: randomUUID(), deadline: Date.now() + 100_000, cost: 0, certain: false };
  await assert.rejects(generateFloorSpec("test-only-key", "A room", { kind: "floor", existingThemes: [], funding }), /too large/);
  assert.equal(paidCalls, 0);
  tokens = 1000;
  funding.certain = false;
  await assert.rejects(generateFloorSpec("test-only-key", "A room", { kind: "floor", existingThemes: [], funding }));
  assert.equal(paidCalls, 1);
  assert.equal(funding.certain, false);
});

test("image failure retains its ceiling and a missing reference makes no paid call", async (t) => {
  let paidCalls = 0;
  t.mock.method(globalThis, "fetch", async () => { paidCalls++; throw new Error("Simulated lost response"); });
  const funding = { id: randomUUID(), deadline: Date.now() + 100_000, cost: 0, certain: true };
  await assert.rejects(fal.generate("test-only-key", "A room", null, funding), /reference/);
  assert.equal(paidCalls, 0);
  await assert.rejects(fal.generate("test-only-key", "A room", { bytes: Buffer.from("reference"), mimeType: "image/png", url: null }, funding));
  assert.equal(paidCalls, 1);
  assert.equal(funding.cost, POLICY.imageCeiling);
});

test("concurrent suggestion refreshes pay once and persist a rotating batch", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: noon });
  process.env.SPONSORED_GENERATION = "true";
  process.env.SPONSORED_ANTHROPIC_KEY = "test-only-anthropic";
  process.env.SPONSORED_FAL_KEY = "test-only-fal";
  t.after(() => {
    delete process.env.SPONSORED_GENERATION;
    delete process.env.SPONSORED_ANTHROPIC_KEY;
    delete process.env.SPONSORED_FAL_KEY;
  });
  let paidCalls = 0;
  const suggestions = Array.from({ length: 12 }, (_, n) => ({ label: `Room ${n}`, prompt: `A secret laboratory number ${n} where suspicious librarians catalog impossible machines while three visitors argue about who moved the moon. Dusty books crowd every desk and nobody trusts the cat.` }));
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("pricing.md")) return new Response("| Claude Sonnet 5 | $2 / MTok | $2.5 / MTok | $4 / MTok | $0.2 / MTok | $10 / MTok |\n| Claude Haiku 4.5 | $1 / MTok | $1.25 / MTok | $2 / MTok | $0.1 / MTok | $5 / MTok |");
    if (url.includes("models/pricing")) return Response.json({ prices: [{ endpoint_id: POLICY.imageModel, unit: "image", unit_price: .15, currency: "USD" }] });
    if (url.includes("count_tokens")) return Response.json({ input_tokens: 1000 });
    assert.ok(url.includes("api.anthropic.com/v1/messages"));
    paidCalls++;
    return Response.json({ id: "msg-test", type: "message", role: "assistant", model: POLICY.suggestionModel,
      stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 1000 },
      content: [{ type: "text", text: JSON.stringify({ suggestions }) }] });
  });
  await Promise.all(Array.from({ length: 8 }, () => getSuggestions()));
  assert.equal(paidCalls, 1);
  assert.equal((await getSuggestions()).suggestions.length, 12);
  const { rows: [row] } = await pool().query("select cost from sponsored_reservations where kind='suggestion'");
  assert.equal(row.cost, 6000);
});

test("full funded pipeline retries an invalid image once and settles both attempts", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: noon });
  await ensureBuilding();
  const reservation = await reserveGeneration("A room", "medium", randomUUID(), true);
  const funding = reservation.funding!;
  const spec = { displayName: "Moon Library", concept: "Books", rooms: [], architecture: "", props: [], characters: [], lighting: "", palette: "", storytelling: [], signage: [], easterEggs: [] };
  let imageCalls = 0;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("count_tokens")) return Response.json({ input_tokens: 1000 });
    if (url.includes("api.anthropic.com/v1/messages")) return Response.json({ id: "msg-test", type: "message", role: "assistant", model: POLICY.specModel,
      stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 1000 },
      content: [{ type: "text", text: JSON.stringify(spec) }] });
    if (url.startsWith("https://fal.run/")) { imageCalls++; return Response.json({ images: [{ url: "https://fixture.invalid/tile", content_type: "image/png" }] }); }
    assert.equal(url, "https://fixture.invalid/tile");
    // Deliberately invalid image data exercises contract validation and retry.
    return new Response("invalid image");
  });
  const floor = await generateFloor({ keys: { anthropic: "test-key", fal: "test-key", funding }, floorId: reservation.floor.id, ordinal: reservation.floor.ordinal, theme: "A room" });
  assert.equal(floor?.status, "dead");
  assert.equal(imageCalls, 2);
  await settleBudget(funding);
  assert.equal((await pool().query("select cost from sponsored_reservations where id=$1", [funding.id])).rows[0].cost, 412_000);
});
