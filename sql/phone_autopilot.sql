-- =====================================================================
-- Phone Auto-pilot (team app → Calls)
-- Applied as migration mh_12_phone_autopilot. Safe to re-run.
--
-- A SignalWire (or Twilio) phone number sends every incoming call to the `voice` Edge Function
-- (supabase/functions/voice). The function talks with the guest through Claude,
-- checks free tables, books the table once the guest confirms, and transfers the
-- call to the team phone when the guest asks for a person.
--
-- Keys live in Supabase Vault (never in this repository):
--   select vault.create_secret('<Anthropic API key>', 'anthropic_api_key');
--   select vault.create_secret('<SignalWire Signing Key>', 'phone_signing_key');  -- or a Twilio auth token as 'twilio_auth_token'
-- =====================================================================

-- Phone bookings have no website account unless the caller's number matches one
alter table public.reservations alter column user_id drop not null;
alter table public.reservations add column if not exists source text not null default 'app';
do $$ begin
  alter table public.reservations add constraint reservations_source_check check (source in ('app','phone'));
exception when duplicate_object then null; end $$;

-- Customer notifications need a customer: skip them for phone guests without an account
create or replace function public._notify(p_user uuid, p_staff boolean, p_res uuid, p_kind text, p_title text, p_body text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, for_staff, reservation_id, kind, title, body)
  select p_user, p_staff, p_res, p_kind, p_title, p_body
  where p_staff or p_user is not null
$$;
revoke execute on function public._notify(uuid, boolean, uuid, text, text, text) from public, anon, authenticated;

-- ---------- settings (team only: the transfer number is private) -------
create table if not exists public.phone_settings (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default true,              -- false: every call goes straight to the team
  team_phone text check (team_phone is null or team_phone ~ '^\+[0-9]{7,15}$'),
  language text not null default 'en' check (language in ('en','fr','ar')),
  updated_at timestamptz not null default now()
);
insert into public.phone_settings default values on conflict (id) do nothing;
alter table public.phone_settings enable row level security;
drop policy if exists "team reads phone settings" on public.phone_settings;
create policy "team reads phone settings" on public.phone_settings for select to authenticated using (public.is_staff());
drop policy if exists "team updates phone settings" on public.phone_settings;
create policy "team updates phone settings" on public.phone_settings for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ---------- the call log ----------------------------------------------
create table if not exists public.calls (
  id bigint generated always as identity primary key,
  call_sid text not null unique,
  from_number text,
  status text not null default 'live'
    check (status in ('live','booked','transferring','transferred','missed_transfer','ended','failed')),
  language text not null default 'en',
  reservation_id uuid references public.reservations(id) on delete set null,
  summary text not null default '',
  transcript jsonb not null default '[]'::jsonb,   -- [{who: 'guest'|'agent'|'system', text, at}]
  messages jsonb not null default '[]'::jsonb,     -- the Claude conversation, replayed on every turn
  context text not null default '',                -- date, menus and rules, fixed for the whole call
  pending jsonb,                                   -- a transfer waiting for its result
  silences int not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists calls_time_idx on public.calls (started_at desc);
alter table public.calls enable row level security;
drop policy if exists "team reads calls" on public.calls;
create policy "team reads calls" on public.calls for select to authenticated using (public.is_staff());
-- the team never sees the raw model conversation, only the transcript
revoke select on public.calls from anon, authenticated;
grant select (id, call_sid, from_number, status, language, reservation_id, summary, transcript, started_at, ended_at)
  on public.calls to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.calls;
exception when duplicate_object then null; end $$;

-- ---------- functions used by the voice Edge Function (service role only)

create or replace function public.voice_config()
returns json language sql stable security definer set search_path = public, vault as $$
  select json_build_object(
    'anthropic', (select decrypted_secret from vault.decrypted_secrets where name = 'anthropic_api_key'),
    'twilio',    coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'phone_signing_key'),
                          (select decrypted_secret from vault.decrypted_secrets where name = 'twilio_auth_token')),
    'enabled',   (select enabled from public.phone_settings where id = 1),
    'team_phone',(select team_phone from public.phone_settings where id = 1),
    'language',  (select language from public.phone_settings where id = 1))
$$;

-- Last 8 digits, so +961 3 123 456, 03 123456 and 961-3-123456 all match
create or replace function public._phone_key(p text) returns text
language sql immutable set search_path = public as $$
  select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 8), '')
$$;

