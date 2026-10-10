'use strict';

const fs = require('node:fs');
const path = require('node:path');
require('../src/agent/env').loadAgentEnv();
const { runPreflight } = require('../src/agent/modelPreflight');
const models = require('../src/agent/models');

async function main() {
  const args = process.argv.slice(2);
  const modelId = args.find(arg => !arg.startsWith('--')) || 'local-finetuned';
  const report = await runPreflight({ modelId, live: args.includes('--live'), ...models });
  const dir = path.resolve(__dirname, '../data/agent/integration/model-preflight');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `preflight-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ ...report, file }, null, 2));
  if (!['configuration_only', 'passed_protocol_only'].includes(report.status)) process.exitCode = 1;
}
main().catch(() => { console.error('model_preflight_configuration_error'); process.exitCode = 1; });
