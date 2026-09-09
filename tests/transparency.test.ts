import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { applyAlphaMask, requestMask, birefnetEnabled } from "../src/lib/image/birefnet";

const png = (bytes: number[], width: number, height: number, channels: 1 | 4) =>
  sharp(Buffer.from(bytes), { raw: { width, height, channels } }).png().toBuffer();

test("mask changes alpha only, retaining dark outlines, edge colours and existing transparency", async () => {
  const pixels = [0, 0, 0, 255, 34, 34, 34, 255, 220, 12, 98, 128, 9, 12, 15, 0];
  const source = await png(pixels, 4, 1, 4);
  const mask = await png([0, 255, 128, 255], 4, 1, 1);
  const result = await applyAlphaMask(source, mask);
  const raw = await sharp(result.bytes).ensureAlpha().raw().toBuffer();
  assert.deepEqual([...raw], [0, 0, 0, 0, 34, 34, 34, 255, 220, 12, 98, 64, 9, 12, 15, 0]);
  assert.equal(result.width, 4);
  assert.equal(result.height, 1);
});

test("rejects wrong-sized and empty/full masks without resizing artwork", async () => {
  const source = await png([12, 34, 56, 255, 78, 90, 12, 255], 2, 1, 4);
  await assert.rejects(applyAlphaMask(source, await png([255], 1, 1, 1)), /Refusing to resize/);
  for (const coverage of [0, 255]) {
    await assert.rejects(applyAlphaMask(source, await png([coverage, coverage], 2, 1, 1)), /almost entirely/);
  }
});

test("FAL request asks only for a high-resolution mask and disables foreground refinement", async (t) => {
  const calls: Array<{ url: string; input?: Record<string, unknown> }> = [];
  t.mock.method(globalThis, "fetch", async (url: string, options?: RequestInit) => {
    calls.push({ url: String(url), input: options?.body ? JSON.parse(String(options.body)) : undefined });
    return calls.length === 1
      ? Response.json({ image: { url: "https://example.invalid/mask.png" } })
      : new Response(new Uint8Array([1, 2, 3]));
  });
  const result = await requestMask("mock", Buffer.from("artwork"), "image/png");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://fal.run/fal-ai/birefnet/v2");
  assert.equal(calls[0].input?.mask_only, true);
  assert.equal(calls[0].input?.refine_foreground, false);
  assert.equal(calls[0].input?.operating_resolution, "2048x2048");
  assert.equal(calls[0].input?.image_url, "data:image/png;base64,YXJ0d29yaw==");
  assert.deepEqual([...result], [1, 2, 3]);
});

test("mask service failures surface without artwork regeneration or keying fallback", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return new Response("unavailable", { status: 503 }); });
  await assert.rejects(requestMask("mock", Buffer.from("art"), "image/png"), /503/);
  assert.equal(calls, 1);
});

test("experiment is restricted to opted-in local unsponsored generation", () => {
  const before = { mode: process.env.NODE_ENV, transparency: process.env.FAL_TRANSPARENCY };
  try {
    process.env.FAL_TRANSPARENCY = "birefnet";
    Object.assign(process.env, { NODE_ENV: "development" });
    assert.equal(birefnetEnabled(), true);
    assert.equal(birefnetEnabled(true), false);
    Object.assign(process.env, { NODE_ENV: "production" });
    assert.equal(birefnetEnabled(), false);
    Object.assign(process.env, { NODE_ENV: "development" });
    delete process.env.FAL_TRANSPARENCY;
    assert.equal(birefnetEnabled(), false);
  } finally {
    for (const [key, value] of Object.entries({ NODE_ENV: before.mode, FAL_TRANSPARENCY: before.transparency })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
