-- =====================================================================
-- Maison Hamra — database schema
-- Run once in Supabase: SQL Editor > New query > paste > Run
--
-- Security model
--   * Every table has row level security on.
--   * Customers can read only their own profile, reservations,
--     notifications and feedback. They never write those tables directly:
--     every change goes through the functions below, which check who is
--     calling and what they are allowed to do.
--   * Team members are listed in public.staff. Add one with:
--       insert into public.staff (user_id)
--       select id from auth.users where email = 'team@example.com';
-- =====================================================================

create extension if not exists pg_cron;

-- ---------- profiles --------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null check (char_length(full_name) between 2 and 80),
  phone      text check (phone ~ '^\+?[0-9 ()-]{6,20}$'),
  email      text,
  no_shows   int  not null default 0,   -- booked but did not come
  unpaid     int  not null default 0,   -- deposit never paid (auto-cancelled)
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create table if not exists public.staff (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.staff enable row level security;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid())
$$;

drop policy if exists "own staff row" on public.staff;
create policy "own staff row" on public.staff for select to authenticated using (user_id = auth.uid());

drop policy if exists "read own profile or staff" on public.profiles;
create policy "read own profile or staff" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- customers may edit their name and phone, never their counters
revoke update on public.profiles from anon, authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, email)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
    nullif(btrim(new.raw_user_meta_data->>'phone'), ''),
    new.email
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- set menus (prices live here so the deposit can't be faked) ----
create table if not exists public.set_menus (
  id          text primary key,
  name        text not null,
  courses     text not null,
  price       numeric(10,2) not null check (price > 0),   -- per person, USD
  sort        int  not null default 0,
  active      boolean not null default true
);
alter table public.set_menus enable row level security;
drop policy if exists "anyone reads set menus" on public.set_menus;
create policy "anyone reads set menus" on public.set_menus for select to anon, authenticated using (active);

insert into public.set_menus (id, name, courses, price, sort) values
  ('bistro',      'Menu Bistro',      'Soupe à l''oignon · Steak frites · Crème brûlée', 32, 1),
  ('parisien',    'Menu Parisien',    'Escargots or salade de chèvre · Poulet rôti or saumon · Tarte Tatin', 45, 2),
  ('mezza',       'Mezza à la française', 'Eight sharing plates for the table · Mini pastries', 28, 3),
  ('degustation', 'Menu Dégustation', 'Six-course tasting menu chosen by the chef', 75, 4)
on conflict (id) do update set name = excluded.name, courses = excluded.courses, price = excluded.price, sort = excluded.sort;

-- ---------- reservations ---------------------------------------------
create table if not exists public.reservations (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  user_id           uuid not null references auth.users(id) on delete cascade,
  full_name         text not null,
  phone             text not null,
  guests            int  not null check (guests between 1 and 30),
  reserved_at       timestamptz not null,
  set_menu_id       text references public.set_menus(id),
  set_menu_total    numeric(10,2) not null default 0,
  deposit_amount    numeric(10,2) not null default 0,
  deposit_status    text not null default 'none'
                    check (deposit_status in ('none','due','review','paid','expired')),
  deposit_due       timestamptz,
  deposit_warned    boolean not null default false,
  payment_method    text check (payment_method in ('card','bank','whish')),
  payment_ref       text,
  status            text not null default 'pending'
                    check (status in ('pending','confirmed','cancelled','completed','no_show')),
  cancelled_by      text check (cancelled_by in ('customer','team','system')),
  cancel_reason     text,
  cancelled_at      timestamptz,
  notes             text,
  reminder_sent_on  date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists reservations_user_idx on public.reservations (user_id);
create index if not exists reservations_time_idx on public.reservations (reserved_at);
alter table public.reservations enable row level security;
drop policy if exists "read own reservations or staff" on public.reservations;
create policy "read own reservations or staff" on public.reservations for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
-- no insert / update / delete policies: all changes go through the functions below

-- ---------- notifications --------------------------------------------
create table if not exists public.notifications (
  id             bigint generated always as identity primary key,
  user_id        uuid references auth.users(id) on delete cascade,  -- customer, or null for the team
  for_staff      boolean not null default false,
  reservation_id uuid references public.reservations(id) on delete cascade,
  kind           text not null,   -- new, confirmed, cancelled, deposit_due, deposit_warning, paid, reminder, no_show, feedback
  title          text not null,
  body           text not null,
  read_at        timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "read own notifications" on public.notifications;
create policy "read own notifications" on public.notifications for select to authenticated
  using (user_id = auth.uid() or (for_staff and public.is_staff()));

-- ---------- reviews ---------------------------------------------------
create table if not exists public.reviews (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author     text not null default '',
  rating     int  not null check (rating between 1 and 5),
  body       text not null check (char_length(body) between 2 and 600),
  created_at timestamptz not null default now()
);
alter table public.reviews enable row level security;
drop policy if exists "anyone reads reviews" on public.reviews;
create policy "anyone reads reviews" on public.reviews for select to anon, authenticated using (true);
drop policy if exists "signed-in users post" on public.reviews;
create policy "signed-in users post" on public.reviews for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "delete own or staff" on public.reviews;
create policy "delete own or staff" on public.reviews for delete to authenticated using (user_id = auth.uid() or public.is_staff());

create or replace function public.before_review() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.created_at := now();
  new.body := btrim(new.body);
  select split_part(full_name, ' ', 1) || coalesce(' ' || left(nullif(split_part(full_name, ' ', 2), ''), 1) || '.', '')
    into new.author from public.profiles where id = new.user_id;
  if (select count(*) from public.reviews where user_id = new.user_id and created_at > now() - interval '1 day') >= 3 then
    raise exception 'You can post up to 3 reviews a day.';
  end if;
  return new;
end $$;
drop trigger if exists review_defaults on public.reviews;
create trigger review_defaults before insert on public.reviews for each row execute function public.before_review();

-- ---------- after-visit feedback -------------------------------------
create table if not exists public.feedback (
  id             bigint generated always as identity primary key,
  reservation_id uuid not null unique references public.reservations(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  rating         int  not null check (rating between 1 and 5),
  loved          text,
  dislike_service text,
  dislike_food   text,
  dislike_place  text,
  dislike_other  text,
  created_at     timestamptz not null default now()
);
alter table public.feedback enable row level security;
drop policy if exists "read own feedback or staff" on public.feedback;
create policy "read own feedback or staff" on public.feedback for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

-- =====================================================================
-- Functions the app calls
-- =====================================================================

create or replace function public._notify(p_user uuid, p_staff boolean, p_res uuid, p_kind text, p_title text, p_body text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, for_staff, reservation_id, kind, title, body)
  values (p_user, p_staff, p_res, p_kind, p_title, p_body)
$$;

create or replace function public._when(t timestamptz) returns text
language sql immutable as $$ select to_char(t at time zone 'Asia/Beirut', 'Dy DD Mon YYYY "at" HH24:MI') $$;

create or replace function public._clean(t text, maxlen int) returns text
language sql immutable as $$ select nullif(left(btrim(coalesce(t, '')), maxlen), '') $$;

-- New reservation ------------------------------------------------------
create or replace function public.create_reservation(
  p_full_name text, p_phone text, p_guests int, p_at timestamptz,
  p_set_menu text default null, p_notes text default null)
returns public.reservations
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  m public.set_menus;
  r public.reservations;
  total numeric(10,2) := 0;
  dep numeric(10,2) := 0;
  due timestamptz;
  t time;
  new_code text;
  details text;
begin
  if uid is null then raise exception 'Please sign in to reserve.'; end if;
  p_full_name := btrim(coalesce(p_full_name, ''));
  p_phone := btrim(coalesce(p_phone, ''));
  if char_length(p_full_name) not between 2 and 80 then raise exception 'Enter your full name.'; end if;
  if p_phone !~ '^\+?[0-9 ()-]{6,20}$' then raise exception 'Enter a valid phone number.'; end if;
  if p_guests is null or p_guests not between 1 and 30 then raise exception 'Guests must be between 1 and 30.'; end if;
  if p_at is null or p_at < now() + interval '1 hour' then raise exception 'Choose a time at least one hour from now.'; end if;
  if p_at > now() + interval '90 days' then raise exception 'We take reservations up to 90 days ahead.'; end if;
  t := (p_at at time zone 'Asia/Beirut')::time;
  if t < time '12:00' or t > time '23:00' then raise exception 'We take reservations between 12:00 and 23:00.'; end if;
  if (select count(*) from public.reservations
      where user_id = uid and status in ('pending','confirmed') and reserved_at > now()) >= 5 then
    raise exception 'You already have 5 upcoming reservations.';
  end if;

  if nullif(p_set_menu, '') is not null then
    select * into m from public.set_menus where id = p_set_menu and active;
    if not found then raise exception 'That set menu is not available.'; end if;
    total := m.price * p_guests;
  end if;
  -- set menus over $100 need a 30% deposit
  if total > 100 then
    dep := round(total * 0.30, 2);
    due := greatest(least(now() + interval '24 hours', p_at - interval '2 hours'), now() + interval '30 minutes');
  end if;

  loop
    new_code := 'MH-' || array_to_string(array(
      select substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1)
      from generate_series(1, 6)), '');
    exit when not exists (select 1 from public.reservations where code = new_code);
  end loop;

  insert into public.reservations (code, user_id, full_name, phone, guests, reserved_at, set_menu_id,
    set_menu_total, deposit_amount, deposit_status, deposit_due, notes)
  values (new_code, uid, p_full_name, p_phone, p_guests, p_at, m.id,
    total, dep, case when dep > 0 then 'due' else 'none' end, due, public._clean(p_notes, 500))
  returning * into r;

  details := r.full_name || ' · ' || r.phone || ' · ' || r.guests || ' guest(s) · ' || public._when(r.reserved_at)
    || coalesce(' · ' || m.name || ' ($' || total || ')', '')
    || case when dep > 0 then ' · deposit $' || dep || ' due ' || public._when(due) else '' end
    || coalesce(' · Note: ' || r.notes, '');

  perform public._notify(null, true, r.id, 'new', 'New reservation ' || r.code, details);
  perform public._notify(uid, false, r.id, 'new', 'Reservation received — ' || r.code,
    'We received your request for ' || r.guests || ' on ' || public._when(r.reserved_at)
    || '. The team will confirm it shortly.');
  if dep > 0 then
    perform public._notify(uid, false, r.id, 'deposit_due', 'Deposit due — $' || dep,
      'Please pay the $' || dep || ' deposit for ' || r.code || ' before ' || public._when(due)
      || ', or the reservation is cancelled automatically.');
  end if;
  return r;
end $$;

-- Cancel (customer or team) -------------------------------------------
create or replace function public.cancel_reservation(p_id uuid, p_reason text default null)
returns public.reservations
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r public.reservations;
  who text;
begin
  select * into r from public.reservations where id = p_id for update;
  if not found then raise exception 'Reservation not found.'; end if;
  if r.user_id = uid then who := 'customer';
  elsif public.is_staff() then who := 'team';
  else raise exception 'Not allowed.'; end if;
  if r.status not in ('pending','confirmed') then raise exception 'This reservation can no longer be cancelled.'; end if;

  update public.reservations set status = 'cancelled', cancelled_by = who, cancelled_at = now(),
    cancel_reason = public._clean(p_reason, 300),
    deposit_status = case when deposit_status in ('due','review') then 'none' else deposit_status end,
    updated_at = now()
  where id = p_id returning * into r;

  perform public._notify(null, true, r.id, 'cancelled', 'Cancelled by ' || who || ' — ' || r.code,
    r.full_name || ' · ' || r.phone || ' · ' || r.guests || ' guest(s) · ' || public._when(r.reserved_at)
    || coalesce(' · Reason: ' || r.cancel_reason, ''));
  perform public._notify(r.user_id, false, r.id, 'cancelled', 'Reservation cancelled — ' || r.code,
    case when who = 'customer' then 'You cancelled your reservation for ' else 'The restaurant cancelled your reservation for ' end
    || public._when(r.reserved_at) || '.' || coalesce(' Reason: ' || r.cancel_reason, '')
    || case when r.deposit_status = 'paid' then ' Our team will contact you about your deposit.' else '' end);
  return r;
end $$;

-- Team approves --------------------------------------------------------
create or replace function public.confirm_reservation(p_id uuid)
returns public.reservations
language plpgsql security definer set search_path = public as $$
declare r public.reservations;
begin
  if not public.is_staff() then raise exception 'Team only.'; end if;
  update public.reservations set status = 'confirmed', updated_at = now()
    where id = p_id and status = 'pending' returning * into r;
  if not found then raise exception 'Only pending reservations can be confirmed.'; end if;
  perform public._notify(r.user_id, false, r.id, 'confirmed', 'Reservation confirmed — ' || r.code,
    'See you on ' || public._when(r.reserved_at) || ', table for ' || r.guests || '.'
    || case when r.deposit_status = 'due' then ' Remember to pay your $' || r.deposit_amount || ' deposit before ' || public._when(r.deposit_due) || '.' else '' end);
  return r;
end $$;

-- Customer says they paid the deposit ---------------------------------
create or replace function public.report_payment(p_id uuid, p_method text, p_ref text)
returns public.reservations
language plpgsql security definer set search_path = public as $$
declare r public.reservations;
begin
  if p_method not in ('card','bank','whish') then raise exception 'Choose a payment method.'; end if;
  if public._clean(p_ref, 80) is null then raise exception 'Enter the payment reference or receipt number.'; end if;
  update public.reservations set deposit_status = 'review', payment_method = p_method,
    payment_ref = public._clean(p_ref, 80), updated_at = now()
    where id = p_id and user_id = auth.uid() and deposit_status = 'due' and status in ('pending','confirmed')
    returning * into r;
  if not found then raise exception 'This deposit is not waiting for payment.'; end if;
  perform public._notify(null, true, r.id, 'paid', 'Deposit to verify — ' || r.code,
    r.full_name || ' reports paying $' || r.deposit_amount || ' by ' || p_method || ' · ref ' || r.payment_ref);
  perform public._notify(r.user_id, false, r.id, 'paid', 'Payment received for review — ' || r.code,
    'Thank you. The team will verify your $' || r.deposit_amount || ' deposit shortly.');
  return r;
end $$;

-- Team verifies (or rejects) a deposit --------------------------------
create or replace function public.verify_deposit(p_id uuid, p_ok boolean)
returns public.reservations
language plpgsql security definer set search_path = public as $$
declare r public.reservations;
begin
  if not public.is_staff() then raise exception 'Team only.'; end if;
  update public.reservations set
    deposit_status = case when p_ok then 'paid' else 'due' end,
    deposit_due = case when p_ok then deposit_due else greatest(deposit_due, now() + interval '2 hours') end,
    updated_at = now()
    where id = p_id and deposit_status in ('due','review') and status in ('pending','confirmed')
    returning * into r;
  if not found then raise exception 'No deposit to verify on this reservation.'; end if;
  perform public._notify(r.user_id, false, r.id, 'paid',
    case when p_ok then 'Deposit confirmed — ' || r.code else 'Deposit not found — ' || r.code end,
    case when p_ok then 'Your $' || r.deposit_amount || ' deposit is confirmed. Thank you!'
         else 'We could not find your payment. Please check the details and pay before ' || public._when(r.deposit_due) || '.' end);
  return r;
end $$;

-- Team: did the guest come? -------------------------------------------
create or replace function public.mark_attendance(p_id uuid, p_came boolean)
returns public.reservations
language plpgsql security definer set search_path = public as $$
declare r public.reservations;
begin
  if not public.is_staff() then raise exception 'Team only.'; end if;
  update public.reservations set status = case when p_came then 'completed' else 'no_show' end, updated_at = now()
    where id = p_id and status in ('pending','confirmed') and reserved_at <= now() + interval '1 hour'
    returning * into r;
  if not found then raise exception 'Attendance can be marked from one hour before the reservation.'; end if;
  if p_came then
    perform public._notify(r.user_id, false, r.id, 'feedback', 'Merci for dining with us!',
      'How was your visit? Tap here to tell us what you loved and what we can do better.');
  else
    update public.profiles set no_shows = no_shows + 1 where id = r.user_id;
    perform public._notify(r.user_id, false, r.id, 'no_show', 'We missed you — ' || r.code,
      'You did not arrive for your reservation on ' || public._when(r.reserved_at)
      || '. If something came up, please let us know. Repeated no-shows may limit future bookings.');
  end if;
  return r;
end $$;

-- Customer feedback after a completed visit ---------------------------
create or replace function public.submit_feedback(p_id uuid, p_rating int, p_loved text,
  p_service text, p_food text, p_place text, p_other text)
returns void
language plpgsql security definer set search_path = public as $$
declare r public.reservations;
begin
  select * into r from public.reservations where id = p_id and user_id = auth.uid();
  if not found or r.status <> 'completed' then raise exception 'Feedback opens after your visit.'; end if;
  if p_rating not between 1 and 5 then raise exception 'Choose a rating from 1 to 5.'; end if;
  insert into public.feedback (reservation_id, user_id, rating, loved, dislike_service, dislike_food, dislike_place, dislike_other)
  values (p_id, r.user_id, p_rating, public._clean(p_loved, 800), public._clean(p_service, 800),
    public._clean(p_food, 800), public._clean(p_place, 800), public._clean(p_other, 800));
  perform public._notify(null, true, r.id, 'feedback', 'New feedback — ' || r.code || ' (' || p_rating || '/5)',
    r.full_name || coalesce(' loved: ' || public._clean(p_loved, 120), ' left feedback.'));
exception when unique_violation then
  raise exception 'You already sent feedback for this visit. Merci!';
end $$;

-- Mark notifications read ---------------------------------------------
create or replace function public.mark_read(p_ids bigint[])
returns void
language sql security definer set search_path = public as $$
  update public.notifications set read_at = now()
  where id = any(p_ids) and read_at is null
    and (user_id = auth.uid() or (for_staff and public.is_staff()))
$$;

-- =====================================================================
-- Scheduled jobs
-- =====================================================================

-- Every morning: remind the customer and the team about today's tables
create or replace function public.run_daily_reminders() returns void
language plpgsql security definer set search_path = public as $$
declare r public.reservations; today date := (now() at time zone 'Asia/Beirut')::date;
begin
  for r in select * from public.reservations
    where status in ('pending','confirmed')
      and (reserved_at at time zone 'Asia/Beirut')::date = today
      and reminder_sent_on is distinct from today
  loop
    perform public._notify(r.user_id, false, r.id, 'reminder', 'Today: your table at ' || to_char(r.reserved_at at time zone 'Asia/Beirut', 'HH24:MI'),
      'Reservation ' || r.code || ' for ' || r.guests || '. The team will call you to finalise it — you can also call us on +961 00 000 000.');
    perform public._notify(null, true, r.id, 'reminder', 'Today ' || to_char(r.reserved_at at time zone 'Asia/Beirut', 'HH24:MI') || ' — ' || r.code,
      r.full_name || ' · ' || r.phone || ' · ' || r.guests || ' guest(s) · status ' || r.status
      || case when r.deposit_status in ('due','review') then ' · deposit ' || r.deposit_status else '' end
      || '. Call to give the final approval.');
    update public.reservations set reminder_sent_on = today where id = r.id;
  end loop;
end $$;

-- Every 10 minutes: warn about deposits due soon, cancel unpaid ones
create or replace function public.process_deposits() returns void
language plpgsql security definer set search_path = public as $$
declare r public.reservations;
begin
  for r in update public.reservations set deposit_warned = true
    where deposit_status = 'due' and status in ('pending','confirmed') and not deposit_warned
      and deposit_due <= now() + interval '2 hours' and deposit_due > now()
    returning *
  loop
    perform public._notify(r.user_id, false, r.id, 'deposit_warning', 'Deposit due soon — ' || r.code,
      'Your $' || r.deposit_amount || ' deposit must be paid before ' || public._when(r.deposit_due)
      || ' or the reservation is cancelled.');
  end loop;

  for r in update public.reservations set status = 'cancelled', cancelled_by = 'system', cancelled_at = now(),
      cancel_reason = 'Deposit not paid in time', deposit_status = 'expired', updated_at = now()
    where deposit_status = 'due' and status in ('pending','confirmed') and deposit_due <= now()
    returning *
  loop
    update public.profiles set unpaid = unpaid + 1 where id = r.user_id;
    perform public._notify(r.user_id, false, r.id, 'cancelled', 'Reservation cancelled — ' || r.code,
      'The $' || r.deposit_amount || ' deposit was not paid in time, so the reservation was cancelled.');
    perform public._notify(null, true, r.id, 'cancelled', 'Auto-cancelled (unpaid) — ' || r.code,
      r.full_name || ' · ' || r.phone || ' did not pay the $' || r.deposit_amount || ' deposit.');
  end loop;
end $$;

-- Who may call what ------------------------------------------------------
revoke execute on function public._notify(uuid, boolean, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.run_daily_reminders() from public, anon, authenticated;
revoke execute on function public.process_deposits() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.before_review() from public, anon, authenticated;
revoke execute on function public.create_reservation(text, text, int, timestamptz, text, text) from public, anon;
revoke execute on function public.cancel_reservation(uuid, text) from public, anon;
revoke execute on function public.confirm_reservation(uuid) from public, anon;
revoke execute on function public.report_payment(uuid, text, text) from public, anon;
revoke execute on function public.verify_deposit(uuid, boolean) from public, anon;
revoke execute on function public.mark_attendance(uuid, boolean) from public, anon;
revoke execute on function public.submit_feedback(uuid, int, text, text, text, text, text) from public, anon;
revoke execute on function public.mark_read(bigint[]) from public, anon;
grant execute on function public.create_reservation(text, text, int, timestamptz, text, text) to authenticated;
grant execute on function public.cancel_reservation(uuid, text) to authenticated;
grant execute on function public.confirm_reservation(uuid) to authenticated;
grant execute on function public.report_payment(uuid, text, text) to authenticated;
grant execute on function public.verify_deposit(uuid, boolean) to authenticated;
grant execute on function public.mark_attendance(uuid, boolean) to authenticated;
grant execute on function public.submit_feedback(uuid, int, text, text, text, text, text) to authenticated;
grant execute on function public.mark_read(bigint[]) to authenticated;

-- 08:00 Beirut (05:00 UTC in summer) and every 10 minutes
select cron.unschedule(jobname) from cron.job where jobname in ('mh-daily-reminders', 'mh-deposits');
select cron.schedule('mh-daily-reminders', '0 5 * * *', 'select public.run_daily_reminders()');
select cron.schedule('mh-deposits', '*/10 * * * *', 'select public.process_deposits()');

-- Live updates for the notification bell and the team dashboard
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.reservations;
exception when duplicate_object then null; end $$;

-- Hardening (Supabase security advisor)
alter function public._when(timestamptz) set search_path = public;
alter function public._clean(text, int) set search_path = public;
revoke execute on function public._when(timestamptz) from public, anon, authenticated;
revoke execute on function public._clean(text, int) from public, anon, authenticated;
revoke execute on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

-- =====================================================================
-- Web Push: phone alerts even when the app is closed
--   1. Every new row in notifications fires notifications_push, which calls
--      the `push` Edge Function (supabase/functions/push) through pg_net.
--   2. The function looks up the customer's (or all staff members') phone
--      subscriptions and sends the alert with the VAPID keys.
--   Keys live in Supabase Vault — create them once (never commit them):
--     select vault.create_secret('<VAPID public key>',  'vapid_public');
--     select vault.create_secret('<VAPID private key>', 'vapid_private');
--     select vault.create_secret('<random string>',     'push_hook_secret');
--   (generate VAPID keys with: npx web-push generate-vapid-keys)
-- =====================================================================
create extension if not exists pg_net;

create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  app text not null default 'customer' check (app in ('customer','team')),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id, app);
alter table public.push_subscriptions enable row level security;
drop policy if exists "read own push subscriptions" on public.push_subscriptions;
create policy "read own push subscriptions" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_app text default 'customer')
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  if p_app not in ('customer','team') then raise exception 'Unknown app.'; end if;
  if p_app = 'team' and not public.is_staff() then raise exception 'Team only.'; end if;
  if p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000 or char_length(p_p256dh) > 200 or char_length(p_auth) > 100 then
    raise exception 'Invalid subscription.';
  end if;
  insert into public.push_subscriptions (user_id, app, endpoint, p256dh, auth)
  values (auth.uid(), p_app, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, app = excluded.app,
    p256dh = excluded.p256dh, auth = excluded.auth, updated_at = now();
end $$;

create or replace function public.remove_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid()
$$;

create or replace function public.push_config()
returns json language sql stable security definer set search_path = public, vault as $$
  select json_build_object(
    'public',  (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public'),
    'private', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private'),
    'hook',    (select decrypted_secret from vault.decrypted_secrets where name = 'push_hook_secret'),
    'subject', 'mailto:abbassakar365@gmail.com',
    'site',    'https://abbassakar365.github.io/Maison-restaurant-/')
$$;

create or replace function public._push_hook() returns trigger
language plpgsql security definer set search_path = public, vault, net as $$
declare secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_hook_secret';
  if secret is null then return new; end if;
  perform net.http_post(
    url := 'https://efwqkllaultepxprwert.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret),
    body := jsonb_build_object('id', new.id),
    timeout_milliseconds := 5000);
  return new;
end $$;
drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push after insert on public.notifications
  for each row execute function public._push_hook();

revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
revoke execute on function public.remove_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.remove_push_subscription(text) to authenticated;
revoke execute on function public.push_config() from public, anon, authenticated;
grant execute on function public.push_config() to service_role;
revoke execute on function public._push_hook() from public, anon, authenticated;

-- =====================================================================
-- Restaurant settings (edited in the team app → Settings), table capacity,
-- and the team-editable menu with photos.
-- The live create_reservation (capacity + settings-based deposit) replaces the
-- earlier version above; see supabase migrations mh_09a–mh_09d.
-- =====================================================================
create table if not exists public.restaurant_settings (
  id int primary key default 1 check (id = 1),
  total_tables int not null default 25 check (total_tables between 1 and 500),
  seats_per_table int not null default 4 check (seats_per_table between 1 and 20),
  sitting_minutes int not null default 120 check (sitting_minutes between 30 and 360),
  open_time time not null default '12:00',
  last_booking time not null default '23:00',
  deposit_threshold numeric(10,2) not null default 300 check (deposit_threshold >= 0),
  deposit_percent numeric(5,2) not null default 25 check (deposit_percent between 0 and 100),
  updated_at timestamptz not null default now(),
  check (last_booking > open_time)
);
insert into public.restaurant_settings default values on conflict (id) do nothing;
alter table public.restaurant_settings enable row level security;
drop policy if exists "anyone reads settings" on public.restaurant_settings;
create policy "anyone reads settings" on public.restaurant_settings for select to anon, authenticated using (true);
drop policy if exists "team updates settings" on public.restaurant_settings;
create policy "team updates settings" on public.restaurant_settings for update to authenticated using (public.is_staff()) with check (public.is_staff());

alter table public.reservations add column if not exists tables_needed int not null default 1 check (tables_needed >= 1);

create or replace function public._tables_used(p_at timestamptz, p_minutes int)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(tables_needed), 0)::int from public.reservations
  where status in ('pending','confirmed')
    and reserved_at > p_at - make_interval(mins => p_minutes)
    and reserved_at < p_at + make_interval(mins => p_minutes)
$$;
revoke execute on function public._tables_used(timestamptz, int) from public, anon, authenticated;

create or replace function public.slot_availability(p_date date)
returns table (slot text, tables_free int)
language plpgsql stable security definer set search_path = public as $$
declare s public.restaurant_settings; t time; at timestamptz;
begin
  select * into s from public.restaurant_settings where id = 1;
  t := s.open_time;
  while t <= s.last_booking loop
    at := (p_date + t) at time zone 'Asia/Beirut';
    slot := to_char(t, 'HH24:MI');
    tables_free := greatest(0, s.total_tables - public._tables_used(at, s.sitting_minutes));
    return next;
    t := t + interval '30 minutes';
  end loop;
end $$;
revoke execute on function public.slot_availability(date) from public;
grant execute on function public.slot_availability(date) to anon, authenticated;

create or replace function public.create_reservation(
  p_full_name text, p_phone text, p_guests int, p_at timestamptz,
  p_set_menu text default null, p_notes text default null)
returns public.reservations
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s public.restaurant_settings;
  m public.set_menus;
  r public.reservations;
  total numeric(10,2) := 0;
  dep numeric(10,2) := 0;
  due timestamptz;
  t time;
  need int;
  used int;
  new_code text;
  details text;
begin
  if uid is null then raise exception 'Please sign in to reserve.'; end if;
  select * into s from public.restaurant_settings where id = 1;
  p_full_name := btrim(coalesce(p_full_name, ''));
  p_phone := btrim(coalesce(p_phone, ''));
  if char_length(p_full_name) not between 2 and 80 then raise exception 'Enter your full name.'; end if;
  if p_phone !~ '^\+?[0-9 ()-]{6,20}$' then raise exception 'Enter a valid phone number.'; end if;
  if p_guests is null or p_guests not between 1 and 30 then raise exception 'Guests must be between 1 and 30.'; end if;
  if p_at is null or p_at < now() + interval '1 hour' then raise exception 'Choose a time at least one hour from now.'; end if;
  if p_at > now() + interval '90 days' then raise exception 'We take reservations up to 90 days ahead.'; end if;
  t := (p_at at time zone 'Asia/Beirut')::time;
  if t < s.open_time or t > s.last_booking then
    raise exception 'Reservations are accepted from % to %.', to_char(s.open_time, 'HH24:MI'), to_char(s.last_booking, 'HH24:MI');
  end if;
  if (select count(*) from public.reservations
      where user_id = uid and status in ('pending','confirmed') and reserved_at > now()) >= 5 then
    raise exception 'You already have 5 upcoming reservations.';
  end if;

  perform pg_advisory_xact_lock(hashtext('mh-capacity'));
  need := greatest(1, ceil(p_guests::numeric / s.seats_per_table))::int;
  if need > s.total_tables then raise exception 'For a group this size, please call us.'; end if;
  used := public._tables_used(p_at, s.sitting_minutes);
  if used + need > s.total_tables then
    raise exception 'Sorry, we are fully booked at % — please choose another time.', to_char(t, 'HH24:MI');
  end if;

  if nullif(p_set_menu, '') is not null then
    select * into m from public.set_menus where id = p_set_menu and active;
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

  insert into public.reservations (code, user_id, full_name, phone, guests, tables_needed, reserved_at, set_menu_id,
    set_menu_total, deposit_amount, deposit_status, deposit_due, notes)
  values (new_code, uid, p_full_name, p_phone, p_guests, need, p_at, m.id,
    total, dep, case when dep > 0 then 'due' else 'none' end, due, public._clean(p_notes, 500))
  returning * into r;

  details := r.full_name || ' · ' || r.phone || ' · ' || r.guests || ' guest(s), ' || need || ' table(s) · ' || public._when(r.reserved_at)
    || coalesce(' · ' || m.name || ' ($' || total || ')', '')
    || case when dep > 0 then ' · deposit $' || dep || ' due ' || public._when(due) else '' end
    || coalesce(' · Note: ' || r.notes, '');

  perform public._notify(null, true, r.id, 'new', 'New reservation ' || r.code, details);
  perform public._notify(uid, false, r.id, 'new', 'Reservation received — ' || r.code,
    'We received your request for ' || r.guests || ' on ' || public._when(r.reserved_at)
    || '. The team will confirm it shortly.');
  if dep > 0 then
    perform public._notify(uid, false, r.id, 'deposit_due', 'Deposit due — $' || dep,
      'Please pay the $' || dep || ' deposit for ' || r.code || ' before ' || public._when(due)
      || ', or the reservation is cancelled automatically.');
  end if;
  return r;
end $$;
revoke execute on function public.create_reservation(text, text, int, timestamptz, text, text) from public, anon;
grant execute on function public.create_reservation(text, text, int, timestamptz, text, text) to authenticated;

create table if not exists public.menu_categories (
  id text primary key check (id ~ '^[a-z0-9-]{2,30}$'),
  name text not null check (char_length(name) between 1 and 60),
  note text not null default '',
  tint text not null default '#efe4cf' check (tint ~ '^#[0-9a-fA-F]{6}$'),
  sort int not null default 0,
  active boolean not null default true
);
create table if not exists public.menu_items (
  id bigint generated always as identity primary key,
  category_id text not null references public.menu_categories(id) on update cascade on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  price numeric(10,2) not null check (price >= 0),
  picture text not null default '🍽️' check (char_length(picture) <= 16),
  photo_url text check (photo_url is null or photo_url ~ '^(https://|images/)'),
  ingredients text not null default '' check (char_length(ingredients) <= 600),
  description text not null default '' check (char_length(description) <= 400),
  -- labels, one letter each (see TAGS in js/menu-data.js): h halal, v vegetarian, m meat, c poultry, f fish & seafood, g gluten, s spicy
  tags text not null default '' check (tags ~ '^[hvmcfgs]*$'),
  available boolean not null default true,
  sort int not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists menu_items_cat_idx on public.menu_items (category_id, sort);
-- photos may be https URLs (uploaded from the team app) or paths inside this repository (images/menu/…)
alter table public.menu_items drop constraint if exists menu_items_photo_url_check;
alter table public.menu_items add constraint menu_items_photo_url_check check (photo_url is null or photo_url ~ '^(https://|images/)');
-- dish descriptions and the meat / poultry / fish / gluten labels were added later
alter table public.menu_items add column if not exists description text not null default '' check (char_length(description) <= 400);
alter table public.menu_items drop constraint if exists menu_items_tags_check;
alter table public.menu_items add constraint menu_items_tags_check check (tags ~ '^[hvmcfgs]*$');
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
drop policy if exists "anyone reads categories" on public.menu_categories;
create policy "anyone reads categories" on public.menu_categories for select to anon, authenticated using (true);
drop policy if exists "team inserts categories" on public.menu_categories;
create policy "team inserts categories" on public.menu_categories for insert to authenticated with check (public.is_staff());
drop policy if exists "team updates categories" on public.menu_categories;
create policy "team updates categories" on public.menu_categories for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "team deletes categories" on public.menu_categories;
create policy "team deletes categories" on public.menu_categories for delete to authenticated using (public.is_staff());
drop policy if exists "anyone reads items" on public.menu_items;
create policy "anyone reads items" on public.menu_items for select to anon, authenticated using (true);
drop policy if exists "team inserts items" on public.menu_items;
create policy "team inserts items" on public.menu_items for insert to authenticated with check (public.is_staff());
drop policy if exists "team updates items" on public.menu_items;
create policy "team updates items" on public.menu_items for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "team deletes items" on public.menu_items;
create policy "team deletes items" on public.menu_items for delete to authenticated using (public.is_staff());
drop policy if exists "team updates set menus" on public.set_menus;
create policy "team updates set menus" on public.set_menus for update to authenticated using (public.is_staff()) with check (public.is_staff());
-- the first menu was copied from js/menu.js into these tables

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu', 'menu', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists "team uploads menu photos" on storage.objects;
create policy "team uploads menu photos" on storage.objects for insert to authenticated with check (bucket_id = 'menu' and public.is_staff());
drop policy if exists "team updates menu photos" on storage.objects;
create policy "team updates menu photos" on storage.objects for update to authenticated using (bucket_id = 'menu' and public.is_staff());
drop policy if exists "team deletes menu photos" on storage.objects;
create policy "team deletes menu photos" on storage.objects for delete to authenticated using (bucket_id = 'menu' and public.is_staff());

-- Email through Resend: key in Vault (select vault.create_secret('<re_ key>', 'resend_api_key');)
create or replace function public.push_config()
returns json language sql stable security definer set search_path = public, vault as $$
  select json_build_object(
    'public',  (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public'),
    'private', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private'),
    'hook',    (select decrypted_secret from vault.decrypted_secrets where name = 'push_hook_secret'),
    'resend',  (select decrypted_secret from vault.decrypted_secrets where name = 'resend_api_key'),
    'email_from', coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'email_from'), 'Maison Hamra <onboarding@resend.dev>'),
    'subject', 'mailto:abbassakar365@gmail.com',
    'site',    'https://abbassakar365.github.io/Maison-restaurant-/')
$$;
revoke execute on function public.push_config() from public, anon, authenticated;
grant execute on function public.push_config() to service_role;

-- =====================================================================
-- Auto-pilot (team app → Auto-pilot) and automatic deposit verification
-- Applied as migrations mh_11a … mh_11f. The bank / payment provider posts
-- signed payment confirmations to the `payment-webhook` Edge Function, which
-- calls record_payment(). Signing key in Vault: 'payment_webhook_secret'.
-- =====================================================================
alter table public.restaurant_settings
  add column if not exists auto_confirm boolean not null default true,
  add column if not exists auto_deposits boolean not null default true,
  add column if not exists auto_full boolean not null default true;

create table if not exists public.automation_log (
  id bigint generated always as identity primary key,
  reservation_id uuid references public.reservations(id) on delete cascade,
  action text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists automation_log_time_idx on public.automation_log (created_at desc);
alter table public.automation_log enable row level security;
drop policy if exists "team reads automation log" on public.automation_log;
create policy "team reads automation log" on public.automation_log for select to authenticated using (public.is_staff());

create table if not exists public.payments (
  id bigint generated always as identity primary key,
  provider text not null,
  transaction_id text not null,
  reference text,
  payer_name text,
  amount numeric(10,2),
  currency text,
  status text,
  reservation_id uuid references public.reservations(id),
  result text not null default '',
  received_at timestamptz not null default now(),
  unique (provider, transaction_id)
);
alter table public.payments enable row level security;
drop policy if exists "team reads payments" on public.payments;
create policy "team reads payments" on public.payments for select to authenticated using (public.is_staff());

-- Auto-pilot functions (migrations mh_11b, mh_11d, mh_11f in the original project)
-- Auto-pilot helpers -----------------------------------------------------
create or replace function public._log(p_res uuid, p_action text, p_detail text)
returns void language sql security definer set search_path = public as $$
  insert into public.automation_log (reservation_id, action, detail) values (p_res, p_action, coalesce(p_detail, ''))
$$;

-- Does the payer's name match the reservation name? Every word of the shorter name
-- must appear in the longer one (case, accents and punctuation ignored).
create or replace function public._name_match(a text, b text)
returns boolean language plpgsql immutable set search_path = public as $$
declare wa text[]; wb text[]; short text[]; long text[];
begin
  wa := array(select w from regexp_split_to_table(lower(translate(coalesce(a, ''), 'ÀÁÂÄÃÇÈÉÊËÌÍÎÏÑÒÓÔÖÕÙÚÛÜàáâäãçèéêëìíîïñòóôöõùúûü', 'AAAAACEEEEIIIINOOOOOUUUUaaaaaceeeeiiiinooooouuuu')), '[^a-z0-9]+') w where length(w) > 1);
  wb := array(select w from regexp_split_to_table(lower(translate(coalesce(b, ''), 'ÀÁÂÄÃÇÈÉÊËÌÍÎÏÑÒÓÔÖÕÙÚÛÜàáâäãçèéêëìíîïñòóôöõùúûü', 'AAAAACEEEEIIIINOOOOOUUUUaaaaaceeeeiiiinooooouuuu')), '[^a-z0-9]+') w where length(w) > 1);
  if cardinality(wa) = 0 or cardinality(wb) = 0 then return false; end if;
  if cardinality(wa) <= cardinality(wb) then short := wa; long := wb; else short := wb; long := wa; end if;
  return short <@ long;
end $$;

-- The best free times near p_at: same day first, nearest first, then the following days
create or replace function public.suggest_times(p_at timestamptz, p_guests int, p_count int default 3)
returns setof timestamptz language plpgsql stable security definer set search_path = public as $$
declare s public.restaurant_settings; need int;
begin
  select * into s from public.restaurant_settings where id = 1;
  need := greatest(1, ceil(greatest(coalesce(p_guests, 1), 1)::numeric / s.seats_per_table))::int;
  return query
    with slots as (
      select ((d::date + tm) at time zone 'Asia/Beirut') as slot
      from generate_series((p_at at time zone 'Asia/Beirut')::date::timestamp, (p_at at time zone 'Asia/Beirut')::date::timestamp + interval '6 days', interval '1 day') d,
           generate_series(timestamp '2000-01-01' + s.open_time, timestamp '2000-01-01' + s.last_booking, interval '30 minutes') g,
           lateral (select g::time as tm) x
    )
    select slot from slots
    where slot >= now() + interval '1 hour' and slot <= now() + interval '90 days' and slot <> p_at
      and s.total_tables - public._tables_used(slot, s.sitting_minutes) >= need
    order by (slot at time zone 'Asia/Beirut')::date, abs(extract(epoch from slot - p_at))
    limit greatest(coalesce(p_count, 3), 1);
end $$;

create or replace function public._suggest_text(p_at timestamptz, p_guests int)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(string_agg(public._when(x), ', '), 'no free time nearby, please call us')
  from public.suggest_times(p_at, p_guests, 3) x
$$;

-- Confirm a pending booking when it fits, its deposit is settled and the customer isn't flagged
create or replace function public._autopilot_try_confirm(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.restaurant_settings; r public.reservations; p public.profiles;
begin
  select * into s from public.restaurant_settings where id = 1;
  if not s.auto_confirm then return; end if;
  select * into r from public.reservations where id = p_id for update;
  if not found or r.status <> 'pending' or r.reserved_at <= now() then return; end if;
  if r.deposit_status not in ('none','paid') then return; end if;
  if public._tables_used(r.reserved_at, s.sitting_minutes) > s.total_tables then return; end if;
  if r.user_id is not null then
    select * into p from public.profiles where id = r.user_id;
    if p.no_shows >= 3 or p.unpaid >= 3 then
      if not exists (select 1 from public.automation_log where reservation_id = r.id and action = 'needs_team') then
        perform public._log(r.id, 'needs_team', r.code || ': ' || r.full_name || ' is flagged ('
          || p.no_shows || ' no-shows, ' || p.unpaid || ' unpaid). Left for the team to confirm.');
        perform public._notify(null, true, r.id, 'new', 'Needs your decision — ' || r.code,
          r.full_name || ' has ' || p.no_shows || ' no-show(s) and ' || p.unpaid || ' unpaid deposit(s). Confirm or cancel it yourself.');
      end if;
      return;
    end if;
  end if;
  update public.reservations set status = 'confirmed', updated_at = now() where id = r.id returning * into r;
  perform public._log(r.id, 'confirmed', 'Confirmed ' || r.code || ' for ' || r.full_name || ', ' || r.guests || ' guest(s) on ' || public._when(r.reserved_at) || '.');
  perform public._notify(null, true, r.id, 'confirmed', 'Auto-confirmed — ' || r.code,
    r.full_name || ' · ' || r.guests || ' guest(s) · ' || public._when(r.reserved_at));
  perform public._notify(r.user_id, false, r.id, 'confirmed', 'Reservation confirmed — ' || r.code,
    'See you on ' || public._when(r.reserved_at) || ', table for ' || r.guests || '.');
end $$;

-- Every 5 minutes: release pending bookings that no longer fit, then confirm what can be confirmed
create or replace function public.autopilot_run()
returns void language plpgsql security definer set search_path = public as $$
declare s public.restaurant_settings; r public.reservations; sug text;
begin
  select * into s from public.restaurant_settings where id = 1;
  perform pg_advisory_xact_lock(hashtext('mh-capacity'));
  if s.auto_full then
    for r in select * from public.reservations where status = 'pending' and reserved_at > now() order by created_at desc loop
      if public._tables_used(r.reserved_at, s.sitting_minutes) > s.total_tables then
        update public.reservations set status = 'cancelled', cancelled_by = 'system', cancelled_at = now(),
          cancel_reason = 'Fully booked', deposit_status = case when deposit_status in ('due','review') then 'none' else deposit_status end,
          updated_at = now() where id = r.id;
        sug := public._suggest_text(r.reserved_at, r.guests);
        perform public._log(r.id, 'full_released', 'Released ' || r.code || ' (' || r.full_name || '): no table left at ' || public._when(r.reserved_at) || '. Suggested: ' || sug || '.');
        perform public._notify(null, true, r.id, 'cancelled', 'Released (full) — ' || r.code,
          r.full_name || ' · ' || r.phone || ' · ' || r.guests || ' guest(s) · ' || public._when(r.reserved_at)
          || case when r.deposit_status = 'paid' then ' · deposit paid: refund it' else '' end);
        perform public._notify(r.user_id, false, r.id, 'cancelled', 'Sorry, we are fully booked — ' || r.code,
          'We could not keep your table on ' || public._when(r.reserved_at) || '. Free times nearby: ' || sug || '. Book one of them in the app.');
      end if;
    end loop;
  end if;
  if s.auto_confirm then
    for r in select * from public.reservations where status = 'pending' and reserved_at > now() order by created_at loop
      perform public._autopilot_try_confirm(r.id);
    end loop;
  end if;
end $$;

-- New reservation: capacity, settings-based deposit, full → declined with suggestions
create or replace function public.create_reservation(
  p_full_name text, p_phone text, p_guests int, p_at timestamptz,
  p_set_menu text default null, p_notes text default null)
returns public.reservations
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s public.restaurant_settings;
  m public.set_menus;
  r public.reservations;
  total numeric(10,2) := 0;
  dep numeric(10,2) := 0;
  due timestamptz;
  t time;
  need int;
  full_up boolean;
  new_code text;
  details text;
  sug text;
begin
  if uid is null then raise exception 'Please sign in to reserve.'; end if;
  select * into s from public.restaurant_settings where id = 1;
  p_full_name := btrim(coalesce(p_full_name, ''));
  p_phone := btrim(coalesce(p_phone, ''));
  if char_length(p_full_name) not between 2 and 80 then raise exception 'Enter your full name.'; end if;
  if p_phone !~ '^\+?[0-9 ()-]{6,20}$' then raise exception 'Enter a valid phone number.'; end if;
  if p_guests is null or p_guests not between 1 and 30 then raise exception 'Guests must be between 1 and 30.'; end if;
  if p_at is null or p_at < now() + interval '1 hour' then raise exception 'Choose a time at least one hour from now.'; end if;
  if p_at > now() + interval '90 days' then raise exception 'We take reservations up to 90 days ahead.'; end if;
  t := (p_at at time zone 'Asia/Beirut')::time;
  if t < s.open_time or t > s.last_booking then
    raise exception 'Reservations are accepted from % to %.', to_char(s.open_time, 'HH24:MI'), to_char(s.last_booking, 'HH24:MI');
  end if;
  if (select count(*) from public.reservations
      where user_id = uid and status in ('pending','confirmed') and reserved_at > now()) >= 5 then
    raise exception 'You already have 5 upcoming reservations.';
  end if;

  perform pg_advisory_xact_lock(hashtext('mh-capacity'));
  need := greatest(1, ceil(p_guests::numeric / s.seats_per_table))::int;
  if need > s.total_tables then raise exception 'For a group this size, please call us.'; end if;
  full_up := public._tables_used(p_at, s.sitting_minutes) + need > s.total_tables;
  if full_up and not s.auto_full then
    raise exception 'Sorry, we are fully booked at % — please choose another time.', to_char(t, 'HH24:MI');
  end if;

  if nullif(p_set_menu, '') is not null then
    select * into m from public.set_menus where id = p_set_menu and active;
    if not found then raise exception 'That set menu is not available.'; end if;
    total := m.price * p_guests;
  end if;
  if not full_up and s.deposit_percent > 0 and total > s.deposit_threshold then
    dep := round(total * s.deposit_percent / 100, 2);
    due := greatest(least(now() + interval '24 hours', p_at - interval '2 hours'), now() + interval '30 minutes');
  end if;

  loop
    new_code := 'MH-' || array_to_string(array(
      select substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1)
      from generate_series(1, 6)), '');
    exit when not exists (select 1 from public.reservations where code = new_code);
  end loop;

  if full_up then
    -- declined at once: kept as a cancelled row so the customer and the team can see it
    insert into public.reservations (code, user_id, full_name, phone, guests, tables_needed, reserved_at, set_menu_id,
      set_menu_total, status, cancelled_by, cancelled_at, cancel_reason, notes)
    values (new_code, uid, p_full_name, p_phone, p_guests, need, p_at, m.id,
      total, 'cancelled', 'system', now(), 'Fully booked', public._clean(p_notes, 500))
    returning * into r;
    sug := public._suggest_text(p_at, p_guests);
    perform public._log(r.id, 'full_declined', 'Declined ' || r.code || ' (' || r.full_name || ', ' || r.guests || ' guest(s)): full at '
      || public._when(p_at) || '. Suggested: ' || sug || '.');
    perform public._notify(uid, false, r.id, 'cancelled', 'Fully booked — ' || r.code,
      'Sorry, every table is taken on ' || public._when(p_at) || '. Free times nearby: ' || sug || '.');
    return r;
  end if;

  insert into public.reservations (code, user_id, full_name, phone, guests, tables_needed, reserved_at, set_menu_id,
    set_menu_total, deposit_amount, deposit_status, deposit_due, notes)
  values (new_code, uid, p_full_name, p_phone, p_guests, need, p_at, m.id,
    total, dep, case when dep > 0 then 'due' else 'none' end, due, public._clean(p_notes, 500))
  returning * into r;

  details := r.full_name || ' · ' || r.phone || ' · ' || r.guests || ' guest(s), ' || need || ' table(s) · ' || public._when(r.reserved_at)
    || coalesce(' · ' || m.name || ' ($' || total || ')', '')
    || case when dep > 0 then ' · deposit $' || dep || ' due ' || public._when(due) else '' end
    || coalesce(' · Note: ' || r.notes, '');

  perform public._notify(null, true, r.id, 'new', 'New reservation ' || r.code, details);
  perform public._notify(uid, false, r.id, 'new', 'Reservation received — ' || r.code,
    'We received your request for ' || r.guests || ' on ' || public._when(r.reserved_at)
    || '. ' || case when dep > 0 then 'It is confirmed once the deposit is paid.' else 'We will confirm it shortly.' end);
  if dep > 0 then
    perform public._notify(uid, false, r.id, 'deposit_due', 'Deposit due — $' || dep,
      'Please pay the $' || dep || ' deposit for ' || r.code || ' before ' || public._when(due)
      || ', or the reservation is cancelled automatically. Put ' || r.code || ' in the payment reference.');
  end if;

  perform public._autopilot_try_confirm(r.id);
  select * into r from public.reservations where id = r.id;
  return r;
end $$;

-- Team verifies (or rejects) a deposit, then the Auto-pilot may confirm the booking
create or replace function public.verify_deposit(p_id uuid, p_ok boolean)
returns public.reservations
language plpgsql security definer set search_path = public as $$
declare r public.reservations;
begin
  if not public.is_staff() then raise exception 'Team only.'; end if;
  update public.reservations set
    deposit_status = case when p_ok then 'paid' else 'due' end,
    deposit_due = case when p_ok then deposit_due else greatest(deposit_due, now() + interval '2 hours') end,
    updated_at = now()
    where id = p_id and deposit_status in ('due','review') and status in ('pending','confirmed')
    returning * into r;
  if not found then raise exception 'No deposit to verify on this reservation.'; end if;
  perform public._notify(r.user_id, false, r.id, 'paid',
    case when p_ok then 'Deposit confirmed — ' || r.code else 'Deposit not found — ' || r.code end,
    case when p_ok then 'Your $' || r.deposit_amount || ' deposit is confirmed. Thank you!'
         else 'We could not find your payment. Please check the details and pay before ' || public._when(r.deposit_due) || '.' end);
  if p_ok then perform public._autopilot_try_confirm(r.id); end if;
  select * into r from public.reservations where id = r.id;
  return r;
end $$;

-- A payment reported by the bank / payment provider (payment-webhook) or a team test
create or replace function public.record_payment(p_provider text, p_txn text, p_reference text, p_payer text,
  p_amount numeric, p_currency text, p_status text)
returns text language plpgsql security definer set search_path = public as $$
declare s public.restaurant_settings; pay_id bigint; v_code text; r public.reservations; problem text;
begin
  select * into s from public.restaurant_settings where id = 1;
  insert into public.payments (provider, transaction_id, reference, payer_name, amount, currency, status)
  values (left(coalesce(p_provider, 'bank'), 40), left(p_txn, 120), left(p_reference, 300), left(p_payer, 120), p_amount, upper(left(p_currency, 8)), left(p_status, 40))
  on conflict (provider, transaction_id) do nothing
  returning id into pay_id;
  if pay_id is null then return 'transaction already used'; end if;

  v_code := substring(upper(coalesce(p_reference, '')) from 'MH-[A-Z0-9]{6}');
  if v_code is not null then select * into r from public.reservations where code = v_code for update; end if;

  if lower(coalesce(p_status, '')) not in ('succeeded','success','paid','completed','captured','settled') then problem := 'payment not successful (' || coalesce(nullif(p_status, ''), 'no status') || ')';
  elsif v_code is null then problem := 'no reservation code in the reference';
  elsif r.id is null then problem := 'reservation ' || v_code || ' not found';
  elsif r.status not in ('pending','confirmed') or r.deposit_status not in ('due','review') then problem := v_code || ' has no deposit waiting';
  elsif upper(coalesce(p_currency, 'USD')) <> 'USD' then problem := 'currency is ' || p_currency || ', not USD';
  elsif coalesce(p_amount, 0) < r.deposit_amount then problem := 'amount $' || coalesce(p_amount, 0) || ' is less than the $' || r.deposit_amount || ' deposit';
  elsif not public._name_match(p_payer, r.full_name) then problem := 'payer name "' || coalesce(p_payer, '') || '" does not match ' || r.full_name;
  elsif not s.auto_deposits then problem := 'automatic deposit checks are off';
  end if;

  if problem is null then
    update public.reservations set deposit_status = 'paid',
      payment_method = case when lower(p_provider) ~ 'whish' then 'whish' when lower(p_provider) ~ 'card|stripe|areeba' then 'card' else 'bank' end,
      payment_ref = left(p_txn, 80), updated_at = now() where id = r.id returning * into r;
    update public.payments set reservation_id = r.id, result = 'verified' where id = pay_id;
    perform public._log(r.id, 'deposit_verified', 'Deposit $' || r.deposit_amount || ' for ' || r.code || ' verified (' || p_provider || ', paid by ' || coalesce(p_payer, '?') || ').');
    perform public._notify(null, true, r.id, 'paid', 'Deposit verified — ' || r.code, r.full_name || ' paid $' || p_amount || ' (' || p_provider || ').');
    perform public._notify(r.user_id, false, r.id, 'paid', 'Deposit confirmed — ' || r.code, 'Your $' || r.deposit_amount || ' deposit is confirmed. Thank you!');
    perform public._autopilot_try_confirm(r.id);
    return 'verified';
  end if;

  update public.payments set reservation_id = r.id, result = problem where id = pay_id;
  if r.id is not null and r.deposit_status = 'due' and r.status in ('pending','confirmed') then
    -- pause the deadline while the team checks
    update public.reservations set deposit_status = 'review', payment_ref = coalesce(payment_ref, left(p_txn, 80)), updated_at = now() where id = r.id;
  end if;
  perform public._log(r.id, 'deposit_check', 'Payment $' || coalesce(p_amount, 0) || ' from ' || coalesce(p_payer, '?') || ' (ref ' || coalesce(p_reference, '') || '): ' || problem || '.');
  perform public._notify(null, true, r.id, 'paid', 'Payment needs checking' || coalesce(' — ' || v_code, ''),
    '$' || coalesce(p_amount, 0) || ' from ' || coalesce(p_payer, 'unknown payer') || ', ref "' || coalesce(p_reference, '') || '": ' || problem || '.');
  return problem;
end $$;

-- Team app → Auto-pilot → Test a payment
create or replace function public.simulate_payment(p_code text, p_payer text, p_amount numeric)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Team only.'; end if;
  return public.record_payment('test', 'TEST-' || gen_random_uuid(), p_code, p_payer, p_amount, 'USD', 'succeeded');
end $$;

create or replace function public.payment_webhook_secret()
returns text language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'payment_webhook_secret'
$$;

revoke execute on function public._log(uuid, text, text) from public, anon, authenticated;
revoke execute on function public._name_match(text, text) from public, anon, authenticated;
revoke execute on function public._suggest_text(timestamptz, int) from public, anon, authenticated;
revoke execute on function public._autopilot_try_confirm(uuid) from public, anon, authenticated;
revoke execute on function public.autopilot_run() from public, anon, authenticated;
revoke execute on function public.record_payment(text, text, text, text, numeric, text, text) from public, anon, authenticated;
revoke execute on function public.payment_webhook_secret() from public, anon, authenticated;
revoke execute on function public.suggest_times(timestamptz, int, int) from public;
revoke execute on function public.simulate_payment(text, text, numeric) from public, anon;
revoke execute on function public.create_reservation(text, text, int, timestamptz, text, text) from public, anon;
revoke execute on function public.verify_deposit(uuid, boolean) from public, anon;
grant execute on function public.suggest_times(timestamptz, int, int) to anon, authenticated;
grant execute on function public.simulate_payment(text, text, numeric) to authenticated;
grant execute on function public.create_reservation(text, text, int, timestamptz, text, text) to authenticated;
grant execute on function public.verify_deposit(uuid, boolean) to authenticated;
grant execute on function public.record_payment(text, text, text, text, numeric, text, text) to service_role;
grant execute on function public.payment_webhook_secret() to service_role;

select cron.schedule('mh-autopilot', '*/5 * * * *', 'select public.autopilot_run()')
where not exists (select 1 from cron.job where jobname = 'mh-autopilot');

-- Phone Auto-pilot (calls, phone bookings, transfers): see sql/phone_autopilot.sql
