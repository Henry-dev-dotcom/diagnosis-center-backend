import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const phases = Array.from({ length: 10 }, (_, index) => index + 1);
const results = [];

for (const phase of phases) {
  const script = `scripts/check-phase${phase}.mjs`;
  const startedAt = new Date().toISOString();
  const run = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const result = {
    phase,
    script,
    status: run.status === 0 ? 'passed' : 'failed',
    startedAt,
    finishedAt: new Date().toISOString(),
    stdout: run.stdout.trim(),
    stderr: run.stderr.trim()
  };
  results.push(result);

  if (run.stdout.trim()) console.log(run.stdout.trim());
  if (run.stderr.trim()) console.error(run.stderr.trim());

  if (run.status !== 0) {
    fs.writeFileSync(path.join(root, 'docs/backend-phase-chain-qa-results.json'), `${JSON.stringify({ status: 'failed', results }, null, 2)}\n`);
    process.exit(run.status ?? 1);
  }
}

fs.writeFileSync(path.join(root, 'docs/backend-phase-chain-qa-results.json'), `${JSON.stringify({ status: 'passed', checkedAt: new Date().toISOString(), results }, null, 2)}\n`);
console.log('Backend foundation phase-chain static QA passed for phases 1 through 10.');
