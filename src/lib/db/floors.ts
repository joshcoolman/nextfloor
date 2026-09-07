import { randomUUID } from "node:crypto";
import { ensureSchema, pool } from "./client";
import type { Floor, FloorKind, FloorSpec, FloorStatus } from "@/lib/ai/types";

export const BASEMENT_ORDINAL = -1000;
/**
 * The reference tile is artwork, not a storey.
 *
 * It exists so every generation has a shell to match, and it used to occupy
 * floor 1 as well -- which meant the building's ground floor could never be
 * generated, and the number painted on the artwork had to be corrected by hand
 * if the tile was ever replaced. Parked below the basement it is out of the
 * numbering entirely, and floor 1 is a slot like any other.
 */
export const REFERENCE_ORDINAL = -2000;
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
    width: row.image_width,
    height: row.image_height,
    isReference: row.is_reference,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listFloors(): Promise<Floor[]> {
  await ensureSchema();
  const { rows } = await pool().query<Row>(`select * from floors order by ordinal asc`);
  return rows.map(toFloor);
}

/** The tile every later generation is conditioned on. */
export async function referenceTile(): Promise<
  { id: string; key: string; mime: string; width: number | null; height: number | null } | null
> {
  await ensureSchema();
  const { rows } = await pool().query<Row>(
    `select * from floors where is_reference and image_key is not null limit 1`,
  );
  const row = rows[0];
  return row?.image_key
    ? {
        id: row.id,
        key: row.image_key,
        mime: row.image_mime ?? "image/png",
        width: row.image_width,
        height: row.image_height,
      }
    : null;
}

/**
 * Moves a reference tile that still sits at floor 1 out of the numbering.
 *
 * The reference used to double as the ground floor. Buildings raised before
 * that changed still have it there, holding a slot nothing can generate into.
 */
