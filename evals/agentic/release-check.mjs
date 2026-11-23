export function verifyReleaseEvidence({
  evidence = [],
  requiredHosts = ['codex', 'claude', 'copilot'],
  requiredRows = [],
  reps = 3,
  exceptions = [],
} = {}) {
  const failures = [];
  if (!requiredRows.length) failures.push('release evidence: no required rows selected');

  for (const host of requiredHosts) {
    const exception = exceptions.find((entry) => entry.host === host);
    const matches = evidence.filter((result) => result.harness?.name === host);
    if (!matches.length) {
      if (exception?.approved_by && exception.reason && Array.isArray(exception.missing_rows)) {
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
    if (!result.passed) failures.push(`${host}: result aggregate is not passing`);
    if (JSON.stringify(result.selected_rows) !== JSON.stringify(requiredRows)) {
      failures.push(`${host}: incomplete or mismatched full-suite selection`);
    }
    if (result.rows_selected !== requiredRows.length) {
      failures.push(`${host}: incomplete row count (${result.rows_selected}/${requiredRows.length})`);
    }
    if (!Array.isArray(result.rows) || result.rows.length !== requiredRows.length) {
      failures.push(`${host}: zero or incomplete row outcomes`);
      continue;
    }
    for (const row of result.rows) {
      if (!requiredRows.includes(row.id)) {
        failures.push(`${host}: unexpected row ${row.id}`);
        continue;
      }
      if (row.invalid_reps > 0) failures.push(`${host}/${row.id}: ${row.invalid_reps} invalid repetitions`);
      if (row.valid_reps !== reps) failures.push(`${host}/${row.id}: expected ${reps} valid repetitions, found ${row.valid_reps}`);
      if (!row.pass || row.pass_rate !== 1) failures.push(`${host}/${row.id}: failing or incomplete row`);
      if (row.judge && row.judge.status !== 'passing') failures.push(`${host}/${row.id}: judge did not pass`);
    }
  }

  const recordedExceptions = exceptions
    .filter((entry) => entry.approved_by && entry.reason && Array.isArray(entry.missing_rows))
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
