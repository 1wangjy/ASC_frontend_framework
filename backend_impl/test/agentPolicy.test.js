/**
 * Agent policy layer: deny-by-default tool exposure, argument schema gate,
 * per-turn quota, and the private-data invariant (regression guard).
 *
 * Offline + deterministic: every case is pure (no LLM, no network).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const policy = require('../src/agent/policy');
const toolRegistry = require('../src/agent/tools');

const TOOLS_DIR = path.join(__dirname, '..', 'src', 'agent', 'tools');

test('denies a tool name that is not in the registry', async () => {
  const outcome = await toolRegistry.runTool('read_local_file', { path: './private/x.npy' });
  assert.equal(outcome.ok, false);
  assert.match(outcome.summary, /unknown tool "read_local_file"/);
  assert.equal(outcome.data, null);
});

test('denies a registered tool that is not in the per-request allowlist', async () => {
  const outcome = await toolRegistry.runTool('predict', { X_comp: [[61, 70]] }, { allowed: ['kg_list'] });
  assert.equal(outcome.ok, false);
  assert.match(outcome.summary, /"predict" is disabled for this request/);
});

test('resolveAllowedTools only narrows: unknown names grant nothing', () => {
  const registered = toolRegistry.registeredNames();
  assert.deepEqual(policy.resolveAllowedTools(['kg_list', 'rm -rf'], registered), ['kg_list']);
  assert.deepEqual(policy.resolveAllowedTools(['nope'], registered), []);
  assert.deepEqual(policy.resolveAllowedTools(undefined, registered), registered);
  assert.deepEqual(policy.resolveAllowedTools([], registered), registered);
});

test('argument schema violations are rejected before execution', async () => {
  const badType = await toolRegistry.runTool('predict', { X_comp: 'not-an-array' });
  assert.equal(badType.ok, false);
  assert.match(badType.summary, /predict\.X_comp: expected array, got string/);

  const oversized = await toolRegistry.runTool('kg_graph', { graph_id: 'g1', node_limit: 999 });
  assert.equal(oversized.ok, false);
  assert.match(oversized.summary, /kg_graph\.node_limit: must be <= 100/);

  const missing = await toolRegistry.runTool('predict', {});
  assert.equal(missing.ok, false);
  assert.match(missing.summary, /missing required argument "X_comp"/);

  const unknownKeyStripped = policy.validateArgs(
    { type: 'object', properties: { graph_id: { type: 'string' } }, required: ['graph_id'] },
    { graph_id: 'g1', file: '/etc/passwd', cmd: 'cat' },
    'kg_graph'
  );
  assert.deepEqual(unknownKeyStripped, { graph_id: 'g1' });
});

// ---------------------------------------------------------------------------
// Private-data invariant (regression guard)
// ---------------------------------------------------------------------------

const EXPECTED_TOOLS = ['kg_list', 'kg_graph', 'kg_search', 'rag_search', 'predict', 'recipe_optimize', 'web_browse', 'search_history', 'read_evidence'];
const DANGEROUS_NAME = /(^|_)(file|filesystem|fs|shell|exec|spawn|cmd|command|sql|sqlite|db|database|env|dotenv|http|fetch|curl|wget|path|dir)(_|$)/;
const FORBIDDEN_REFERENCE = [
  /(^|[^\w])private[\\/]/i,          // ./private, private/data
  /backend_impl[\\/]data/i,
  /\.sqlite\b|sqlite3?\b/i,
  /(^|[^\w])_code\b/,
  /(^|[^\w])\.env\b/,
  /readFileSync|writeFileSync|child_process|createRequire/,
];

test('registry is exactly the read-only/API tool set — no file, shell, db or generic http tool', () => {
  assert.deepEqual(toolRegistry.registeredNames(), EXPECTED_TOOLS);
  for (const name of toolRegistry.registeredNames()) {
    assert.doesNotMatch(name, DANGEROUS_NAME, `tool name "${name}" looks like a file/shell/db/http accessor`);
  }
});

test('no tool name, description or parameter schema references private paths, sqlite, _code or .env', () => {
  for (const tool of toolRegistry.listTools()) {
    const haystack = `${tool.name}\n${tool.description}\n${JSON.stringify(tool.parameters)}`;
    for (const pattern of FORBIDDEN_REFERENCE) {
      assert.doesNotMatch(haystack, pattern, `tool "${tool.name}" references ${pattern}`);
    }
  }
});

test('no tool module reads the filesystem, shells out or opens a database', () => {
  const files = fs.readdirSync(TOOLS_DIR).filter((file) => file.endsWith('.js'));
  assert.ok(files.includes('index.js') && files.length >= 8, 'tool modules were not found');
  for (const file of files) {
    const source = fs.readFileSync(path.join(TOOLS_DIR, file), 'utf8');
    assert.doesNotMatch(source, /require\(['"]node:(fs|child_process|net|dgram|vm)['"]\)/, `${file} requires a dangerous node core module`);
    assert.doesNotMatch(source, /child_process|execSync|spawnSync|\bsqlite3?\b/, `${file} contains shell/database access`);
    assert.doesNotMatch(source, /process\.env\.\w*(PATH|HOME|SECRET|TOKEN|KEY)/, `${file} reads a secret environment variable`);
  }
});

// ---------------------------------------------------------------------------
// Quota (per turn)
// ---------------------------------------------------------------------------

test('resolveQuota defaults to 8 tools / 1 optimize and never lets the client raise the caps', () => {
  const defaults = policy.resolveQuota();
  assert.equal(defaults.maxTools, 8);
  assert.equal(defaults.maxOptimize, 1);
  assert.equal(defaults.maxOptimizeHardCap, 2);

  const greedy = policy.resolveQuota({ maxTools: 1000, maxOptimize: 99 });
  assert.equal(greedy.maxTools, 32);
  assert.equal(greedy.maxOptimize, 2, 'AGENT_RECIPE_OPT_MAX_CALLS (default 2) is the hard cap');

  const envCapped = policy.resolveQuota({ maxOptimize: 5 }, { AGENT_RECIPE_OPT_MAX_CALLS: '1' });
  assert.equal(envCapped.maxOptimize, 1);

  const narrowed = policy.resolveQuota({ maxTools: 2, maxOptimize: 1 });
  assert.equal(narrowed.maxTools, 2);
  assert.equal(narrowed.maxOptimize, 1);
});

test('toolQuotaReason refuses on budget exhaustion and on repeated expensive calls', () => {
  const quota = policy.resolveQuota({ maxTools: 2, maxOptimize: 1 });

  assert.equal(policy.toolQuotaReason('kg_list', { tools: 0, optimize: 0 }, quota), null);
  assert.equal(policy.toolQuotaReason('kg_list', { tools: 1, optimize: 0 }, quota), null);

  const budget = policy.toolQuotaReason('predict', { tools: 2, optimize: 0 }, quota);
  assert.match(budget, /已达上限（2 次）/);

  const expensive = policy.toolQuotaReason('recipe_optimize', { tools: 1, optimize: 1 }, quota);
  assert.match(expensive, /recipe_optimize 本回合最多调用 1 次/);

  // Non-expensive tools are unaffected by the optimize cap.
  assert.equal(policy.toolQuotaReason('kg_search', { tools: 1, optimize: 1 }, quota), null);
});
