import { Pool } from "pg";

const globalForDb = globalThis as unknown as { pool?: Pool; schema?: Promise<void> };

export function pool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. See .env.example.");
  }
  globalForDb.pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    // Off by default: Railway's private network speaks plain TCP, and offering
    // SSL to a server that does not support it fails the connection outright.
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  return globalForDb.pool;
}

const SCHEMA = `
create table if not exists floors (
  id            uuid primary key,
  ordinal       double precision not null,
  kind          text not null,
  status        text not null,
  theme_prompt  text not null,
  display_name  text not null,
  spec          jsonb,
  failure_reason text,
  meta          jsonb not null default '{}'::jsonb,
  image_key     text,
  image_mime    text,
  image_width   integer,
  image_height  integer,
  is_reference  boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists floors_ordinal_idx on floors (ordinal);
-- Exactly one reference tile. Two concurrent seeds would otherwise each create
-- a lobby, which is how the building ended up with two ground floors.
create unique index if not exists floors_one_reference on floors ((is_reference))
  where is_reference;

create table if not exists floor_images (
  key   text primary key,
  mime  text not null,
  bytes bytea not null
);

-- No foreign key to floors: demolition must never refund generation.
create table if not exists generation_requests (
  id uuid primary key,
  fingerprint text not null,
  floor_id uuid not null,
  created_at timestamptz not null default now()
);
create table if not exists sponsored_reservations (
  id uuid primary key,
  kind text not null check (kind in ('floor', 'suggestion')),
  reserved integer not null check (reserved >= 0),
  cost integer check (cost >= 0 and cost <= reserved),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists sponsored_created_idx on sponsored_reservations(created_at);
create index if not exists sponsored_unfinished_idx on sponsored_reservations(created_at) where finished_at is null;
create table if not exists floor_suggestions (
  singleton boolean primary key default true check (singleton),
  batch_id uuid,
  fingerprint text,
  suggestions jsonb not null default '[]',
  generated_at timestamptz,
  attempted_at timestamptz,
  reservation_id uuid
);
`;

/** Idempotent, runs once per process. Keeps deploys to "push and go". */
export function ensureSchema(): Promise<void> {
  globalForDb.schema ??= pool()
    .query(SCHEMA)
    .then(() => undefined);
  return globalForDb.schema;
}
