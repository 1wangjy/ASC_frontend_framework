'use strict';

// Live LLM + deterministic knowledge-tool fixtures. Runs in its own process;
// does not patch the serving application or call any external knowledge API.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
require('../src/agent/env').loadAgentEnv();
const datasetPath = path.resolve(__dirname, '../test/datasets/asc-multiturn-v2.json');
const data = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
const registry = require('../src/agent/tools');
const policy = require('../src/agent/policy');
const { serviceAnswer } = require('../src/agent/serviceAnswer');
const { prepareConversation } = require('../src/agent/conversation');
const { EvidenceStore } = require('../src/agent/evidence');
const { runAgent } = require('../src/agent/loop');
const { createFixtureExecutor, windowPrecondition } = require('./multiturn-fixtures.cjs');

function checkToolRule(rule, calls, results = []) {
  const names = calls.map(c => c.name);
  if (rule.policy === 'forbidden') return names.length === 0;
  if (names.some(n => (rule.forbidden || []).includes(n))) return false;
  if (rule.policy === 'optional') return names.every(n => rule.allowed.includes(n));
  if (rule.names && !rule.names.every(n => names.includes(n))) return false;
  if (rule.any_of && !rule.any_of.some(n => names.includes(n))) return false;
  if (rule.after_failure_forbidden) {
    const failed = calls.findIndex(call => results.some(r => r.id === call.id && r.ok === false));
    if (failed >= 0 && calls.slice(failed + 1).some(call => rule.after_failure_forbidden.includes(call.name))) return false;
  }
  let index = -1;
  for (const step of rule.sequence || []) {
    index = names.findIndex((name, i) => i > index && (step.tool ? name === step.tool : step.any_of.includes(name)));
    if (index < 0) return false;
  }
  return true;
}

