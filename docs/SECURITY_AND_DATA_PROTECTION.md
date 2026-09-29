# LHIMS security and data protection

Phase 7 review, 2026-09-29. This describes what the system enforces, how it is
tested, and what the operator of LHIMS must still do. It is not legal advice:
have a Ghanaian data-protection lawyer confirm the compliance section before
launch.

## 1. Keeping each hospital's data separate (tenant isolation)

Three independent layers; any one of them stops a leak.

| Layer | What it does | Tested by |
|---|---|---|
| Application | Every request runs in its facility's context. The Prisma extension adds the facility to every query and refuses queries without a context ("fails closed"). | `tenantExtension.test.ts`, `httpIsolation.test.ts` |
| Database | Triggers on every facility table reject a row that points at another facility's row (for example a visit of facility A linked to a patient of facility B). New rows get the facility from the session setting. | `facilityGuards.test.ts` |
| Platform operator | The operator account has no facility and can read no facility data. The only way in is a support session (section 4). | `securityAudit.test.ts` |

## 2. Who can reach what (authorisation)

- `securityAudit.test.ts` walks **every** route the API registers (about 370) on each QA run:
  - without signing in, only the public routes answer: health checks, sign-in, the pricing website, sign-up, demo requests, the payment webhook (signature-checked) and the development-only test checkout. Everything else returns 401;
  - staff get 403 from every platform, admin, setup and billing route;
  - the platform operator gets no facility data from any route.
  A new route that forgets its guard fails QA.
- Inside a facility: role, then permission (custom roles pick from a fixed list), then department switch (`requireModule`).
- An unpaid or cancelled subscription makes the facility read-only; nothing is deleted.

## 3. Accounts, sessions and abuse

- Passwords are hashed (bcrypt). Sessions use httpOnly cookies; refresh tokens rotate, and reuse of an old one revokes the session.
- Rate limits: the whole API, a stricter one for sign-in, and one for the public sign-up and demo forms (10 per hour per address). The public forms also have a hidden bot trap.
- Facility codes are generated from the facility name, never chosen, and sign-in failures look the same whether the code or the password is wrong, so neither form reveals which facilities exist.
- `/version` shows configuration details only outside production.
- Errors never include stack traces or internal details in production; users see only messages meant for them (such as which row of an import is wrong).

## 4. Support sessions

A platform operator can open a **read-only** session as a facility's administrator to help with a problem:
- a reason is required and stored;
- it lasts 30 minutes and is never extended;
- nothing can be changed, and data cannot be exported during it;
- it is written to the **facility's own audit log**, with the operator's name and the reason;
- the facility can refuse all support access (Facility Setup → "Allow LHIMS support to look in").

## 5. Audit trails

- Every sign-in, failed sign-in, write, refused request, export, support session and billing event is in the audit log of the facility it concerns.
- Opening a patient's full chart is logged with the purpose (Medical Records → access log).
- Payment webhooks are stored once each, before processing.

## 6. Files

Uploaded files are served only through short-lived signed links (`SIGNED_FILE_URL_TTL_MINUTES`, default 15) after the usual permission checks; reports shared with patients use their own expiring links.

## 7. Backups and restore

- `npm run db:backup` writes a compressed `pg_dump` to `backups/` (kept out of git), prints its size and SHA-256, and keeps the newest 14.
- `npm run db:restore-check` restores the newest backup into a throwaway database and compares migrations and row counts of the key tables with the source. **A backup only counts once this has passed.**
- In production: use the hosting provider's daily managed backups with point-in-time recovery **and** run `db:backup` to storage outside the provider (for example weekly, off-site), then `db:restore-check` monthly. Set `PG_BIN` if the PostgreSQL tools are not on the path.

## 8. Monitoring and alerts

- `/api/live` (process up), `/api/ready` (database reachable) for the host's health check and an external uptime monitor.
- `ALERT_WEBHOOK_URL` (Slack, Teams or similar): unhandled server errors and billing-cycle failures are posted there, each at most once every 15 minutes. Alerts contain no patient data.

## 9. Ghana Data Protection Act, 2012 (Act 843)

Health information is *special personal data* under the Act, so it needs particular care. How LHIMS supports the Act's principles:

| Principle / right | In LHIMS |
|---|---|
| Accountability, lawful processing | Each facility is the data controller for its patients; LHIMS (the operator) processes on its behalf. Sign-up records the facility's authorisation and agreement. |
| Purpose specification, minimality | Only data used for care, billing, claims and hospital administration is collected; departments that are off are not used. |
| Security safeguards | Sections 1–8 above. |
| Openness | Patients can be told which facility holds their records; the facility's audit and chart-access logs show who used them. |
| Access by the data subject | Medical Records → release-of-information requests (with consent or court order and second-person approval). |
| Correction | Records are corrected by the facility; clinical records keep corrections as new entries rather than overwriting. |
| Portability and leaving the service | **Admin → Data export**: the facility's complete data as one JSON file (all facility tables; secrets removed; logged). Available even while the subscription is unpaid. |
| Retention | Nothing is deleted when a subscription ends; records stay read-only. Deletion on request, when legally allowed, is done by the operator on written instruction from the facility (to be added to the service agreement). |

### Still to do by the LHIMS operator (not software)

1. **Register with the Data Protection Commission** of Ghana as a data controller/processor before processing real patient data, and renew as required.
2. Appoint a **data protection supervisor** (named contact for facilities and the Commission).
3. Sign a **data processing agreement** with each facility (roles, security, breach notification, sub-processors such as the hosting provider and Paystack, return and deletion of data at the end).
4. Publish **Terms of Service** and a **Privacy Notice**, and link them from sign-up.
5. Write a **breach response plan**: who decides, how the Commission and affected facilities and patients are told, and how quickly.
6. Decide **where data is hosted** (country/region) and disclose it; check the Act's rules on transfers outside Ghana for the chosen host.
7. Have a lawyer confirm this section.

## 10. Known limits

- Rate limits are per server process (in memory). With several API instances, move them to a shared store (Redis) or the load balancer.
- Email verification at sign-up is not built (no email provider yet).
- Penetration testing by an independent party is recommended before the first paying facility.
