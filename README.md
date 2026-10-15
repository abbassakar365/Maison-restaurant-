# Maison Hamra

Website and app for a French brasserie in Hamra, Beirut. Guests can browse the menu, read and post reviews, reserve a table and pay deposits. The team gets a dashboard to manage everything.

It is a static site (HTML, CSS and plain JavaScript, with no build step), backed by a Supabase project for accounts, data, live notifications and scheduled jobs.

| Page | What it does |
|---|---|
| `index.html` | The customer app: header with section buttons and a notification bell, the menu (8 categories, 12–13 items each, ingredients shown on hover or tap), reviews (Enter posts), the reservation form, the About section and the contact footer |
| `pay.html` | Deposit payment by card link, bank transfer or Whish. `pay.html#bank` is the public bank-payment link |
| `team/` | **The separate team app.** It has its own address (`…/Maison-restaurant-/team/`), its own home-screen icon and its own sign-in. Nothing on the customer site links to it. It shows reservations, notifications (cancelled ones are marked on the right with who cancelled), customers (orange or red flags with counts), the no-show list, feedback, and the phone call log |

## How a reservation flows

1. A signed-in customer sends a reservation with name, phone, guests, date, time, an optional set menu and notes. They get a code (`MH-XXXXXX`) that is saved to their profile, and the team is notified with all the details.
2. Reservations are accepted from **12:00 to 23:00**, and the restaurant has **25 tables** (one table per 4 guests, held for 2 hours). Times with no free table show as fully booked and can't be chosen. If the set-menu total is over **$300**, a **25% deposit** is due. The deadline is 24 hours later, or 2 hours before the table, whichever comes first. The customer gets a countdown and a "deposit due soon" warning 2 hours before the deadline. If it is not paid in time, the reservation is cancelled automatically and counts as **unpaid** for that customer.
3. The team confirms the reservation and verifies the deposit. The customer is notified at each step.
4. **Every morning at about 08:00 (Beirut)**, the customer and the team both get a reminder about that day's reservations, so they can call each other for final approval.
5. Either side can cancel, and both are notified. The team sees whether the customer, the team, or the system (unpaid deposit) cancelled it.
6. From one hour before the reservation time, the team marks **Yes — complete** or **No-show**:
   - **Complete:** the customer receives a feedback form asking what they loved and what they didn't like about the service, the food and beverages, the place, or anything else.
   - **No-show:** the customer gets an automatic notification, and their no-show count goes up.
7. Customers with **3+ no-shows show in orange** and those with **3+ unpaid deposits show in red**. Both counts appear beside their names.

## The team app (`team/`)

- **Separate from the customer site.** The customer site has no link to it. Staff open `https://abbassakar365.github.io/Maison-restaurant-/team/`, sign in, and press **Install the team app** in the Settings tab to add **MH Team** to their phone or computer.
- **Unreachable by customers.** Only accounts in the `staff` table get past the sign-in screen, and the database itself refuses team data and team actions to anyone else. A customer who finds the address only sees "not on the team list". The page also tells search engines not to index it.
- **Separate sign-in.** Being signed in on the customer site doesn't sign you in to the team app on the same phone, and the reverse is also true.
- **Linked to the customer site.** Both apps share the same database, so every reservation, cancellation and payment shows up live on both. The team app has a **Customer site** button.

## Notifications

The bell (top right) shows a red unread count. New notifications arrive live, play a chime, vibrate the phone and show a pop-up.

**Phone alerts when the app is closed (Web Push)** are set up:

1. A customer, or a team member in the team app, taps **Turn on phone alerts & sound** and allows notifications. The phone is then registered in `push_subscriptions`.
2. Every new notification row triggers `notifications_push`, which calls the `push` Edge Function (`supabase/functions/push`).
3. The function sends the alert to that customer's phones, or to every team member's phone for team notifications. Tapping the alert opens the right page: the reservation, the deposit payment or the feedback form.

**iPhone:** Apple only allows web alerts for apps added to the Home Screen (iOS 16.4 or later). Open the site in Safari, tap **Share → Add to Home Screen**, open it from the icon, then turn alerts on. Android and desktop Chrome, Edge and Firefox work straight from the browser.

The Web Push keys are stored in Supabase Vault, not in this repository. Only the public key is in `js/config.js`.

## Email (Resend)

Email is on. The `push` function sends every notification by email as well as by phone alert:
- **Customer notifications** go to the customer's account email.
- **Team notifications** go to every team member's email.

The Resend key is a send-only key stored in Supabase Vault as `resend_api_key`. It is never in this repository.

