'use strict';

const path = require('node:path');
const dotenv = require('dotenv');

function loadAgentEnv() {
  const requested = process.env.AGENT_ENV_FILE;
  const local = path.resolve(__dirname, '../../.env');
  dotenv.config({ path: local });
  const source = requested || process.env.AGENT_ENV_FILE;
  if (source && path.resolve(source) !== local) dotenv.config({ path: source });
}

module.exports = { loadAgentEnv };
