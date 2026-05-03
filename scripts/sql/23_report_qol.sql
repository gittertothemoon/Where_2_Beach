-- Reporting QoL fixes:
--   1. confirm_beach_report() now returns the awarded points and the new
--      balance for the confirmer, so the client can show "+1 pt — grazie!".
--   2. beach_reports.cooldown_reminded_at lets a cron mark when a user has
--      been pinged that they can submit a fresh report (1h after their last).

-- ── 1. Replace confirm_beach_report so it returns confirmer rewards ───────
create or replace function public.confirm_beach_report(
  p_confirmer_id uuid,
  p_report_id    uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter_id     uuid;
  v_expires_at      timestamptz;
  v_confirmer_award integer := 1;
  v_new_balance     integer;
begin
  select user_id, expires_at
    into v_reporter_id, v_expires_at
    from public.beach_reports
    where id = p_report_id
      and expires_at > now();

  if v_reporter_id is null then
    return jsonb_build_object('ok', false, 'error', 'report_not_found');
  end if;

  if v_reporter_id = p_confirmer_id then
    return jsonb_build_object('ok', false, 'error', 'cannot_confirm_own_report');
  end if;

  if exists (
    select 1 from public.report_confirmations
    where report_id = p_report_id and user_id = p_confirmer_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_confirmed');
  end if;

  insert into public.report_confirmations (report_id, user_id)
    values (p_report_id, p_confirmer_id);

  update public.beach_reports
    set confirmation_count = confirmation_count + 1,
        expires_at = greatest(expires_at, now()) + interval '15 minutes'
    where id = p_report_id;

  insert into public.user_points_balances (user_id)
    values (v_reporter_id), (p_confirmer_id)
    on conflict (user_id) do nothing;

  if v_reporter_id != p_confirmer_id then
    insert into public.points_ledger (user_id, points_delta, reason)
      values (v_reporter_id, 2, 'report_confirmed');

    update public.user_points_balances
      set points_balance = points_balance + 2,
          points_earned  = points_earned + 2,
          updated_at     = now()
      where user_id = v_reporter_id;
  end if;

  insert into public.points_ledger (user_id, points_delta, reason)
    values (p_confirmer_id, v_confirmer_award, 'report_confirmation');

  update public.user_points_balances
    set points_balance = points_balance + v_confirmer_award,
        points_earned  = points_earned + v_confirmer_award,
        updated_at     = now()
    where user_id = p_confirmer_id
    returning points_balance into v_new_balance;

  return jsonb_build_object(
    'ok', true,
    'awarded_points', v_confirmer_award,
    'points_balance', v_new_balance
  );
end;
$$;

-- ── 2. Cooldown reminder column ───────────────────────────────────────────
alter table public.beach_reports
  add column if not exists cooldown_reminded_at timestamptz;

-- Partial index speeds up the cron query: only reports that have NOT yet
-- triggered a reminder need scanning, and only those past a recent cutoff.
create index if not exists beach_reports_cooldown_pending_idx
  on public.beach_reports (user_id, created_at desc)
  where cooldown_reminded_at is null;
