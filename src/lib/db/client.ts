import { Pool } from "pg";

const globalForDb = globalThis as unknown as { pool?: Pool; schema?: Promise<void> };

export function pool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. See .env.example.");
  }
  globalForDb.pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("localhost") ? undefined : { rejectUnauthorized: false },
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

create table if not exists floor_images (
  key   text primary key,
  mime  text not null,
  bytes bytea not null
);
`;

/** Idempotent, runs once per process. Keeps deploys to "push and go". */
export function ensureSchema(): Promise<void> {
  globalForDb.schema ??= pool()
    .query(SCHEMA)
    .then(() => undefined);
  return globalForDb.schema;
}
