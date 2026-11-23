export function verifyReleaseEvidence({
  evidence = [],
  requiredHosts = ['codex', 'claude', 'copilot'],
  requiredRows = [],
  requiredJudgeRows = [],
  reps = 3,
  exceptions = [],
} = {}) {
  const failures = [];
  if (reps !== 3) failures.push('release evidence: repetitions must be exactly 3');
  if (!requiredRows.length) failures.push('release evidence: no required rows selected');
  const validException = (entry) =>
    entry?.approved_by &&
    entry.reason &&
    Array.isArray(entry.missing_rows) &&
    entry.missing_rows.length > 0 &&
    new Set(entry.missing_rows).size === entry.missing_rows.length &&
    entry.missing_rows.every((id) => requiredRows.includes(id));

  const judgeIdentities = [];
  for (const host of requiredHosts) {
    const exception = exceptions.find((entry) => entry.host === host);
    const matches = evidence.filter((result) => result.harness?.name === host);
    if (!matches.length) {
      if (validException(exception)) {
        failures.push(`${host}: missing evidence recorded as approved subscription-limit exception`);
      } else {
        failures.push(`${host}: missing release evidence`);
      }
      continue;
    }
    if (matches.length !== 1) {
      failures.push(`${host}: expected one release result, found ${matches.length}`);
      continue;
    }
    const result = matches[0];
    if (result.reps !== reps) failures.push(`${host}: expected ${reps} repetitions, found ${result.reps}`);
    if (result.invalid) failures.push(`${host}: result contains invalid repetitions`);
    if (JSON.stringify(result.selected_rows) !== JSON.stringify(requiredRows)) {
      failures.push(`${host}: incomplete or mismatched full-suite selection`);
    }
    if (result.rows_selected !== requiredRows.length) {
      failures.push(`${host}: incomplete row count (${result.rows_selected}/${requiredRows.length})`);
    }
    if (requiredJudgeRows.length) {
      if (result.judge?.type !== 'subscription-cli' ||
          !['claude', 'codex', 'copilot'].includes(result.judge.harness) ||
          typeof result.judge.model !== 'string' ||
          !result.judge.model.trim()) {
        failures.push(`${host}: judge identity missing or invalid`);
      } else {
        judgeIdentities.push(result.judge);
      }
    }
    if (!Array.isArray(result.rows) || result.rows.length !== requiredRows.length) {
      failures.push(`${host}: zero or incomplete row outcomes`);
      continue;
    }
    for (const rowId of requiredRows) {
      const count = result.rows.filter((row) => row.id === rowId).length;
      if (count !== 1) failures.push(`${host}: missing required row ${rowId}`);
    }
    if (new Set(result.rows.map((row) => row.id)).size !== result.rows.length) {
      failures.push(`${host}: duplicate row outcomes`);
    }
    for (const row of result.rows) {
      if (!requiredRows.includes(row.id)) {
        failures.push(`${host}: unexpected row ${row.id}`);
        continue;
      }
      if (row.known_failure && row.known_failure_reproduced !== true) {
        failures.push(`${host}/${row.id}: known-failure row not reproduced`);
      }
      if (requiredJudgeRows.includes(row.id) && (!row.judge || row.judge.status !== 'passing' || row.judge.passes !== '3/3')) {
        failures.push(`${host}/${row.id}: judge did not pass 3/3`);
      }
      if (row.invalid_reps > 0) failures.push(`${host}/${row.id}: ${row.invalid_reps} invalid repetitions`);
      if (row.valid_reps !== reps) failures.push(`${host}/${row.id}: expected ${reps} valid repetitions, found ${row.valid_reps}`);
      if (!row.pass) failures.push(`${host}/${row.id}: failing or incomplete row`);
      if (!row.known_failure && row.pass_rate !== 1) failures.push(`${host}/${row.id}: failing or incomplete row`);
      const rowRuns = row.runs ?? [];
      if (rowRuns.length !== reps) failures.push(`${host}/${row.id}: expected ${reps} rep outcomes, found ${rowRuns.length}`);
      for (const rep of [1, 2, 3]) {
        const run = rowRuns.find((entry) => entry.rep === rep);
        if (!run || run.outcome === 'invalid' || (!row.known_failure && run.outcome !== 'pass')) {
          failures.push(`${host}/${row.id}/rep ${rep}: missing, invalid or failing rep`);
        }
      }
      if (row.judge && row.judge.status !== 'passing') failures.push(`${host}/${row.id}: judge did not pass`);
    }
    for (const judgeRow of requiredJudgeRows) {
      if (!result.rows.some((row) => row.id === judgeRow)) {
        failures.push(`${host}/${judgeRow}: missing judge row`);
      }
    }
  }
  if (judgeIdentities.length > 1) {
    const first = `${judgeIdentities[0].harness}:${judgeIdentities[0].model}`;
    for (const identity of judgeIdentities.slice(1)) {
      if (`${identity.harness}:${identity.model}` !== first) {
        failures.push('release evidence: judge identity differs across hosts');
        break;
      }
    }
  }

  const recordedExceptions = exceptions
    .filter((entry) => validException(entry) && requiredHosts.includes(entry.host) &&
      !evidence.some((result) => result.harness?.name === entry.host))
    .map((entry) => ({
      host: entry.host,
      approved_by: entry.approved_by,
      reason: entry.reason,
      missing_rows: entry.missing_rows,
    }));
  if (failures.length) {
    return {
      passed: false,
      status: recordedExceptions.length ? 'exception' : 'fail',
      missing: requiredHosts.filter((host) => !evidence.some((result) => result.harness?.name === host)),
      failures,
      exceptions: recordedExceptions,
    };
  }
  return { passed: true, status: 'pass', missing: [], failures: [], exceptions: [] };
}
