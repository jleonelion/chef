const COMMAND = /^node scripts\/\S+\.mjs\s+(\S+)(.*)$/gm;
const FLAG = /--([a-z0-9-]+)/g;
const STATUS_DECLARATION = /`status` is ((?:`[^`]+`(?:,\s*|\s+or\s+)?)+)/g;
const STATUS_SECTION = /^(?:## )?Act on `status`:?[^\n]*\n/gm;
const STATUS_BULLET = /^- `([^`]+)`:/gm;

function documentedStatuses(skillMd) {
  const statuses = [];
  for (const section of skillMd.matchAll(STATUS_SECTION)) {
    const end = skillMd.indexOf('\n## ', section.index + section[0].length);
    const body = skillMd.slice(section.index + section[0].length, end === -1 ? undefined : end);
    statuses.push(...[...body.matchAll(STATUS_BULLET)].map((match) => match[1]));
  }
  for (const declaration of skillMd.matchAll(STATUS_DECLARATION)) {
    statuses.push(...[...declaration[1].matchAll(/`([^`]+)`/g)].map((match) => match[1]));
  }
  return new Set(statuses);
}

export function scriptContractErrors(skillMd, contract, registeredStatuses) {
  const errors = [];
  for (const match of skillMd.matchAll(COMMAND)) {
    const mode = match[1];
    if (!contract.modes.includes(mode)) errors.push(`documented mode "${mode}" is not exported by the script`);
    for (const flagMatch of match[2].matchAll(FLAG)) {
      const flag = flagMatch[1];
      if (!contract.flags.includes(flag)) errors.push(`documented flag "--${flag}" is not exported by the script`);
    }
  }
  const exportedStatuses = new Set(Object.values(contract.statuses).flat());
  for (const status of documentedStatuses(skillMd)) {
    if (!exportedStatuses.has(status)) errors.push(`documented status "${status}" is not exported by the script`);
  }
  for (const status of contract.statuses.ok) {
    if (!registeredStatuses.includes(status)) errors.push(`ok status "${status}" is missing from the facts registry`);
  }
  return [...new Set(errors)];
}