export async function parkReferenceTile(): Promise<boolean> {
  await ensureSchema();
  const { rowCount } = await pool().query(
    `update floors set ordinal = $1 where is_reference and ordinal <> $1`,
    [REFERENCE_ORDINAL],
  );
  return Boolean(rowCount);
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

/**
 * Clears the slot a static tile occupies, returning the image keys removed.
 *
 * For the roof and basement that is every row of the kind, which is how a
 * leftover generated roof gets displaced. For `floor` it is only the reference
 * row: generated floors share that kind, and deleting by kind alone would wipe
 * the whole tower the first time the reference artwork changed on disk.
 */
export async function clearStaticSlot(kind: FloorKind): Promise<string[]> {
  await ensureSchema();
  const { rows } = await pool().query<{ image_key: string | null }>(
    `delete from floors
      where kind = $1
        and ($1 <> 'floor' or is_reference)
      returning image_key`,
    [kind],
  );
  return rows.map((row) => row.image_key).filter((key): key is string => Boolean(key));
}

/**
 * The lowest floor number no built floor occupies, falling back to one above the
 * top of the building when the sequence is contiguous.
 *
 * Floor numbers are painted into the artwork and cannot be changed afterwards,
 * so a deleted floor leaves a permanent hole. Filling the lowest gap first
 * means the building stops accumulating them.
 *
 * A condemned floor never holds its slot, kept or not. Keeping one is curiosity
 * -- someone wanted to see what a failed floor looks like -- not a decision to
 * live with it, so the next floor built takes that number back. `meta.kept`
 * governs only whether the wreck is visible while it waits.
 *
 * The series runs to max + 1, so the fallback needs no special case: that value
 * is never occupied.
 */
const FREE_ORDINAL = `
  select min(n)::double precision
    from generate_series(
           1,
           (select coalesce(max(ordinal), 0)::int + 1 from floors where kind = 'floor')
         ) as n
   where not exists (
     select 1 from floors f
      where f.kind = 'floor'
        and f.ordinal = n
        and f.status <> 'dead'
        and not f.is_reference
   )
`;

/**
 * Claims a floor slot and returns a pending row for it.
 *
 * The ordinal is allocated under an advisory lock rather than by reading the
 * building and inserting later: generation takes a minute or two, and several
 * requests in flight would otherwise all compute the same number and collide,
 * with that number baked into the artwork.
 *
 * The row exists from the moment the slot is claimed, so a pending floor
 * survives a browser refresh and shows as under construction.
 */
export async function reserveFloor(theme: string): Promise<Floor> {
  await ensureSchema();
  const client = await pool().connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext('nextfloor:ordinal'))");
    // Clear the wreck first if this slot holds one. A condemned floor is
    // always temporary: it stands until something is built over it.
    await client.query(
      `delete from floors
        where kind = 'floor' and status = 'dead' and ordinal = (${FREE_ORDINAL})`,
    );
    const { rows } = await client.query<Row>(
      `insert into floors (id, ordinal, kind, status, theme_prompt, display_name, meta)
       values ($1, (${FREE_ORDINAL}), 'floor', 'pending', $2, $3, '{}'::jsonb)
       returning *`,
      [randomUUID(), theme, theme.slice(0, 40)],
    );
    await client.query("commit");
    return toFloor(rows[0]);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function completeFloor(
  id: string,
  fields: {
    status: FloorStatus;
    displayName: string;
    spec: FloorSpec | null;
    failureReason?: string | null;
    meta?: Record<string, unknown>;
    image?: { key: string; mime: string; width: number; height: number } | null;
  },
): Promise<Floor | null> {
  await ensureSchema();
  const { rows } = await pool().query<Row>(
    `update floors set
       status = $2, display_name = $3, spec = $4, failure_reason = $5, meta = $6,
       image_key = $7, image_mime = $8, image_width = $9, image_height = $10
     where id = $1
     returning *`,
    [
      id,
      fields.status,
      fields.displayName,
      fields.spec ? JSON.stringify(fields.spec) : null,
      fields.failureReason ?? null,
      JSON.stringify(fields.meta ?? {}),
      fields.image?.key ?? null,
      fields.image?.mime ?? null,
      fields.image?.width ?? null,
      fields.image?.height ?? null,
    ],
  );
  return rows[0] ? toFloor(rows[0]) : null;
}

/**
 * When this process started. Generation runs in `after()`, inside this process,
 * so anything left pending from before this moment is definitionally orphaned:
 * a restart, a redeploy or a hot reload killed the work that would have
 * finished it. No waiting required to know that.
 */
const BOOTED_AT = new Date();

/**
 * Turns floors that will never finish into dead floors.
 *
 * Two cases, and the first is exact rather than a guess:
 *   - pending from before this process booted: the work is gone.
 *   - pending far longer than a generation can take: hung inside this process.
 *
 * A generation is one or two image calls and one or two spec calls, so ten
 * minutes is already several times the realistic worst case.
 */
export async function sweepStalePending(minutes = 10): Promise<number> {
  await ensureSchema();
  const { rowCount } = await pool().query(
    `update floors
        set status = 'dead',
            failure_reason = case
              when created_at < $2
                then 'Construction stopped: the server restarted before this floor was finished.'
              else 'Construction stalled and was abandoned.'
            end
      where status = 'pending'
        and (created_at < $2 or created_at < now() - ($1 || ' minutes')::interval)`,
    [String(minutes), BOOTED_AT.toISOString()],
  );
  return rowCount ?? 0;
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
export async function deleteFloor(id: string, onlyDead = false): Promise<DeleteResult> {
  await ensureSchema();
  const { rows } = await pool().query<{ image_key: string | null; is_reference: boolean }>(
    `delete from floors
      where id = $1 and not is_reference and ($2 = false or status = 'dead')
      returning image_key, is_reference`,
    [id, onlyDead],
  );
  if (rows[0]) return { deleted: true, imageKey: rows[0].image_key };

  const { rowCount } = await pool().query(`select 1 from floors where id = $1`, [id]);
  return rowCount
    ? {
        deleted: false,
        imageKey: null,
        reason: onlyDead
          ? "Only a condemned floor can be cleared."
          : "The reference floor holds the building together.",
      }
    : { deleted: false, imageKey: null, reason: "No such floor." };
}

/**
 * Marks a condemned floor as one the visitor wanted to look at.
 *
 * A dead floor is hidden by default, and keeping it only makes it visible --
 * it is a peek at what a failed floor looks like, not a decision to live with
 * one. The next floor built takes the slot back, so a condemned storey is
 * always something you catch rather than something you own.
 */
export async function keepFloor(id: string): Promise<Floor | null> {
  await ensureSchema();
  const { rows } = await pool().query<Row>(
    `update floors set meta = coalesce(meta, '{}'::jsonb) || '{"kept": true}'::jsonb
      where id = $1 and status = 'dead'
      returning *`,
    [id],
  );
  return rows[0] ? toFloor(rows[0]) : null;
}
