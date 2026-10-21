'use strict';

const path = require('node:path');
const dotenv = require('dotenv');
let proxyConfigured = false;

function loadAgentEnv() {
  const requested = process.env.AGENT_ENV_FILE;
  const local = path.resolve(__dirname, '../../.env');
  dotenv.config({ path: local });
  const source = requested || process.env.AGENT_ENV_FILE;
  if (source && path.resolve(source) !== local) dotenv.config({ path: source });
  // .env is loaded after Node startup, so NODE_USE_ENV_PROXY alone is too late.
  // Configure once, before the platform creates clients or makes requests.
  if (!proxyConfigured && process.env.NODE_USE_ENV_PROXY === '1') {
    const http = require('node:http');
    if (typeof http.setGlobalProxyFromEnv !== 'function') {
      throw new Error('NODE_USE_ENV_PROXY requires Node.js 24.14.0+ with http.setGlobalProxyFromEnv');
    }
    http.setGlobalProxyFromEnv();
    proxyConfigured = true;
  }
}

module.exports = { loadAgentEnv };
