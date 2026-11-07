# Fixtures

`data-root/` is one synthetic Chef data root at schema version 1. Tests copy it to a temp
directory and never write to it here. Rules: fixed dates, `example.com` addresses only,
no real people, recipe text written for this repo.

`schema-v<n>/` are frozen copies of the fixture as it stood when schema version `<n>`
shipped. Never edit them. `bun run migrations` migrates each to the current schema and runs
tier1 against it. A PR that bumps `SCHEMA_VERSION` adds the migration step in
`src/lib/migrations.mjs` and freezes `fixtures/schema-v<new>/` from `data-root/`.
