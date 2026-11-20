const denySubstrings = [
  ['CHEF_DATA_ROOT', 'CHEF_DATA_ROOT'],
  ['planning monologue', 'planning monologue'],
  ['scripts/', 'scripts/'],
  ['script path', 'script path'],
  ['fixture data root', 'fixture data root'],
  ['gmail.send', 'gmail.send'],
  ['gmail.search', 'gmail.search'],
  ['gmail.modify', 'gmail.modify'],
];

export function scanReply(response) {
  if (typeof response !== 'string') return [];
  const lower = response.toLowerCase();
  return denySubstrings
    .filter(([needle]) => needle === 'CHEF_DATA_ROOT'
      ? response.includes(needle)
      : lower.includes(needle.toLowerCase()))
    .map(([, label]) => label);
}
