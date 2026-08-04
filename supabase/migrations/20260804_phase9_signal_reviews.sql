begin;

create table if not exists public.signal_reviews (
  id uuid primary key default gen_random_uuid(),
  signal_candidate_key text not null references public.trade_signals(signal_candidate_key) on delete restrict,
  review_state text not null default 'PENDING' check (review_state in ('PENDING','APPROVED','REJECTED','EXPIRED')),
  reviewer text,
  reason text,
  reviewed_at timestamptz,
  expires_at timestamptz not null,
  observed_last_seen_at timestamptz not null,
  idempotency_key text not null,
  request_fingerprint text not null,
  actionable boolean not null default false check (actionable = false),
  execution_enabled boolean not null default false check (execution_enabled = false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (signal_candidate_key),
  unique (idempotency_key)
);

create table if not exists public.signal_review_audit (
  id uuid primary key default gen_random_uuid(),
  signal_candidate_key text not null references public.trade_signals(signal_candidate_key) on delete restrict,
  review_id uuid not null references public.signal_reviews(id) on delete restrict,
  action text not null check (action in ('APPROVE','REJECT','EXPIRE')),
  previous_state text not null check (previous_state in ('PENDING','APPROVED','REJECTED','EXPIRED')),
  next_state text not null check (next_state in ('PENDING','APPROVED','REJECTED','EXPIRED')),
  reviewer text,
  reason text,
  idempotency_key text not null,
  request_fingerprint text not null,
  created_at timestamptz not null default now(),
  actionable boolean not null default false check (actionable = false),
  execution_enabled boolean not null default false check (execution_enabled = false),
  unique (idempotency_key)
);

create index if not exists signal_reviews_state_expires_idx
  on public.signal_reviews (review_state, expires_at);
create index if not exists signal_review_audit_signal_created_idx
  on public.signal_review_audit (signal_candidate_key, created_at desc);

alter table public.signal_reviews enable row level security;
alter table public.signal_review_audit enable row level security;

revoke all on public.signal_reviews from anon, authenticated;
revoke all on public.signal_review_audit from anon, authenticated;

drop policy if exists signal_reviews_service_role_only on public.signal_reviews;
create policy signal_reviews_service_role_only on public.signal_reviews
  for all to service_role using (true) with check (true);

drop policy if exists signal_review_audit_service_role_only on public.signal_review_audit;
create policy signal_review_audit_service_role_only on public.signal_review_audit
  for all to service_role using (true) with check (true);

commit;
