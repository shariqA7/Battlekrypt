# Automated checks (CI)

Every pull request, and every push to `main`, runs three checks on GitHub
(`.github/workflows/ci.yml`). Each one shows up separately on the pull request.

| Check | What it runs | Roughly |
| --- | --- | --- |
| **Types and lint** | `npm run typecheck` and `npm run lint` | 1-2 min |
| **Tests (real Postgres)** | `npm test`, then a migrations-vs-schema check | 3-4 min |
| **Production build** | `npm run build` | 2-3 min |

A red check means something is genuinely wrong. Lint *warnings* don't fail the build, only lint *errors* do.

## Make the checks required (one-time, in GitHub)

The workflow only reports results. To stop a red pull request from being merged, turn it into a rule:

1. GitHub repo, **Settings > Branches > Add branch protection rule** (or *Rules > Rulesets*), branch name `main`.
2. Tick **Require a pull request before merging** and **Require status checks to pass before merging**.
3. Search for and select: `Types and lint`, `Tests (real Postgres)`, `Production build`.
   (They only appear in the search box after the workflow has run once.)

## Run the same things on your computer

```powershell
npm run typecheck
npm run lint
npm run build
```

The tests need a **throwaway** Postgres. The runner drops and recreates the database it is given
(and refuses to run unless the name contains `test`), so never point it at your real database.

```powershell
docker run --name bk-test-db -e POSTGRES_PASSWORD=postgres -p 5433:5432 -d postgres:16
$env:TEST_DATABASE_URL = "postgresql://postgres:postgres@localhost:5433/battlekrypt_test"
npm test
```

Handy variations:

```powershell
npm test -- age-gate phase8      # only scripts whose file name contains one of these words
npm test -- --reuse-template     # skip re-running migrations (fast reruns; not after changing a migration)
```

For each `scripts/*-test.ts` the runner clones a fresh, fully migrated database, runs the script,
and counts it as failed if it exits with an error **or** prints a line starting with `FAIL`.

## Adding a test

Drop a file named `scripts/<something>-test.ts` that prints `PASS ...` / `FAIL ...` lines and exits
non-zero on failure (copy any existing one). It is picked up automatically, both locally and in CI,
and gets its own fresh database.

## About the migrations check

After the tests, CI applies every migration to an empty database and asks Prisma to compare the
result with `prisma/schema.prisma`. If you change the schema and forget the migration (or a
hand-written migration doesn't quite match), the job fails and prints the SQL that is missing.
If Prisma itself can't run that comparison, the step only warns, so a tooling problem never blocks
a pull request.
