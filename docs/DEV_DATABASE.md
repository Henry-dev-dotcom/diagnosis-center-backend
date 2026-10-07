# The local development database

`.env` expects a **passwordless Postgres on `localhost:5434`** holding three
databases: `lhims_dev` (the app), `lhims_test` (integration tests) and
`lhims_e2e` (Playwright - wiped on every run, by design).

On the machine this was built on there is no Docker and the installed Postgres 13
service (port 5433) needs a password, so a separate cluster runs from
`C:\Users\KOJO\lhims-pg`. It is **outside OneDrive on purpose** - a Postgres data
directory must never sit in a synced folder.

| | |
| --- | --- |
| Data | `C:\Users\KOJO\lhims-pg\data` |
| Start / stop | `start-db.ps1` / `stop-db.ps1` in that folder |
| At sign-in | `LHIMS-dev-database.vbs` in the Windows Startup folder runs `start-db.ps1` |
| Log | `C:\Users\KOJO\lhims-pg\postgres.log` |

Auth is `trust` on localhost only. That is fine for demo data and is exactly why
this database must never hold anything real.

## Rebuilding it from nothing

```powershell
$bin = 'C:\Program Files\PostgreSQL\13\bin'
& "$bin\initdb.exe" -D C:\Users\KOJO\lhims-pg\data -U postgres --auth=trust -E UTF8
# then start-db.ps1, and:
foreach ($db in 'lhims_dev','lhims_test','lhims_e2e') {
  & "$bin\psql.exe" -h 127.0.0.1 -p 5434 -U postgres -d postgres -c "create database $db;"
}
npx prisma migrate deploy      # in this repo
npm run db:seed                # demo data
```

## Things that bite

- **Version skew.** This is Postgres 13; production (Neon) is newer. Migrations
  that use PG14+ syntax would pass in production and fail here, or the reverse.
- **psql hangs** if it is asked for a password - pass `-w`, and use `127.0.0.1`.
- **Starting `pg_ctl` from a script and waiting on it never returns**, because it
  keeps hold of the console. `start-db.ps1` starts it detached for that reason.
- **The Playwright config must set `DIRECT_URL` as well as `DATABASE_URL`**, or
  `prisma migrate reset` falls back to `.env` and wipes the *development*
  database instead of the e2e one. It does now; do not remove it.
