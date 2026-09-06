import { randomUUID } from "node:crypto";
import { ensureSchema, pool } from "./client";
import type { Floor, FloorKind, FloorSpec, FloorStatus } from "@/lib/ai/types";

export const BASEMENT_ORDINAL = -1000;
export const ROOF_ORDINAL = 1_000_000;

interface Row {
  id: string;
  ordinal: string | number;
  kind: FloorKind;
  status: FloorStatus;
  theme_prompt: string;
  display_name: string;
  spec: FloorSpec | null;
  failure_reason: string | null;
  meta: Record<string, unknown>;
  image_key: string | null;
  image_mime: string | null;
  image_width: number | null;
  image_height: number | null;
  is_reference: boolean;
  created_at: Date;
}

function toFloor(row: Row): Floor {
  return {
    id: row.id,
    ordinal: Number(row.ordinal),
    kind: row.kind,
    status: row.status,
    themePrompt: row.theme_prompt,
    displayName: row.display_name,
    spec: row.spec,
    failureReason: row.failure_reason,
    meta: row.meta,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listFloors(): Promise<Floor[]> {
  await ensureSchema();
  const { rows } = await pool().query<Row>(`select * from floors order by ordinal asc`);
  return rows.map(toFloor);
}

/** The tile every later generation is conditioned on. */
export async function referenceTile(): Promise<{ id: string; key: string; mime: string } | null> {
  await ensureSchema();
  const { rows } = await pool().query<Row>(
    `select * from floors where is_reference and image_key is not null limit 1`,
  );
  const row = rows[0];
  return row?.image_key
    ? { id: row.id, key: row.image_key, mime: row.image_mime ?? "image/png" }
    : null;
}

export async function nextFloorOrdinal(): Promise<number> {
  await ensureSchema();
  const { rows } = await pool().query<{ max: string | null }>(
    `select max(ordinal)::text as max from floors where kind = 'floor'`,
  );
  return rows[0]?.max == null ? 1 : Number(rows[0].max) + 1;
}

export async function imageKeyFor(id: string): Promise<{ key: string } | null> {
  await ensureSchema();
  const { rows } = await pool().query<{ image_key: string | null }>(
    `select image_key from floors where id = $1`,
    [id],
  );
  return rows[0]?.image_key ? { key: rows[0].image_key } : null;
}

export interface NewFloor {
  ordinal: number;
  kind: FloorKind;
  status: FloorStatus;
  themePrompt: string;
  displayName: string;
  spec: FloorSpec | null;
  failureReason?: string | null;
  meta?: Record<string, unknown>;
  image?: { key: string; mime: string; width: number; height: number } | null;
  isReference?: boolean;
}

export async function insertFloor(floor: NewFloor): Promise<Floor> {
  await ensureSchema();
  const { rows } = await pool().query<Row>(
    `insert into floors
       (id, ordinal, kind, status, theme_prompt, display_name, spec, failure_reason,
        meta, image_key, image_mime, image_width, image_height, is_reference)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     returning *`,
    [
      randomUUID(),
      floor.ordinal,
      floor.kind,
      floor.status,
      floor.themePrompt,
      floor.displayName,
      floor.spec ? JSON.stringify(floor.spec) : null,
      floor.failureReason ?? null,
      JSON.stringify(floor.meta ?? {}),
      floor.image?.key ?? null,
      floor.image?.mime ?? null,
      floor.image?.width ?? null,
      floor.image?.height ?? null,
      floor.isReference ?? false,
    ],
  );
  return toFloor(rows[0]);
}

export interface DeleteResult {
  deleted: boolean;
  imageKey: string | null;
  reason?: string;
}

/**
 * The reference floor cannot be deleted. Every later tile was conditioned on
 * it, so removing it would leave the building with nothing to match against.
 */
export async function deleteFloor(id: string): Promise<DeleteResult> {
  await ensureSchema();
  const { rows } = await pool().query<{ image_key: string | null; is_reference: boolean }>(
    `delete from floors where id = $1 and not is_reference returning image_key, is_reference`,
    [id],
  );
  if (rows[0]) return { deleted: true, imageKey: rows[0].image_key };

  const { rowCount } = await pool().query(`select 1 from floors where id = $1`, [id]);
  return rowCount
    ? { deleted: false, imageKey: null, reason: "The reference floor holds the building together." }
    : { deleted: false, imageKey: null, reason: "No such floor." };
}