**Until you verify a domain**, mail goes out from `onboarding@resend.dev`, and Resend only delivers it to the email address your Resend account is registered with. That is enough for team alerts to the owner; customer emails start working once a domain is verified:

1. Buy a domain, then in Resend add it (Domains → Add) and paste the DNS records it shows at your registrar.
2. Once Resend shows the domain as verified, run in the Supabase SQL editor:
   ```sql
   select vault.create_secret('Maison Hamra <reservations@yourdomain.com>', 'email_from');
   ```
3. Optionally, use Resend as Supabase's email sender for sign-up and password-reset emails. In Authentication → Emails → SMTP, set the host to `smtp.resend.com`, the port to `465`, the user to `resend` and the password to a Resend API key.

## Setup checklist

1. **GitHub Pages:** go to Settings → Pages → Deploy from branch → `main` / root. The app will be live at `https://abbassakar365.github.io/Maison-restaurant-/`. Guests install it with the **Install the app** button in the About section. That button opens the install window in Chrome and Edge, and shows the Add to Home Screen steps on iPhone and Safari. Printable QR codes are still in `icons/qr.png` and `icons/team-qr.png`.
2. **Supabase auth URLs:** go to Authentication → URL Configuration. Set **Site URL** to the Pages address above and add it under **Redirect URLs**. Otherwise confirmation and password-reset emails link to `localhost`.
3. **Email:** Supabase's built-in email sender is rate-limited to a handful of emails per hour. Before launch, add your own SMTP under Authentication → Emails. Alternatively, turn off "Confirm email" if you don't need verified addresses.
4. **Add team members:** each person creates an account on the customer site, then you run this in the Supabase SQL editor:
   ```sql
   insert into public.staff (user_id)
   select id from auth.users where email = 'team.member@example.com';
   ```
   They then sign in at the team app address (`/team/`).
5. **Edit `js/config.js`:** set the phone, WhatsApp, Instagram link (the icon stays unlinked until you set it), address, bank details, Whish number and a hosted card checkout link (`cardLink`, for example a Stripe Payment Link). The card button stays hidden until `cardLink` is set.
6. **Menu, set menus and rules are edited in the team app.** The **Menu** tab adds, edits, hides and deletes dishes and categories, with photo upload. The **Settings** tab changes the number of tables, seats per table, table time, reservation hours and the deposit rule, and edits set menus. Changes appear on the site straight away. `js/menu.js` is only a built-in copy, shown if the database can't be reached.
7. **Photos:** in the team app, open **Menu**, choose a dish, then **Edit → Upload photo**. Use JPG, PNG or WebP files up to 5 MB.
8. **About section:** the menu is now 100% **pork-free and alcohol-free**, and the About section says so. Fill in the food-safety certificate number and expiry date in `index.html`.

## Privacy policy and terms

`privacy.html` and `terms.html` are linked in the footer and on the sign-up form. They are templates written around Lebanese Law No. 81/2018. Before launch:
- Confirm the deposit refund rule (currently: full refund if cancelled at least 24 hours before) and the 15-minute table hold.
- Have a Lebanese lawyer review both pages.

## Auto-pilot and automatic deposit checks

The team app's **Auto-pilot** tab has three switches. All three are on by default.

- **Accept reservations:** confirms a booking straight away when it fits in the tables, its deposit (if any) is paid, and the customer isn't flagged (3+ no-shows or 3+ unpaid deposits). Flagged customers are left for the team.
- **Check deposits:** when the bank or payment provider reports a payment, it checks the reservation code in the reference, the payer's name and the amount. It also refuses a transaction it has already seen. If everything matches, the deposit is marked paid and the booking confirmed. Otherwise the team gets a "Payment needs checking" notification and the deadline is paused.
- **Handle full tables:** a request for a fully booked time is declined at once, and the customer gets the three best free times nearby. Every 5 minutes it also releases pending bookings that no longer fit (newest first), with suggestions.

Everything the Auto-pilot does appears in the tab's activity list and is sent to the team as a notification.

**Connecting the bank:** your bank or payment provider must support payment notifications ("webhooks"). Give them:
- **Address:** `https://efwqkllaultepxprwert.supabase.co/functions/v1/payment-webhook`
- **Signing key:** stored in Supabase Vault as `payment_webhook_secret`. Each message must carry the header `x-mh-signature` with the HMAC-SHA256 of the message body.
- **Format:** the message format is described at the top of `supabase/functions/payment-webhook/index.ts`. Different providers name their fields differently; the field mapping in that file may need a small change for your provider.

