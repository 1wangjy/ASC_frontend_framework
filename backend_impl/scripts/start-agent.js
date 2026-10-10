'use strict';

require('../src/agent/env').loadAgentEnv();
const { createAgentApp } = require('../src/agent/server');
const port = Number(process.env.AGENT_PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid AGENT_PORT');
const server = createAgentApp().listen(port, '127.0.0.1', () => {
  console.log(`Agent local integration server: http://127.0.0.1:${port}/api/agent/health`);
});
server.on('error', (error) => { console.error(`Agent startup failed: ${error.code || error.name}`); process.exitCode = 1; });
