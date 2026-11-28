// Combine several archived runs of one host into one summary for release verification.
// A run is a whole-row attempt: all reps of a row come from one run, never mixed across runs.
// The latest valid attempt of a row wins; infra-invalid attempts never supersede it, and a behavioral
// failure on the same tree stays on record until a maintainer acknowledges it.

export function attemptKind(row, reps) {
  if (row.pass && row.invalid_reps === 0 && row.valid_reps === reps) return 'pass';
  if (row.failures?.length || row.judge_failures?.length) return 'failed';
  return row.invalid_reps > 0 ? 'invalid' : 'failed';
}

const judgeId = (result) => (result.judge ? `${result.judge.harness}:${result.judge.model}` : undefined);

function identityProblems(host, runs, allowCliDrift) {
  const problems = [];
  if (runs.length < 2) return problems;
  if (runs.some(({ result }) => result.tree_sha === undefined)) {
    problems.push(`${host}: combining runs requires tree_sha in every summary; rerun the missing rows on the current code`);
  }
  const fields = {
    tree_sha: (r) => r.tree_sha,
    plugin_version: (r) => r.plugin_version,
    dataset_sha: (r) => r.dataset_sha,
    fixture_sha: (r) => r.fixture_sha,
    'harness.launcherVersion': (r) => r.harness.launcherVersion,
    ...(allowCliDrift ? {} : { 'harness.cliVersion': (r) => r.harness.cliVersion }),
    reps: (r) => r.reps,
  };
  const [base, ...rest] = runs;
  for (const [name, read] of Object.entries(fields)) {
    for (const run of rest) {
      if (read(run.result) !== read(base.result)) {
        problems.push(`${host}: ${name} differs between ${base.file} (${read(base.result)}) and ${run.file} (${read(run.result)})`);
      }
    }
  }
  const withModels = runs.filter(({ result }) => result.models?.length);
  const modelKey = ({ result }) => [...result.models].sort().join(',');
  for (const run of withModels.slice(1)) {
    if (modelKey(run) !== modelKey(withModels[0])) problems.push(`${host}: model differs between ${withModels[0].file} and ${run.file}`);
  }
  const withJudge = runs.filter(({ result }) => result.judge);
  for (const run of withJudge.slice(1)) {
    if (judgeId(run.result) !== judgeId(withJudge[0].result)) problems.push(`${host}: judge differs between ${withJudge[0].file} and ${run.file}`);
  }
  return problems;
}

// runs: [{file, result}] for one host. acknowledged: [{host, row, approved_by, reason}].
export function mergeHostRuns(host, runs, { requiredRows, reps, acknowledged = [], allowCliDrift = false }) {
  const sorted = [...runs].sort((a, b) => a.result.date.localeCompare(b.result.date));
  const problems = identityProblems(host, sorted, allowCliDrift);
  const notes = [];
  const attempts = new Map();
  for (const { file, result } of sorted) {
    for (const row of result.rows) {
      if (!requiredRows.includes(row.id)) {
        problems.push(`${host}: ${file} has unexpected row ${row.id}`);
        continue;
      }
      const list = attempts.get(row.id) ?? [];
      list.push({ file, date: result.date, row, kind: attemptKind(row, reps) });
      attempts.set(row.id, list);
    }
  }

  const chosen = new Map();
  for (const [id, list] of attempts) {
    const decisive = list.filter((attempt) => attempt.kind !== 'invalid');
    const winner = (decisive.length ? decisive : list).at(-1);
    chosen.set(id, winner);
    for (const attempt of list.filter((entry) => entry !== winner)) {
      const kinds = [...new Set((attempt.row.invalid ?? []).map((cause) => cause.kind))];
      notes.push(`${host}/${id}: superseded ${attempt.kind} attempt ${attempt.file}${kinds.length ? ` (${kinds.join(', ')})` : ''}`);
    }
    const earlierFailures = list.filter((attempt) => attempt.kind === 'failed' && attempt !== winner);
    if (winner.kind === 'pass' && earlierFailures.length) {
      const ack = acknowledged.find((entry) => entry.host === host && entry.row === id);
      if (ack) notes.push(`${host}/${id}: earlier behavioral failure acknowledged by ${ack.approved_by}: ${ack.reason}`);
      else problems.push(`${host}/${id}: earlier behavioral failure on the same tree (${earlierFailures.map((a) => a.file).join(', ')}) needs an acknowledgement`);
    }
  }

  const missing = requiredRows.filter((id) => !chosen.has(id));
  if (missing.length) problems.push(`${host}: no attempt for ${missing.length} row(s): ${missing.join(', ')}`);

  const latest = sorted.at(-1).result;
  const rows = requiredRows.filter((id) => chosen.has(id)).map((id) => chosen.get(id).row);
  const judge = sorted.find(({ result }) => result.judge)?.result.judge;
  const merged = {
    ...latest,
    ...(judge && { judge }),
    models: [...new Set(sorted.flatMap(({ result }) => result.models ?? []))],
    selected_rows: rows.map((row) => row.id),
    rows_selected: rows.length,
    passed: rows.length > 0 && rows.every((row) => row.pass),
    invalid: rows.some((row) => row.invalid_reps > 0),
    rows,
  };
  const table = requiredRows.map((id) => ({
    id,
    attempts: (attempts.get(id) ?? []).map((attempt) => ({
      file: attempt.file,
      date: attempt.date,
      kind: attempt.kind,
      passes: attempt.row.passes ?? `${attempt.row.valid_reps}/${attempt.row.valid_reps}`,
      invalid: [...new Set((attempt.row.invalid ?? []).map((cause) => cause.kind))],
      chosen: chosen.get(id) === attempt,
    })),
  }));
  return { merged, problems, notes, table };
}

// One line per attempt, ordered by row, so the PR body can show how each row's evidence was assembled.
export function formatAttemptTable(host, table) {
  return table.flatMap(({ id, attempts }) =>
    attempts.length
      ? attempts.map((a) => `${host} | ${id} | ${a.file} | ${a.kind} ${a.passes}${a.invalid.length ? ` (${a.invalid.join(', ')})` : ''} | ${a.chosen ? 'counted' : 'superseded'}`)
      : [`${host} | ${id} | - | no attempt | missing`],
  );
}
