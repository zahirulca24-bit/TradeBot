begin;

create or replace function public.review_trade_signal(
  p_signal_candidate_key text,
  p_action text,
  p_reviewer text,
  p_reason text,
  p_observed_last_seen_at timestamptz,
  p_expires_at timestamptz,
  p_idempotency_key text,
  p_request_fingerprint text
)
returns table (
  replayed boolean,
  review public.signal_reviews,
  audit public.signal_review_audit
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_signal public.trade_signals;
  v_review public.signal_reviews;
  v_audit public.signal_review_audit;
  v_next_state text;
begin
  if p_action not in ('APPROVE','REJECT') then
    raise exception 'INVALID_SIGNAL_REVIEW_ACTION';
  end if;

  select * into v_audit
  from public.signal_review_audit
  where idempotency_key = p_idempotency_key;

  if found then
    if v_audit.request_fingerprint <> p_request_fingerprint then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT';
    end if;
    select * into v_review from public.signal_reviews where id = v_audit.review_id;
    return query select true, v_review, v_audit;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_signal_candidate_key, 0));

  select * into v_signal
  from public.trade_signals
  where signal_candidate_key = p_signal_candidate_key;
  if not found then raise exception 'SIGNAL_NOT_FOUND'; end if;

  if v_signal.last_seen_at <> p_observed_last_seen_at then
    raise exception 'SIGNAL_VERSION_CONFLICT';
  end if;
  if now() >= p_expires_at then raise exception 'STALE_SIGNAL_REVIEW_BLOCKED'; end if;

  insert into public.signal_reviews (
    signal_candidate_key, review_state, reviewer, reason, reviewed_at,
    expires_at, observed_last_seen_at, idempotency_key, request_fingerprint,
    actionable, execution_enabled
  ) values (
    p_signal_candidate_key, 'PENDING', null, null, null,
    p_expires_at, p_observed_last_seen_at, p_idempotency_key, p_request_fingerprint,
    false, false
  )
  on conflict (signal_candidate_key) do nothing;

  select * into v_review
  from public.signal_reviews
  where signal_candidate_key = p_signal_candidate_key
  for update;

  if v_review.review_state <> 'PENDING' then raise exception 'SIGNAL_ALREADY_REVIEWED'; end if;
  v_next_state := case when p_action = 'APPROVE' then 'APPROVED' else 'REJECTED' end;

  update public.signal_reviews
  set review_state = v_next_state,
      reviewer = p_reviewer,
      reason = p_reason,
      reviewed_at = now(),
      idempotency_key = p_idempotency_key,
      request_fingerprint = p_request_fingerprint,
      updated_at = now(),
      actionable = false,
      execution_enabled = false
  where id = v_review.id
  returning * into v_review;

  insert into public.signal_review_audit (
    signal_candidate_key, review_id, action, previous_state, next_state,
    reviewer, reason, idempotency_key, request_fingerprint,
    actionable, execution_enabled
  ) values (
    p_signal_candidate_key, v_review.id, p_action, 'PENDING', v_next_state,
    p_reviewer, p_reason, p_idempotency_key, p_request_fingerprint,
    false, false
  ) returning * into v_audit;

  return query select false, v_review, v_audit;
end;
$$;

revoke all on function public.review_trade_signal(text,text,text,text,timestamptz,timestamptz,text,text) from public, anon, authenticated;
grant execute on function public.review_trade_signal(text,text,text,text,timestamptz,timestamptz,text,text) to service_role;

commit;
