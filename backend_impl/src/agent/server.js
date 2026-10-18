'use strict';

// Local Agent integration entry, independent of the platform's native DB/ML
// modules. The full platform still mounts the same router in src/index.js.
const express = require('express');
const { createRouter } = require('./route');
const { createProvider } = require('./provider');

function createAgentApp(options = {}) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.get('/api/agent/health', (_req, res) => {
    try {
      const provider = options.provider || createProvider();
      res.json({ status: 'running', mode: 'local_integration',
        model_configured: provider.available, model: provider.model || null,
        auth_mode: provider.authMode || null, max_output_tokens: provider.maxTokens || null });
    } catch {
      res.status(503).json({ status: 'configuration_error', model_configured: false });
    }
  });
  app.use('/api/agent', createRouter(options));
  return app;
}

module.exports = { createAgentApp };