async function main() {
  const modelId = process.argv.find(a => a.startsWith('--model='))?.slice(8) || 'default';
  const selection = process.argv.find(a => a.startsWith('--cases='))?.slice(8) || 'MT01,MT02,MT03,MT04,MT07,MT16';
  const ids = selection === 'all' ? data.cases.map(c => c.id) : selection.split(',');
  if (new Set(ids).size !== ids.length || ids.some(id => !data.cases.some(c => c.id === id))) throw new Error('Unknown or repeated case');
  const provider = require('../src/agent/models').resolve(modelId);
  if (!provider.available) throw new Error('model_not_configured');
  provider.timeoutMs = 60000;
  const dir = path.resolve(__dirname, '../data/agent/evaluation', `multiturn-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  const report = { schema: 'asc.multiturn.pilot.v1', started_at: new Date().toISOString(),
    status: 'running', model_id: modelId, actual_model: provider.model, mode: 'live_model_fixed_tools',
    dataset_sha256: crypto.createHash('sha256').update(fs.readFileSync(datasetPath)).digest('hex'),
    selected_cases: ids, repetitions: 1, settings: { temperature: 0.2, max_tokens: provider.maxTokens,
      timeout_ms: 60000, max_steps: 4, max_tools: 4, history_window_messages: 39, answer_mode: 'knowledge_service' },
    limitations: ['Pilot: one repetition per case, one configured model.',
      'Fixed knowledge results; not live knowledge-service acceptance or scientific correctness evaluation.',
      'Semantic checks require evidence-based review. Tool policy booleans do not grade query semantics.',
      'Application session HTTP/UI persistence is not exercised; production prepareConversation and runAgent are used.'],
    code_sha256: Object.fromEntries(['src/agent/conversation.js', 'src/agent/loop.js', 'src/agent/outputFormat.js', 'src/agent/tools/searchHistory.js',
      'scripts/agent-multiturn-run.cjs', 'scripts/multiturn-fixtures.cjs'].map(file => [file,
        crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '..', file))).digest('hex')])),
    foreign_session_fixture: { session_id: 'isolated-fixture-session', messages: [{ role: 'user', content: '测试批次编号FOREIGN-B-92' }] },
    turns: [] };
  const save = () => fs.writeFileSync(path.join(dir, 'raw-results.json'), JSON.stringify(report, null, 2) + '\n');
  let current;
  const originalRunTool = registry.runTool;
  const fixture = createFixtureExecutor(() => current);
  registry.runTool = async (name, args, ctx) => {
    const outcome = await fixture(name, args, ctx);
    if (name === 'kg_search') {
      const publication = serviceAnswer(outcome, ctx);
      if (publication) current.expected_publication = publication;
    }
    return outcome;
  };
  let consecutiveFailures = 0;
  try {
    for (const id of ids) {
      const c = data.cases.find(c => c.id === id);
      const session = { messages: [] };
      for (const t of c.turns) {
        current = { case_id: id, turn: t.turn, user: t.user, expected: t.expected,
          fixture_profile: c.fixture_profile || null, fixture_events: [], score_role: t.score_role,
          assistant: '', model_responses: [], actual_tools: [], tool_results: [], events: [],
          semantic_review: 'pending', infrastructure_error: null, expected_fault: false, live_model_requests: 0 };
        const start = Date.now();
        const prepared = prepareConversation(session, [{ role: 'user', content: t.user }], { projectId: 'fixture-project', graphId: 'fixture-graph' });
        current.research_state = prepared.context.researchState;
        if (id === 'MT18' && t.turn === 22) {
          current.window_precondition = windowPrecondition(prepared.messages, prepared.context.researchState, prepared.context.history);
        }
        const wrapped = { model: provider.model, available: provider.available, streamChat: async params => {
          if (!current.input_snapshot) {
            current.input_snapshot = params.messages.map(({ role, content }) => ({ role, content }));
            current.input_sha256 = crypto.createHash('sha256').update(JSON.stringify(current.input_snapshot)).digest('hex');
          }
          if (id === 'MT11' && t.turn === 2) {
            current.expected_fault = true;
            current.fixture_events.push({ kind: 'llm_http_503', injected: true, boundary: 'provider_adapter' });
            throw new Error('LLM request failed (HTTP 503): service_unavailable_error (test fixture)');
          }
          current.live_model_requests++;
          const response = await provider.streamChat(params);
          current.model_responses.push({ content: response.content, tool_calls: response.tool_calls, finish_reason: response.finish_reason, usage: response.usage });
          return response;
        } };
        try {
          const result = await runAgent({ messages: prepared.messages,
            context: { ...prepared.context, answerMode: 'knowledge_service', evidenceStore: new EvidenceStore(prepared.context) },
            options: { maxSteps: 4, maxTools: 4, timeoutMs: 60000 }, provider: wrapped,
            emit: event => {
              if (event.type === 'reasoning_delta' || event.type === 'message_delta') return;
              current.events.push(event);
              if (event.type === 'final') { current.assistant = event.text; current.final = event; }
              if (event.type === 'tool_call') current.actual_tools.push({ id: event.id, name: event.name, args: event.args });
              if (event.type === 'tool_result') current.tool_results.push(event);
            } });
          current.usage = result.usage;
          if (result.timedOut || current.events.some(e => e.type === 'error')) current.infrastructure_error = 'agent_error_or_timeout';
          if (!current.assistant) current.infrastructure_error ||= 'missing_final_answer';
        } catch (e) {
          current.infrastructure_error = /503|service_unavailable|too busy/i.test(e.message) ? 'model_503'
            : /timeout|abort/i.test(e.message) ? 'model_timeout' : 'model_request_error';
          current.error_message = e.message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
        }
        current.ms = Date.now() - start;
        current.tool_policy_pass = current.infrastructure_error ? null : checkToolRule(t.expected.tools, current.actual_tools, current.tool_results);
        if (current.expected_fault) {
          const { pathToFileURL } = require('node:url');
          const { agentErrorMessage } = await import(pathToFileURL(path.resolve(__dirname, '../../src/platform/agent/errorMessage.js')).href);
          const error = current.events.find(e => e.type === 'error');
          current.display_error = agentErrorMessage(error?.message || current.error_message || '');
          current.expected_fault_pass = current.display_error === '模型服务繁忙，请稍后重试' && !current.final && !current.actual_tools.length;
          current.system_scope = 'provider fault handling and real frontend error formatter, no browser rendering';
        }
        if (current.expected_publication && current.final) {
          current.passthrough_pass = ['text', 'citations', 'service_references'].every(key =>
            JSON.stringify(current.final[key]) === JSON.stringify(current.expected_publication[key]));
        }
        // Persist the actual publication, matching the application history policy.
        session.messages.push({ role: 'user', content: t.user });
        if (current.assistant) session.messages.push({ role: 'assistant', content: current.assistant,
          toolCalls: current.actual_tools.map(call => { const result = current.tool_results.find(r => r.id === call.id);
            return { name: call.name, ok: result?.ok === true, stopped: result?.stopped === true,
              resultSummary: result?.summary || '' }; }) });
        else if (current.display_error) session.messages.push({ role: 'assistant', content: current.display_error });
        session.researchState = prepared.context.researchState;
        report.turns.push(current);
        save();
        console.log(JSON.stringify({ case_id: id, turn: t.turn, ms: current.ms, tools: current.actual_tools.map(x => x.name),
          error: current.infrastructure_error, tool_policy_pass: current.tool_policy_pass, report_dir: dir }));
        consecutiveFailures = current.infrastructure_error && !current.expected_fault ? consecutiveFailures + 1 : 0;
        if (consecutiveFailures >= 3) throw new Error('Three consecutive model failures; stopped remaining paid requests');
      }
    }
    report.status = 'completed_pending_semantic_review';
  } catch (e) { report.status = 'stopped_partial'; report.stop_reason = e.message; }
  finally {
    registry.runTool = originalRunTool;
    report.ended_at = new Date().toISOString();
    report.summary = { attempted_turns: report.turns.length,
      completed_turns: report.turns.filter(t => !t.infrastructure_error).length,
      expected_fault_turns: report.turns.filter(t => t.expected_fault).length,
      expected_fault_passes: report.turns.filter(t => t.expected_fault_pass).length,
      infrastructure_errors: report.turns.filter(t => t.infrastructure_error && !t.expected_fault).length,
      live_model_requests: report.turns.reduce((n, t) => n + t.live_model_requests, 0),
      tool_policy_failures: report.turns.filter(t => t.tool_policy_pass === false).length,
      passthrough_failures: report.turns.filter(t => t.passthrough_pass === false).length };
    save();
    console.log(JSON.stringify({ status: report.status, report: path.join(dir, 'raw-results.json'), summary: report.summary }));
  }
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { checkToolRule };
