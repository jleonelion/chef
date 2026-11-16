## Agent skills

### Issue tracker

GitHub Issues on `jleonelion/chef`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five roles, label string equals role name (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.

### Releases and release targeting

Issues carry a `semver:` change level and, once triaged, a milestone named for the exact release (`v1.2.1`). Terms in `GLOSSARY.md`; commands in `docs/agents/issue-tracker.md` under **Release targeting**; release steps in `RELEASE-CHECKLIST.md`.
