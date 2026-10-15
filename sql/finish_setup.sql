-- =====================================================================
-- Finish setting up the Maison-restaurant- project (efwqkllaultepxprwert)
-- Paste into https://supabase.com/dashboard/project/efwqkllaultepxprwert/sql/new
-- Replace the three <...> values (keep the quote marks) first, then Run.
-- =====================================================================

-- 1. Keys for the phone Auto-pilot (they stay in Vault, never in the code)
select vault.create_secret('<Anthropic API key>', 'anthropic_api_key');
select vault.create_secret('<SignalWire Signing Key>', 'phone_signing_key');   -- SignalWire → API → Signing Key

-- 2. Make yourself a team member (sign up on the website first with this email)
insert into public.staff (user_id)
select id from auth.users where email = 'abbassakar365@gmail.com'
on conflict do nothing;

-- 3. Remove the setup test booking, test call and a leftover test table
delete from public.payments where transaction_id = 'SETUP-TX-1';
delete from public.calls where call_sid = 'SETUP-TEST-CALL';
delete from public.reservations where code = 'MH-8ZDVCG';
delete from public.notifications where kind = 'call' and reservation_id is null;
delete from public.automation_log where action = 'call_missed' and reservation_id is null;
drop table if exists public._probe;
