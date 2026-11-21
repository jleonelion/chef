export function selectRows(rows, { requestedRows, knownFailures, gatesOnly, candidates } = {}) {
  return rows
    .filter((row) => !requestedRows || requestedRows.includes(row.id))
    .filter((row) => !knownFailures || row.known_failure)
    .filter((row) => {
      if (!gatesOnly && !candidates) return true;
      if (gatesOnly && candidates) return row.gate === true || row.candidate === true;
      if (gatesOnly) return row.gate === true;
      return row.candidate === true;
    });
}
