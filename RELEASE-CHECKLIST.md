# Release checklist

Checks for runtime behavior that automated tests cannot cover. Run these after updating Chef on Muse.

## chef-meal-logging

- In Muse chat, ask to log a meal and verify Chef previews the entry and waits for an explicit yes before writing. Source: `src/skills/chef-meal-logging/SKILL.md`.
- Log a restaurant meal and verify Chef does not mark it cooked (no inventory change). Source: `src/skills/chef-meal-logging/SKILL.md`.
- Log a cooked recipe with an ingredient missing from inventory and verify Chef reports it while keeping the entry. Source: `src/skills/chef-meal-logging/SKILL.md`.
- Ask to delete or edit a logged meal and verify Chef says there is no such command and does not reverse the inventory deduction. Source: `src/skills/chef-meal-logging/SKILL.md`.
