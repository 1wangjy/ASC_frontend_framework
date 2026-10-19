'use strict';
// Real fixed-tool acceptance only. No mocks, service reconfiguration or model quality scoring.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
require('../src/agent/env').loadAgentEnv();
const registry = require('../src/agent/tools');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'data/agent/integration', 'extra-tool-acceptance-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(output, { recursive: true });
const report = { schema: 'agent.extra_tool_acceptance.v1', started_at: new Date().toISOString(),
  mode: 'real_fixed_tool_calls', cases: [], limitations: [
    'Single real call per tool, not average latency or concurrency benchmark.',
    'Valid numerical output does not establish prediction accuracy or optimization quality.',
    'Failed call duration is not successful computation time.',
    'No main-Agent LLM or browser UI acceptance in this run.',
  ], code_sha256: {} };
for (const f of ['scripts/agent-extra-tools-acceptance.cjs', 'src/agent/tools/predict.js', 'src/agent/tools/recipeOptimize.js', 'src/agent/tools/webBrowse.js']) {
  report.code_sha256[f] = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f))).digest('hex');
}
const save = () => fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const must = (condition, message) => { if (!condition) throw new Error(message); };
async function run(tool, args, check) {
  const started = performance.now();
  console.log(JSON.stringify({ event: 'started', tool }));
  const record = { tool, args, mode: 'real_tool_call', status: 'fail' };
  try {
    const result = await registry.runTool(tool, args, { signal: AbortSignal.timeout(65000) });
    record.result = result;
    must(result.ok === true, result.summary || 'tool failed');
    check(result.data);
    record.status = 'pass';
  } catch (error) { record.error = String(error.message).slice(0, 1200); }
  record.ms = Math.round((performance.now() - started) * 1000) / 1000;
  report.cases.push(record); save();
  console.log(JSON.stringify({ event: 'finished', tool, status: record.status, ms: record.ms, error: record.error }));
}
async function main() {
  await Promise.all([
    run('predict', { X_comp: [[61, 70], [42, 30]], X_global: [3.6, 10, 0], conditions: ['110℃'], properties: ['bulk_density'] }, data => {
      must(Array.isArray(data?.predictions) && data.predictions.length > 0, 'missing predictions');
      must(data.predictions.some(p => p.property === 'bulk_density' && typeof p.value === 'number' && Number.isFinite(p.value)), 'missing finite bulk_density prediction');
    }),
    run('recipe_optimize', { algorithm: 'random', budget: 3, targets: [{ name: 'bulk_density', direction: 'maximize' }] }, data => {
      const recipe = data?.best_recipe;
      must(data.algorithm === 'random', 'algorithm mismatch');
      must(Number.isInteger(data.iterations) && data.iterations > 0 && data.iterations <= 3, 'iteration budget mismatch');
      must(Array.isArray(recipe?.materials) && recipe.materials.length > 0, 'missing recipe materials');
      must(Array.isArray(recipe.proportions) && recipe.proportions.length === recipe.materials.length, 'recipe proportions mismatch');
      must(recipe.proportions.every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0), 'invalid proportions');
      must(Math.abs(recipe.proportions.reduce((a, b) => a + b, 0) - 100) < 0.1, 'proportions do not sum to 100');
      must(data.best_predicted && Object.values(data.best_predicted).some(v => typeof v === 'number' && Number.isFinite(v)), 'missing predicted values');
    }),
    run('web_browse', { url: 'https://api.github.com/repos/1wangjy/ASC_frontend_framework' }, data => {
      must(data?.status === 200 && data.untrusted === true, 'HTTP/untrusted flag mismatch');
      must(typeof data.content === 'string' && data.content.length > 0, 'missing content');
      const body = JSON.parse(data.content);
      must(body.full_name === '1wangjy/ASC_frontend_framework', 'repository identity mismatch');
      must(new URL(data.url).hostname === 'api.github.com', 'unexpected final host');
    }),
  ]);
  report.ended_at = new Date().toISOString();
  report.counts = { pass: report.cases.filter(c => c.status === 'pass').length, fail: report.cases.filter(c => c.status === 'fail').length };
  save(); console.log(JSON.stringify({ output, counts: report.counts }));
}
main().catch(error => { report.fatal = error.message; save(); console.error(error.message); process.exitCode = 1; });
