create extension if not exists pgcrypto;

create table public.trade_signals (
  id uuid primary key default gen_random_uuid(),
  signal_candidate_key text not null unique,
  symbol text not null check (symbol ~ '^[A-Z0-9]{3,30}$'),
  direction text not null check (direction in ('LONG', 'SHORT')),
  entry_price numeric not null check (entry_price > 0),
  stop_loss numeric not null check (stop_loss > 0),
  target_price numeric not null check (target_price > 0),
  risk_distance numeric not null check (risk_distance > 0),
  risk_bps numeric not null check (risk_bps > 0),
  risk_reward_ratio numeric not null check (risk_reward_ratio >= 2),
  entry_candle_close_time_ms bigint not null check (entry_candle_close_time_ms > 0),
  swing_price numeric not null check (swing_price > 0),
  swing_candle_close_time_ms bigint not null check (swing_candle_close_time_ms > 0),
  swing_age_candles integer not null check (swing_age_candles >= 1),
  entry_key text not null,
  evidence jsonb not null default '{}'::jsonb,
  seen_count integer not null default 1 check (seen_count > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  actionable boolean not null default false check (actionable = false),
  execution_enabled boolean not null default false check (execution_enabled = false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index trade_signals_last_seen_at_idx on public.trade_signals (last_seen_at desc);
create index trade_signals_symbol_direction_idx on public.trade_signals (symbol, direction);

alter table public.trade_signals enable row level security;
revoke all on table public.trade_signals from anon, authenticated;
grant select, insert, update on table public.trade_signals to service_role;

create policy trade_signals_deny_client_access
on public.trade_signals
for all
to anon, authenticated
using (false)
with check (false);

create or replace function public.touch_trade_signals_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trade_signals_touch_updated_at
before update on public.trade_signals
for each row execute function public.touch_trade_signals_updated_at();

create or replace function public.upsert_trade_signal(
  p_signal jsonb,
  p_observed_at timestamptz
)
returns table(inserted boolean, signal jsonb)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_key text := p_signal->>'signal_candidate_key';
  v_existing public.trade_signals%rowtype;
  v_saved public.trade_signals%rowtype;
begin
  if v_key is null or length(v_key) = 0 then
    raise exception 'INVALID_SIGNAL_CANDIDATE_KEY';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));

  select * into v_existing
  from public.trade_signals
  where signal_candidate_key = v_key
  for update;

  if found then
    update public.trade_signals
    set
      last_seen_at = p_observed_at,
      seen_count = seen_count + 1,
      evidence = coalesce(p_signal->'evidence', evidence)
    where id = v_existing.id
    returning * into v_saved;

    inserted := false;
    signal := to_jsonb(v_saved);
    return next;
    return;
  end if;

  insert into public.trade_signals (
    signal_candidate_key,
    symbol,
    direction,
    entry_price,
    stop_loss,
    target_price,
    risk_distance,
    risk_bps,
    risk_reward_ratio,
    entry_candle_close_time_ms,
    swing_price,
    swing_candle_close_time_ms,
    swing_age_candles,
    entry_key,
    evidence,
    first_seen_at,
    last_seen_at,
    actionable,
    execution_enabled
  ) values (
    v_key,
    p_signal->>'symbol',
    p_signal->>'direction',
    (p_signal->>'entry_price')::numeric,
    (p_signal->>'stop_loss')::numeric,
    (p_signal->>'target_price')::numeric,
    (p_signal->>'risk_distance')::numeric,
    (p_signal->>'risk_bps')::numeric,
    (p_signal->>'risk_reward_ratio')::numeric,
    (p_signal->>'entry_candle_close_time_ms')::bigint,
    (p_signal->>'swing_price')::numeric,
    (p_signal->>'swing_candle_close_time_ms')::bigint,
    (p_signal->>'swing_age_candles')::integer,
    p_signal->>'entry_key',
    coalesce(p_signal->'evidence', '{}'::jsonb),
    p_observed_at,
    p_observed_at,
    false,
    false
  )
  returning * into v_saved;

  inserted := true;
  signal := to_jsonb(v_saved);
  return next;
end;
$$;

revoke all on function public.upsert_trade_signal(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.upsert_trade_signal(jsonb, timestamptz) to service_role;