Until a provider is connected, use **Test a payment** in the Auto-pilot tab.

## Phone Auto-pilot (answers calls)

The phone Auto-pilot answers the restaurant's phone number with a voice. It talks with the guest in English, French or Lebanese Arabic, and can:

- **Book a table:** it asks for the date, time, number of guests, name, phone number, set menu or not, and special requests. It checks for a free table, offers the nearest free times when one is full, reads the details back, and books only after the guest says yes. The guest gets their reservation code, and the deposit amount and deadline when one is due. The booking goes into the same system as website bookings: the team gets a "New phone reservation" notification, it shows with a **By phone** tag, and the Auto-pilot confirms it with the same rules. If the caller's number matches a customer account, the booking also appears in that customer's app.
- **Check a reservation,** by the caller's number or by the code.
- **Put the call through to the team** when the guest asks for a person, or for anything it can't handle (changing or cancelling, groups over 30, events, complaints). The team phone rings, and the person who answers first hears why the guest is calling. If nobody answers, the Auto-pilot comes back on the line, offers to take a message, and the team gets a "Missed call transfer, call back …" notification.

The team app's **Calls** tab lists every call with its full transcript (live calls update as they happen) and has the settings: the on/off switch, the **team phone for transfers** and the greeting language. When the switch is off, calls go straight to the team phone.

**How it works:** SignalWire receives the call and sends what the guest says to the `voice` Edge Function (`supabase/functions/voice`). The function asks Claude (Anthropic's AI model) what to answer, runs the booking tools against the database, and replies with what the phone should say, in cXML (the same call language Twilio uses, so a Twilio number works too). The database side is in `sql/phone_autopilot.sql`.

**Setup:**
1. **SignalWire:** create an account at signalwire.com and a Space, then buy a phone number with voice (or forward the restaurant's line to it). Then:
   - **My Resources → + Add → Script → cXML Script** (not SWML). Name it "Maison phone", set **Handle Calls Using** to *External URL* and **Primary Script URL** to `https://efwqkllaultepxprwert.supabase.co/functions/v1/voice`, then Create.
   - **Phone Numbers → your number → Edit Settings → Inbound Call Settings → Assign Resource**, pick "Maison phone" and save.
   - (Twilio instead: "A call comes in" webhook = the same URL, POST; status callback = the same URL with `?step=status`.)
2. **Claude:** create an API key at platform.claude.com.
3. **Store both keys in Supabase Vault** (SQL editor), never in this repository:
   ```sql
   select vault.create_secret('<Anthropic API key>', 'anthropic_api_key');
   select vault.create_secret('<SignalWire Signing Key>', 'phone_signing_key');  -- SignalWire → API → Signing Key
   ```
   With a Twilio number instead, store the Twilio auth token as `twilio_auth_token`.
4. In the team app → **Calls**, enter the **team phone for transfers** (for example `+961 3 123 456`) and save.
5. Call the number to test. The call shows in the Calls tab as it happens.

The function refuses any request that isn't signed with your Signing Key (or Twilio auth token). It uses the `claude-opus-5-5` model at low effort to keep answers quick; the model is set in `supabase/functions/voice/agent.ts` (`MODEL`). Each call costs the phone provider's per-minute price plus a few cents of Claude usage. Tests: `deno test supabase/functions/voice/agent.test.ts`.

## Security

- Row-level security is on for every table. Customers can only read their own profile, reservations, notifications and feedback; the team (the `staff` table) can read everything.
- All changes go through database functions that check who is calling. For example, a customer cannot confirm their own reservation, mark a deposit as paid, or change their no-show counts.
- The site never collects card numbers. Card payments go to a hosted checkout, and bank transfers and Whish payments are verified by the team.
- Only the publishable key is in the browser. The Content-Security-Policy allows scripts from this site only, plus network calls to this Supabase project.

## Database

The database runs in the **Maison-restaurant-** Supabase project (`efwqkllaultepxprwert`). To build it from scratch, run these files in order in the SQL editor; each is safe to re-run:

1. `sql/schema.sql`: tables, policies, all functions (including the Auto-pilot), the `pg_cron` jobs and the Web Push trigger.
2. `sql/menu_seed.sql`: the first menu, copied from `js/menu.js` (skipped when the menu already has dishes).
3. `sql/phone_autopilot.sql`: the phone Auto-pilot's tables and functions. `sql/phone_setup_run.sql` is the same script with a prerequisite check and a test call record.

The Edge Functions are in `supabase/functions/` (`push`, `payment-webhook`, `voice`), deployed with JWT verification off because each one checks its own signature or secret.