-- Is there a table? Returns the rules and, when it doesn't fit, the best free times
create or replace function public.phone_check(p_at timestamptz, p_guests int)
returns json language plpgsql stable security definer set search_path = public as $$
declare s public.restaurant_settings; t time; need int; free int; problem text;
begin
  select * into s from public.restaurant_settings where id = 1;
  t := (p_at at time zone 'Asia/Beirut')::time;
  need := greatest(1, ceil(greatest(coalesce(p_guests, 1), 1)::numeric / s.seats_per_table))::int;
  free := s.total_tables - public._tables_used(p_at, s.sitting_minutes);
  if p_guests is null or p_guests not between 1 and 30 then problem := 'Groups of 1 to 30 guests only; for bigger groups transfer to the team.';
  elsif need > s.total_tables then problem := 'Group too large for the restaurant; transfer to the team.';
  elsif p_at < now() + interval '1 hour' then problem := 'Bookings must be at least one hour from now.';
  elsif p_at > now() + interval '90 days' then problem := 'Bookings are taken up to 90 days ahead.';
  elsif t < s.open_time or t > s.last_booking then
    problem := 'Bookings are taken from ' || to_char(s.open_time, 'HH24:MI') || ' to ' || to_char(s.last_booking, 'HH24:MI') || '.';
  elsif extract(minute from t)::int % 30 <> 0 then problem := 'Bookings start on the hour or half hour.';
  elsif free < need then problem := 'Fully booked at that time.';
  end if;
  return json_build_object(
    'available', problem is null,
    'problem', problem,
    'when', public._when(p_at),
    'tables_needed', need,
    'tables_free', greatest(free, 0),
    'suggestions', case when problem is null then '[]'::json else coalesce((
      select json_agg(to_char(x at time zone 'Asia/Beirut', 'Dy DD Mon YYYY HH24:MI'))
      from public.suggest_times(p_at, p_guests, 3) x), '[]'::json) end);
end $$;

-- Upcoming bookings for a caller (by reservation code, or by phone number)
create or replace function public.phone_lookup(p_phone text, p_code text default null)
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
      'code', r.code, 'name', r.full_name, 'guests', r.guests, 'when', public._when(r.reserved_at),
      'status', r.status, 'set_menu', m.name,
      'deposit', case when r.deposit_status in ('due','review') then '$' || r.deposit_amount || ' ' || r.deposit_status
                      when r.deposit_status = 'paid' then 'paid' end)
      order by r.reserved_at), '[]'::json)
  from public.reservations r left join public.set_menus m on m.id = r.set_menu_id
  where r.reserved_at > now() - interval '3 hours'
    and r.status in ('pending','confirmed')
    and (upper(btrim(coalesce(p_code, ''))) = r.code
         or (nullif(btrim(coalesce(p_code, '')), '') is null and public._phone_key(r.phone) = public._phone_key(p_phone)))
$$;

