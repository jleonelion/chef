// Proves the USDA FoodData Central connection with one harmless search. Never sees the key.
export async function checkUsda(fdc) {
  const result = await fdc.search('apple', { pageSize: 1 });
  if (!result.ok) return { status: 'failed', reason: result.reason };
  return { status: 'connected', food: result.foods[0]?.description ?? null };
}
