# Release checklist

Muse-only behaviors that no automated test covers. Before tagging a release, check each item on a live Muse workspace with the release installed. Each item names the source it maps to. Add items under the owning skill's section; keep edits append-only.

## chef-batch-prep-planning

- [ ] Ask for a prep plan for a week with a saved meal plan. The agent sends the PDF as a downloadable chat attachment (not just a filesystem path, not a Library entry), and it opens with one page per recipe. Maps to `src/runtime/muse.mjs` (`attachment`) and `src/skills/chef-batch-prep-planning/SKILL.md`.
- [ ] Download the attachment on a phone and on a desktop browser, and print it; titles, steps and checkboxes fit the page. Maps to `src/skills/chef-batch-prep-planning/scripts/lib/render.mjs`.
