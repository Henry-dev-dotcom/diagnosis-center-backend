# Backend dependency install fix

## Issue found

The backend lockfile had a corrupted transitive dependency entry:

- `get-intrinsic@1.4.0`

That version does not exist on the public npm registry. It was coming from a stale/generated lockfile entry under `call-bound`.

## Fix applied

- Repaired `package-lock.json` so `get-intrinsic` resolves to the valid version `1.3.0`.
- Corrected the `call-bound` dependency range from `^1.4.0` to `^1.3.0` inside the lockfile.
- Replaced internal registry URLs with public npm registry URLs.
- Added `.npmrc` to force dependency installation from the public npm registry.

## How to install backend dependencies

From the `backend` folder:

```bash
npm ci
```

If Prisma engine download is blocked by your network during install, use this temporary install method:

```bash
npm ci --ignore-scripts
npx prisma generate
npm run build
npm run qa
```

For production deployment, make sure the hosting server can access:

```text
https://binaries.prisma.sh
```

Prisma needs that endpoint to download the correct query engine for the deployment environment.

## QA performed here

The lockfile 404 problem was fixed. Static backend QA passed using:

```bash
npm ci --ignore-scripts
npm run qa
```

Full runtime build still requires Prisma engine download access. In this environment, that download was blocked by DNS/network access to `binaries.prisma.sh`, so the remaining Prisma step should be run on your local machine or deployment server with normal internet access.
