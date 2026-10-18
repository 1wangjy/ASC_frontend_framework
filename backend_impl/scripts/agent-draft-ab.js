'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { hash, freezeCases, buildMessages, checkDraft } = require('../src/agent/draftReplay');
const { SYSTEM_PROMPT } = require('../src/agent/loop');
const { DRAFT_BOUNDARIES } = require('../src/agent/draftBoundaries');
const root = path.resolve(__dirname, '..');

async function main() {
  const live = process.argv.includes('--live');
  const source = path.join(root, 'data/agent/integration/primary-composer-1791447147987.json');
  const bytes = await fs.readFile(source);
  const cases = freezeCases(JSON.parse(bytes));
  const dir = path.join(root, 'data/agent/evaluation', `draft-ab-${Date.now()}`);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'fixed-input.json'), JSON.stringify({ archive_sha256: hash(bytes.toString()),
    baseline_system: SYSTEM_PROMPT, candidate_constraint: DRAFT_BOUNDARIES, cases }, null, 2) + '\n');
  if (!live) { console.log(JSON.stringify({ mode: 'freeze_only_no_paid_calls', directory: dir, cases: cases.length })); return; }
  require('../src/agent/env').loadAgentEnv();
  const provider = require('../src/agent/models').resolve('default');
  if (!provider.available) throw new Error('model_not_configured');
  if (provider.model !== 'deepseek-flash') throw new Error('model_differs_from_archived_baseline');
  const report = { schema: 'agent.fixed_draft_ab.v1', started_at: new Date().toISOString(),
    mode: 'real_model_fixed_archived_API_quotes_no_tools_no_session_mutation',
    model: provider.model, temperature: 0.2, max_tokens: provider.maxTokens, timeout_ms: provider.timeoutMs,
    repeats_per_case_and_variant: 3, max_requests: 12, retries: 0,
    baseline_sha256: hash(SYSTEM_PROMPT), constraint_sha256: hash(DRAFT_BOUNDARIES), runs: [],
    limitations: ['Not a complete Agent evaluation.', 'Assistant review is not expert gold.',
      'Provider cache/order and stochastic effects remain.', 'No KG calls or full-pipeline cost comparison.'] };
  const save = () => fs.writeFile(path.join(dir, 'runs.json'), JSON.stringify(report, null, 2) + '\n');
  for (let repeat = 1; repeat <= 3; repeat++) for (const fixed of cases) {
    // Alternate order; one request at a time, no automatic retry.
    for (const variant of repeat % 2 ? ['baseline', 'bounded'] : ['bounded', 'baseline']) {
      const messages = buildMessages(fixed, SYSTEM_PROMPT, variant);
      const run = { run_id: `${fixed.case_id}-${variant}-${repeat}`, case_id: fixed.case_id, variant, repeat,
        question_evidence_sha256: hash(messages[1]), evidence_sha256: fixed.evidence_sha256,
        started_at: new Date().toISOString(), status: 'running' };
      report.runs.push(run); await save();
      console.log(JSON.stringify({ event: 'started', run_id: run.run_id }));
      const started = Date.now();
      try {
        const response = await provider.chat({ messages, tools: [], temperature: 0.2 });
        run.elapsed_ms = Date.now() - started;
        run.status = 'returned'; run.text = response.content; run.finish_reason = response.finish_reason;
        run.usage = response.usage; run.unexpected_tool_calls = response.tool_calls.length;
        run.check = checkDraft(response.content, fixed).answer_check;
        run.manual_review = 'pending';
      } catch (error) {
        run.elapsed_ms = Date.now() - started; run.status = 'failed';
        // Never serialize upstream error bodies or authentication configuration.
        run.error = { name: error.name, category: error.name === 'TimeoutError' ? 'timeout' : 'provider_request_failed' };
      }
      await save(); console.log(JSON.stringify({ event: 'finished', run_id: run.run_id,
        status: run.status, ms: run.elapsed_ms, tokens: run.usage?.total, finish_reason: run.finish_reason }));
    }
  }
  report.ended_at = new Date().toISOString(); await save();
  console.log(JSON.stringify({ directory: dir, completed_requests: report.runs.length,
    failed: report.runs.filter(r => r.status === 'failed').length }));
}
main().catch(error => { console.error(JSON.stringify({ error: error.name, category: 'draft_ab_failed' })); process.exitCode = 1; });
