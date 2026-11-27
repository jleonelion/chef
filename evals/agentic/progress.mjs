// Progress monitor for Chef agentic evals (evals/agentic/run.mjs). Read-only.
//   bun run agentic:progress -- [--dir <chef worktree>] [--watch [seconds]] [--history]
// Finds running runs via `ps`, reads their ignored results/logs/<run>/ files,
// and reports suite, harness, reps done, outcomes, per-row status, rate and ETA.
// Without a running process it reports the most recent run in --dir (default cwd).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    watch: { type: 'string' },
    history: { type: 'boolean' },
  },
  allowPositionals: true,
});
const watch = values.watch === undefined ? null : Number(values.watch) || 10;
const c = process.stdout.isTTY
  ? { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' }
  : { g: '', r: '', y: '', d: '', b: '', x: '' };

const sh = (cmd, args) => {
  try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return ''; }
};
const dur = (ms) => {
  if (!Number.isFinite(ms) || ms < 0) return '?';
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h${String(m).padStart(2, '0')}m` : m ? `${m}m${String(s % 60).padStart(2, '0')}s` : `${s}s`;
};
const parseEtime = (t) => { // [[dd-]hh:]mm:ss
  const [d, rest] = t.includes('-') ? t.split('-') : [0, t];
  const p = rest.split(':').map(Number);
  while (p.length < 3) p.unshift(0);
  return (((Number(d) * 24 + p[0]) * 60 + p[1]) * 60 + p[2]) * 1000;
};
const runStamp = (name) => { // <harness>-<sha>-<YYYYMMDDTHHMMSSmmmZ>-<id>
  const m = name.match(/-(\d{8})T(\d{2})(\d{2})(\d{2})(\d{3})Z-/);
  return m ? Date.parse(`${m[1].replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`) : NaN;
};

function runningRuns() {
  const out = [];
  for (const line of sh('ps', ['-axo', 'pid=,etime=,command=']).split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\S+)\s+(.*)$/);
    if (!m || !/^(\S*node|\S*bun)\s+(\S+\/)?evals\/agentic\/run\.mjs\b/.test(m[3])) continue;
    const cwd = sh('lsof', ['-a', '-p', m[1], '-d', 'cwd', '-Fn']).split('\n').find((l) => l.startsWith('n'))?.slice(1);
    out.push({ pid: m[1], started: Date.now() - parseEtime(m[2]), argv: m[3].split(/\s+/).map((a) => a.replace(/^"|"$/g, '')), cwd });
  }
  return out;
}

const flag = (argv, name) => { const i = argv.indexOf(`--${name}`); return i < 0 ? undefined : argv[i + 1]; };
const has = (argv, name) => argv.includes(`--${name}`);

function selectedRows(repo, argv) {
  const all = JSON.parse(fs.readFileSync(path.join(repo, 'evals/agentic/rows.json'), 'utf8'));
  const ids = flag(argv, 'rows');
  if (ids) return ids.split(',');
  if (has(argv, 'known-failures')) return all.filter((r) => r.known_failure).map((r) => r.id);
  if (has(argv, 'gates-only')) return all.filter((r) => r.gate).map((r) => r.id);
  return all.map((r) => r.id);
}

function readRun(repo, logName, argv) {
  const dir = path.join(repo, 'evals/agentic/results/logs', logName);
  const reps = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.result.json')) continue;
    try {
      const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      reps.push({ row: r.row, rep: r.rep, outcome: r.outcome, model: r.model, failures: r.failures ?? [], invalid: r.invalid, at: fs.statSync(path.join(dir, f)).mtimeMs });
    } catch { /* file still being written */ }
  }
  reps.sort((a, b) => a.at - b.at);
  return { dir, reps, rows: selectedRows(repo, argv) };
}

const bar = (done, total, w = 30) => {
  const n = total ? Math.round((done / total) * w) : 0;
  return `[${'#'.repeat(n)}${'.'.repeat(w - n)}] ${done}/${total} ${total ? Math.round((done / total) * 100) : 0}%`;
};

function render({ label, repo, logName, argv, startedAt, live, pid }) {
  const { reps, rows } = readRun(repo, logName, argv);
  const nReps = Number(flag(argv, 'reps') ?? 1);
  const total = rows.length * nReps;
  const done = reps.length;
  const pass = reps.filter((r) => r.outcome === 'pass').length;
  const failed = reps.filter((r) => r.outcome === 'failed').length;
  const other = done - pass - failed;
  const now = live ? Date.now() : reps.at(-1)?.at ?? Date.now();
  const elapsed = now - startedAt;
  const perRep = done ? elapsed / done : NaN;
  const eta = live && done && done < total ? perRep * (total - done) : NaN;
  const byRow = new Map(rows.map((id) => [id, []]));
  for (const r of reps) byRow.get(r.row)?.push(r);
  const complete = rows.filter((id) => byRow.get(id).length >= nReps).length;
  const current = live ? rows.find((id) => byRow.get(id).length < nReps) : null;
  const hflag = (n) => flag(argv, n) ?? '-';

  const lines = [];
  lines.push(`${c.b}${label}${c.x}  ${live ? `${c.g}RUNNING${c.x} pid ${pid}` : `${c.y}not running${c.x}`}`);
  lines.push(`  harness ${hflag('harness')}  judge ${hflag('judge-harness')}/${hflag('judge-model')}  reps ${nReps}  concurrency ${hflag('concurrency')}${has(argv, 'fail-fast') ? '  fail-fast' : ''}`);
  lines.push(`  tree ${repo}  head ${sh('git', ['-C', repo, 'rev-parse', '--short', 'HEAD']).trim()}  run ${logName}`);
  lines.push(`  started ${new Date(startedAt).toLocaleTimeString()}  elapsed ${dur(elapsed)}  avg/rep ${dur(perRep)}  ETA ${live ? dur(eta) : '-'}`);
  lines.push(`  reps ${bar(done, total)}   rows complete ${complete}/${rows.length}`);
  lines.push(`  ${c.g}pass ${pass}${c.x}  ${failed ? c.r : ''}failed ${failed}${c.x}  ${other ? c.y : ''}other ${other}${c.x}  unrun ${total - done}`);
  if (current) lines.push(`  current row: ${c.b}${current}${c.x} (rep ${byRow.get(current).length + 1}/${nReps})`);
  lines.push('');
  for (const id of rows) {
    const rs = byRow.get(id);
    if (!rs.length && id !== current) continue;
    const marks = [...Array(nReps).keys()].map((i) => {
      const r = rs.find((x) => x.rep === i + 1) ?? rs[i];
      return !r ? (id === current && i === rs.length ? `${c.y}>${c.x}` : `${c.d}.${c.x}`) : r.outcome === 'pass' ? `${c.g}P${c.x}` : `${c.r}F${c.x}`;
    }).join('');
    lines.push(`  ${marks}  ${id}`);
    for (const r of rs.filter((x) => x.outcome !== 'pass')) {
      const f = r.failures[0] ?? {};
      lines.push(`       ${c.r}rep ${r.rep}: ${f.check ?? r.outcome}${c.x} ${String(f.message ?? JSON.stringify(r.invalid ?? '')).slice(0, 160)}`);
    }
  }
  const last = reps.at(-1);
  if (last) lines.push('', `  last result ${dur(Date.now() - last.at)} ago: ${last.row} rep ${last.rep} ${last.outcome}${last.model ? ` (${last.model})` : ''}`);
  return lines.join('\n');
}

function latestRun(repo, harness) {
  const logs = path.join(repo, 'evals/agentic/results/logs');
  if (!fs.existsSync(logs)) return null;
  return fs.readdirSync(logs).filter((n) => Number.isFinite(runStamp(n)) && (!harness || n.startsWith(`${harness}-`)))
    .sort((a, b) => runStamp(b) - runStamp(a))[0] ?? null;
}

function report() {
  const blocks = [];
  const runs = runningRuns();
  for (const p of runs) {
    if (!p.cwd) continue;
    const repo = sh('git', ['-C', p.cwd, 'rev-parse', '--show-toplevel']).trim() || p.cwd;
    const harness = flag(p.argv, 'harness') ?? 'claude';
    const logsDir = path.join(repo, 'evals/agentic/results/logs');
    const logName = fs.existsSync(logsDir)
      ? fs.readdirSync(logsDir).filter((n) => n.startsWith(`${harness}-`) && runStamp(n) >= p.started - 120000).sort((a, b) => runStamp(a) - runStamp(b))[0]
      : null;
    if (!logName) { blocks.push(`${c.b}pid ${p.pid}${c.x} ${c.g}RUNNING${c.x} in ${repo}: no log directory yet`); continue; }
    blocks.push(render({ label: path.basename(repo), repo, logName, argv: p.argv, startedAt: p.started, live: true, pid: p.pid }));
  }
  if (!runs.length) {
    const repo = path.resolve(values.dir ?? process.cwd());
    const logName = latestRun(repo);
    if (!logName) blocks.push(`No running agentic eval and no runs under ${repo}/evals/agentic/results/logs`);
    else {
      const archive = path.join(repo, 'evals/agentic/archive');
      const summary = fs.existsSync(archive) ? fs.readdirSync(archive).filter((n) => n.endsWith('.json') && n.includes(logName.split('-').slice(1, 3).join('-'))) : [];
      const harness = logName.split('-')[0];
      blocks.push(render({ label: `${path.basename(repo)} (latest run)`, repo, logName, argv: ['--harness', harness, '--reps', '3'], startedAt: runStamp(logName), live: false }));
      if (summary.length) blocks.push(`  archived summary: ${summary.join(', ')}`);
      blocks.push(`${c.d}  Showing reps/row counts assuming --reps 3 and the full dataset; flags of finished runs are not recorded.${c.x}`);
    }
  }
  if (values.history) {
    const repo = path.resolve(values.dir ?? process.cwd());
    const archive = path.join(repo, 'evals/agentic/archive');
    if (fs.existsSync(archive)) {
      blocks.push(`${c.b}Archived summaries${c.x}`);
      for (const f of fs.readdirSync(archive).filter((n) => n.endsWith('.json')).sort()) {
        try {
          const s = JSON.parse(fs.readFileSync(path.join(archive, f), 'utf8'));
          const inv = (s.rows ?? []).reduce((n, r) => n + (r.invalid?.length ?? 0), 0);
          blocks.push(`  ${f.padEnd(62)} ${s.harness} reps ${s.reps} rows ${s.rows_selected}/${s.rows_total} passed=${s.passed} invalid reps=${inv}`);
        } catch { /* not a summary */ }
      }
    }
  }
  return blocks.join('\n\n');
}

if (watch) {
  for (;;) {
    process.stdout.write(`\x1b[2J\x1b[H${report()}\n\n${c.d}refresh ${watch}s, ctrl-c to quit${c.x}\n`);
    await new Promise((r) => setTimeout(r, watch * 1000));
  }
} else console.log(report());
