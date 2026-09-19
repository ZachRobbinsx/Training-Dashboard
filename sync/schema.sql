-- Idempotent: sync.py runs this on every start.

create table if not exists activities (
  id            bigint primary key,
  start_time    timestamptz,
  activity_type text,
  name          text,
  summary       jsonb not null,
  splits        jsonb,
  updated_at    timestamptz not null default now()
);
create index if not exists activities_start_idx on activities (start_time desc);
create index if not exists activities_type_idx  on activities (activity_type);

-- Original FIT file for each activity (for deeper analysis later).
create table if not exists fit_files (
  activity_id bigint primary key references activities(id) on delete cascade,
  data        bytea not null,
  bytes       integer not null,
  created_at  timestamptz not null default now()
);

-- One row per day per kind: stats, sleep, hrv, weight, readiness, training_status
create table if not exists daily_metrics (
  day        date not null,
  kind       text not null,
  payload    jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (day, kind)
);

-- Small key/value store (holds the Garmin login token so no password is needed after setup)
create table if not exists kv (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- Chart-ready analysis derived from the FIT file (per-km splits, swim lengths/sets, laps)
alter table activities add column if not exists analysis jsonb;

-- Your own notes on each session
create table if not exists activity_notes (
  activity_id bigint primary key,
  note        text not null default '',
  updated_at  timestamptz not null default now()
);