-- Book a table from a phone call, once the guest has confirmed the details
create or replace function public.phone_reservation(
  p_call_sid text, p_full_name text, p_phone text, p_guests int, p_at timestamptz,
  p_set_menu text default null, p_notes text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  s public.restaurant_settings;
  m public.set_menus;
  r public.reservations;
  c public.calls;
  chk json;
  uid uuid;
  total numeric(10,2) := 0;
  dep numeric(10,2) := 0;
  due timestamptz;
  need int;
  new_code text;
begin
  select * into c from public.calls where call_sid = p_call_sid for update;
  if not found then raise exception 'Unknown call.'; end if;
  if c.reservation_id is not null then
    select * into r from public.reservations where id = c.reservation_id;
    raise exception 'This call already booked %. Do not book twice.', r.code;
  end if;
  select * into s from public.restaurant_settings where id = 1;
  p_full_name := btrim(coalesce(p_full_name, ''));
  p_phone := btrim(coalesce(p_phone, ''));
  if char_length(p_full_name) not between 2 and 80 then raise exception 'Ask for the guest''s full name.'; end if;
  if p_phone !~ '^\+?[0-9 ()-]{6,20}$' then raise exception 'Ask for a valid phone number.'; end if;

  perform pg_advisory_xact_lock(hashtext('mh-capacity'));
  chk := public.phone_check(p_at, p_guests);
  if not (chk->>'available')::boolean then
    raise exception '% Suggested times: %', chk->>'problem', coalesce((select string_agg(v, ', ') from json_array_elements_text(chk->'suggestions') v), 'none');
  end if;
  need := (chk->>'tables_needed')::int;

  -- link to the guest's website account when exactly one account has this number
  select min(p.id::text)::uuid into uid from public.profiles p
  where public._phone_key(p.phone) = public._phone_key(p_phone)
  having count(*) = 1;
  if (select count(*) from public.reservations
      where public._phone_key(phone) = public._phone_key(p_phone) and status in ('pending','confirmed') and reserved_at > now()) >= 5 then
    raise exception 'This number already has 5 upcoming reservations; transfer to the team.';
  end if;

  if nullif(p_set_menu, '') is not null then
    select * into m from public.set_menus where (id = p_set_menu or lower(name) = lower(p_set_menu)) and active;
    if not found then raise exception 'That set menu is not available.'; end if;
    total := m.price * p_guests;
  end if;
  if s.deposit_percent > 0 and total > s.deposit_threshold then
    dep := round(total * s.deposit_percent / 100, 2);
    due := greatest(least(now() + interval '24 hours', p_at - interval '2 hours'), now() + interval '30 minutes');
  end if;

  loop
    new_code := 'MH-' || array_to_string(array(
      select substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1)
      from generate_series(1, 6)), '');
    exit when not exists (select 1 from public.reservations where code = new_code);
  end loop;

  insert into public.reservations (code, user_id, source, full_name, phone, guests, tables_needed, reserved_at, set_menu_id,
    set_menu_total, deposit_amount, deposit_status, deposit_due, notes)
  values (new_code, uid, 'phone', p_full_name, p_phone, p_guests, need, p_at, m.id,
    total, dep, case when dep > 0 then 'due' else 'none' end, due, public._clean(p_notes, 500))
  returning * into r;
  update public.calls set reservation_id = r.id, status = 'booked' where id = c.id;

  perform public._notify(null, true, r.id, 'new', 'New phone reservation ' || r.code,
    r.full_name || ' · ' || r.phone || ' · ' || r.guests || ' guest(s), ' || need || ' table(s) · ' || public._when(r.reserved_at)
    || coalesce(' · ' || m.name || ' ($' || total || ')', ' · no set menu')
    || case when dep > 0 then ' · deposit $' || dep || ' due ' || public._when(due) else '' end
    || coalesce(' · Note: ' || r.notes, '') || ' · booked by the phone Auto-pilot');
  perform public._log(r.id, 'phone_booked', 'Booked ' || r.code || ' by phone for ' || r.full_name || ', '
    || r.guests || ' guest(s) on ' || public._when(r.reserved_at) || '.');
  if uid is not null then
    perform public._notify(uid, false, r.id, 'new', 'Reservation received — ' || r.code,
      'We booked your table by phone for ' || r.guests || ' on ' || public._when(r.reserved_at) || '.');
    if dep > 0 then
      perform public._notify(uid, false, r.id, 'deposit_due', 'Deposit due — $' || dep,
        'Please pay the $' || dep || ' deposit for ' || r.code || ' before ' || public._when(due)
        || ', or the reservation is cancelled automatically. Put ' || r.code || ' in the payment reference.');
    end if;
  end if;

  perform public._autopilot_try_confirm(r.id);
  select * into r from public.reservations where id = r.id;
  return json_build_object('code', r.code, 'status', r.status, 'when', public._when(r.reserved_at),
    'guests', r.guests, 'set_menu', m.name, 'set_menu_total', total,
    'deposit', dep, 'deposit_due', case when dep > 0 then public._when(due) end,
    'linked_account', uid is not null);
end $$;

-- Tell the team about a transfer, or a transfer nobody answered
create or replace function public.phone_event(p_call_sid text, p_kind text, p_detail text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.calls;
begin
  select * into c from public.calls where call_sid = p_call_sid;
  if not found then return; end if;
  if p_kind = 'transfer' then
    perform public._notify(null, true, c.reservation_id, 'call', 'Incoming call transfer — ' || coalesce(c.from_number, 'unknown number'),
      coalesce(nullif(p_detail, ''), 'The guest asked to talk to the team.'));
    perform public._log(c.reservation_id, 'call_transfer', 'Call from ' || coalesce(c.from_number, 'unknown number') || ' transferred: ' || coalesce(p_detail, ''));
  elsif p_kind = 'missed' then
    perform public._notify(null, true, c.reservation_id, 'call', 'Missed call transfer — call back ' || coalesce(c.from_number, 'the guest'),
      coalesce(nullif(p_detail, ''), 'Nobody answered the transfer.'));
    perform public._log(c.reservation_id, 'call_missed', 'Nobody answered the transfer from ' || coalesce(c.from_number, 'unknown number') || '.');
  end if;
end $$;

revoke execute on function public.voice_config() from public, anon, authenticated;
revoke execute on function public._phone_key(text) from public, anon, authenticated;
revoke execute on function public.phone_check(timestamptz, int) from public, anon, authenticated;
revoke execute on function public.phone_lookup(text, text) from public, anon, authenticated;
revoke execute on function public.phone_reservation(text, text, text, int, timestamptz, text, text) from public, anon, authenticated;
revoke execute on function public.phone_event(text, text, text) from public, anon, authenticated;
grant execute on function public.voice_config() to service_role;
grant execute on function public._phone_key(text) to service_role;
grant execute on function public.phone_check(timestamptz, int) to service_role;
grant execute on function public.phone_lookup(text, text) to service_role;
grant execute on function public.phone_reservation(text, text, text, int, timestamptz, text, text) to service_role;
grant execute on function public.phone_event(text, text, text) to service_role;
