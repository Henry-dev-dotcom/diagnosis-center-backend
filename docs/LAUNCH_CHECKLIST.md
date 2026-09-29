# Launch checklist

From a working code base to the first pilot hospital. Tick each box; do not skip the
"prove it" steps.

## 1. Decisions and paperwork (you)

- [ ] Plan tiers, departments per plan and prices (Platform → Plans & Billing). The seeded prices are placeholders.
- [ ] Register with Ghana's Data Protection Commission; name a data protection contact.
- [ ] Terms of Service, Privacy Notice and a data processing agreement for facilities (see SECURITY_AND_DATA_PROTECTION.md §9).
- [ ] Where the data is hosted (region) — and that this is acceptable for patient data.
- [ ] Paystack business account verified for GHS; live secret key available.
- [ ] Support contact (phone/WhatsApp/email) to show facilities.

## 2. Production environment (backend on Render)

Set these (see `.env.production.example`):

- [ ] `NODE_ENV=production`, `DATABASE_URL` (managed PostgreSQL with daily backups and point-in-time recovery)
- [ ] `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — long random values, different from each other
- [ ] `FRONTEND_URL` / `FRONTEND_URLS` = the GitHub Pages address (and the custom domain if any)
- [ ] `PAYMENT_GATEWAY=paystack`, `PAYSTACK_SECRET_KEY`, `PAYMENT_CALLBACK_URL=https://<frontend>/`
- [ ] Paystack dashboard → webhook URL `https://<api>/api/billing/webhooks/paystack`
- [ ] `ALERT_WEBHOOK_URL` (Slack/Teams channel the operator watches)
- [ ] `ENABLE_API_DOCS=false` unless the docs should be public (before Phase 7, "false" was misread as true, so the docs were public — fixed)
- [ ] `TRUST_PROXY=true` behind Render's proxy (correct client addresses for rate limits and logs)

Frontend (GitHub Pages build):

- [ ] `VITE_API_BASE_URL=https://<api>/api`

## 3. First deploy

- [ ] Push `master` (backend) and `main` (frontend); watch both deploys finish.
- [ ] Each start runs `prisma migrate deploy` then `seed:production` (`render:start`). Confirm with `npm run db:drift` against production (no difference).
- [ ] Set `SEED_ADMIN_USERNAME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` before the first start: the seed creates the platform operator account if it does not exist. Change the password after first sign-in.
- [ ] Sign in as the operator; create the real plans and add-on prices; retire the placeholders.
- [ ] `GET https://<api>/api/ready` returns ok; add it to an external uptime monitor (for example UptimeRobot, every 5 minutes).

## 4. Prove it in production (before any real patient)

- [ ] Website → pricing → sign up a **test facility**; you land in its setup checklist.
- [ ] Pay the first month with a real card or MoMo for the smallest amount you are willing to refund; check the invoice turns Paid, the Paystack dashboard shows the charge, and the webhook shows delivered.
- [ ] Add a department mid-period; check the prorated charge.
- [ ] Download the facility's data (Facility Setup → Your data) and open the file.
- [ ] Open a support session into the test facility; check the banner, that nothing can be changed, and the entry in its audit log.
- [ ] Trigger an alert (for example stop the database briefly on a staging copy) and see it arrive in the channel.
- [ ] Backups: `npm run db:backup` against production to off-site storage, then `npm run db:restore-check` — must pass.
- [ ] Cancel and delete the test facility's subscription; refund the test payment.

## 5. Pilot facility

- [ ] Pick one facility with a champion (a senior nurse or administrator) and the departments it will actually use first.
- [ ] Before go-live: create staff accounts, import its price list, and train each role for 1–2 hours using the guides in the frontend repository (`guides/`).
- [ ] Run in parallel with the current system (paper or other) for 2 weeks; compare daily totals (patients seen, bills, cash) each evening.
- [ ] Daily check-in during week one; weekly after. Log every problem with date, screen and what was expected.
- [ ] Go/no-go review after two weeks: data complete, cash reconciles, staff can work without help.

## 6. Running the service

- Daily: alerts channel; Platform → Overview (failed payments, trials ending, demo requests).
- Weekly: off-site backup; review support sessions opened.
- Monthly: `npm run db:restore-check` on the latest backup; dependency and security updates; `npm run test:load` on a staging copy after large changes.
