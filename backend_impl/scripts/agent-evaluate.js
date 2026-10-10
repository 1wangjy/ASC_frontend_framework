'use strict';
// Read archived API results only: no direct KG files, no new paid model calls.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { inspectTurn, runFixedCase } = require('../src/agent/evaluation');
async function main() {
  const root = path.resolve(__dirname, '..');
  const source = 'primary-composer-1791447147987.json';
  const bytes = await fs.readFile(path.join(root, 'data/agent/integration', source));
  const archive = JSON.parse(bytes);
  if (archive.turns.length !== 2) throw new Error('expected_two_archived_turns');
  const cases = archive.turns.map((t, i) => ({ case_id: i ? 'C2' : 'C1',
    category: i ? 'temperature_atmosphere_followup' : 'ordinary_knowledge',
    source_turn: i, source_archive: source, ...inspectTurn(t, archive.scope) }));
  for (const [i, kind] of ['empty', 'unavailable'].entries()) cases.push({
    case_id: `C${i + 3}`, category: i ? 'tool_service_anomaly' : 'insufficient_evidence',
    ...await runFixedCase(kind) });
  const report = { schema: 'agent.pilot_evaluation.v1', generated_at: new Date().toISOString(),
    archive_sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    code_fingerprint_at_real_run: archive.code_fingerprint, scope: archive.scope,
    sample_counts: { real_turns: 2, real_sessions: 1, offline_fixed_cases: 2, new_paid_calls: 0 },
    cases, limitations: [ 'No controlled before/after comparison.',
      'No effective-answer rate, scientific accuracy, p95 or invoiced cost established.',
      'No local-model or multimodal evaluation.', 'Offline anomaly does not verify live outage recovery.' ] };
  const output = path.join(root, 'data/agent/evaluation/2026-10-08');
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'pilot-results.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, samples: report.sample_counts,
    mechanics: cases.slice(0, 2).map(c => c.mechanics),
    fixtures: cases.slice(2).map(c => c.checks) }));
  if (cases.some(c => c.checks && !Object.values(c.checks).every(Boolean))) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
