# Putting the demo online: Neon + Render

The frontend is already free forever on GitHub Pages. This is the other half — a
Postgres that does not expire, and somewhere to run the API.

**Why not Render's own database.** Render's free Postgres is deleted after a fixed
window and takes the data with it. That is how the first deployment ended up
down. Neon's free tier does not expire, so the database outlives the demo.

Roughly 20 minutes, most of it waiting for a build.

---

## 1. The database (Neon)

1. Sign up at [neon.tech](https://neon.tech) and create a project. Pick the region
   closest to your users — **AWS eu-central-1 (Frankfurt)** is usually the best
   latency from Ghana on the free tier.
2. Open **Connection Details** and copy **two** connection strings:

   | Which | Looks like | What it is for |
   | --- | --- | --- |
   | **Pooled** | `...@ep-xxx-pooler.eu-central-1.aws.neon.tech/...` | the running app |
   | **Direct** | `...@ep-xxx.eu-central-1.aws.neon.tech/...` | Prisma's migrations |

   They differ by one thing: `-pooler` in the host name. Neon shows both; if you
   only see the pooled one, untick "Connection pooling" to reveal the direct one.

   Keep `?sslmode=require` on the end of both. Neon refuses plaintext.

**Why two.** A connection pooler multiplexes many clients onto few server
connections, which is exactly what a small web service wants. But migrations take
advisory locks and issue DDL that a pooler in transaction mode cannot carry, so
Prisma needs a direct line for those. `schema.prisma` declares both: `url` for
the app, `directUrl` for migrations.

---

## 2. The API (Render)

The blueprint in `render.yaml` creates the web service. It no longer creates a
database — you bring Neon.

1. In Render: **New +** → **Blueprint**, point it at the backend repository.
2. Render reads `render.yaml` and prompts for the values marked `sync: false`:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | the **pooled** Neon string |
   | `DIRECT_URL` | the **direct** Neon string |
   | `FRONTEND_URL` | `https://<your-github-username>.github.io` |
   | `FRONTEND_URLS` | the same (add others comma-separated if needed) |
   | `SEED_ADMIN_EMAIL` | your email |
   | `SEED_ADMIN_PASSWORD` | a strong password, 12+ characters, that you keep |

3. Set **`SEED_DEMO_DATA` to `true`** in the Render dashboard. It defaults to
   `false`; see the warning below before you turn it on.

On deploy, `render:start` runs the migrations, seeds, and starts the API. The
first boot takes a few minutes because it builds every migration from nothing.

### The origin must match exactly

`FRONTEND_URL` is what the API allows as a cross-origin caller, and it is also
what the fake-checkout return address is checked against. Scheme and host, no
trailing slash, no path:

```
https://henry-dev-dotcom.github.io        correct
https://henry-dev-dotcom.github.io/       wrong - trailing slash
https://henry-dev-dotcom.github.io/LHIMS-Frontend   wrong - that is a path
```

Sessions are httpOnly cookies, and GitHub Pages → Render is cross-origin, so
`AUTH_COOKIE_SAMESITE=none` and `TRUST_PROXY=true` are already set in the
blueprint. Do not change them or sign-in will fail in a way that looks like a
wrong password.

---

## 3. Point the frontend at it

The frontend bakes its API address in at build time, so this is a repository
variable, not a file:

GitHub → the frontend repo → **Settings → Secrets and variables → Actions →
Variables** → `VITE_API_BASE_URL` = `https://<your-render-service>.onrender.com/api`

Note the `/api` on the end. Then re-run the **Deploy to GitHub Pages** workflow so
the new value is built in.

---

## 4. Check it

```bash
curl -s https://<your-service>.onrender.com/api/health
```

Expect `"database": { "ok": true }`. Then open the site, sign in with facility
code `DEMO` and `admin` / `admin123`, and look at a patient.

---

## About `SEED_DEMO_DATA`

`true` seeds a facility called **LHIMS Demo Hospital**, code `DEMO`, with a staff
account for every role and enough patients, orders and results to show the system
working:

```
admin/admin123    doctor/doctor123   nurse/nurse123    pharmacist/pharmacist123
reception/reception123   lab/lab123   scan/scan123     billing/billing123
```

Those passwords are short and shared **on purpose** — people you send the link to
have to be able to get in. Which is exactly why:

> **A demonstration instance must never hold real patient data.** When a real
> facility goes on, use a separate deployment with `SEED_DEMO_DATA=false`, and a
> separate Neon project.

The platform operator account is never one of these. It always uses
`SEED_ADMIN_PASSWORD`, whatever else is seeded — the demo seed's own
`platform/platform123` is deliberately not created on a deployed instance.

The demo facility is only built if it is not already there, so restarts and
redeploys never wipe what someone is in the middle of looking at. To start it
fresh, drop the facility and redeploy.

---

## Free-tier edges worth knowing

**Render's free web service sleeps** after about 15 minutes of no traffic, and the
next request waits ~30–50 seconds while it wakes. For an investor opening a link
cold, that first load looks broken. Either warn them, or use Render's cheapest
paid tier (about $7/month) while the link is in circulation.

**Neon's free tier** scales compute to zero when idle and wakes in under a second,
so the database is not the slow part. It has a monthly compute-hours allowance and
a storage cap, both far beyond a demo.

**Uploads are on local disk** (`UPLOAD_STORAGE_DRIVER=local`), and Render's disk is
ephemeral — files vanish on redeploy. Fine for a demo. A real deployment needs a
persistent disk or an object store.

---

## When it does not work

| What you see | What it is |
| --- | --- |
| `503`, `x-render-routing: suspend-by-user` | The service is suspended in the Render dashboard. Resume it. |
| Build fails on `prisma migrate deploy` | `DIRECT_URL` is missing, or has `-pooler` in it. It must be the direct address. |
| API is up, every sign-in fails | `FRONTEND_URL` does not exactly match the site's origin, so the session cookie is rejected. |
| Site loads, pricing says "Failed to fetch" | `VITE_API_BASE_URL` is unset or lacks `/api`. Set the variable and re-run the Pages workflow. |
| First request after a quiet spell hangs | The free web service is waking. Normal. |
| `P1001 Can't reach database` | `sslmode=require` dropped from the connection string, or the Neon project is paused. |
