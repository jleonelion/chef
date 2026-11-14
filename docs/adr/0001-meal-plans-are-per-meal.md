# Meal plans are per-meal, not per-day

Chef v1 saved one recipe per day, so a household that plans breakfast, lunch and dinner could save only its dinners and kept the rest in chat, where shopping lists, batch prep and "today" never saw it. A meal plan is now a list of planned meals, each with a date, a meal slot (breakfast, lunch, dinner or snack, the same set meal logging uses), its own servings, and either a saved recipe, free-text food, or leftovers of an earlier planned meal. Only planned meals are stored; a slot nobody listed is "not planned", never "Chef picks".

## Considered options

- **Day grid** (each day holds fixed breakfast/lunch/dinner fields, as the OpenClaw Chef did): rejected. A flat list fits days with fewer meals, snacks and eating out, and the existing readers already loop over a list.
- **Leftovers as free text**: rejected. Shopping and batch prep would then buy and cook the dish twice. A link to the meal where it was cooked lets the amount to cook be worked out as that meal's servings plus its leftovers.

## Consequences

- `servings` always means servings eaten at that meal; nutrition counts what is eaten, shopping counts what is cooked.
- Plans saved in the v1 one-per-day shape read as dinners.
