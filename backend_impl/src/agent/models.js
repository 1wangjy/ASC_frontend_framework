'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createProvider, OpenAICompatibleProvider } = require('./provider');

// Only operator-owned configuration can choose URLs and credential env names.
function entries() {
  const list = [{ id: 'default', label: '默认模型', kind: 'cloud', provider: createProvider() }];
  if (!process.env.AGENT_MODELS_FILE) return list;
  const file = path.resolve(process.env.AGENT_MODELS_FILE);
  if (fs.statSync(file).size > 65536) throw new Error('model_configuration_invalid');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(data.models) || data.models.length > 15) throw new Error('model_configuration_invalid');
  const seen = new Set(['default']);
  for (const item of data.models) {
    if (!item || !/^[a-zA-Z0-9_-]{1,64}$/.test(item.id) || seen.has(item.id)
      || !['local', 'cloud'].includes(item.kind) || typeof item.model !== 'string' || !item.model.trim()
      || !['bearer', 'none'].includes(item.authMode) || typeof item.label !== 'string'
      || item.label.length > 100 || (item.keyEnv && !/^[A-Z][A-Z0-9_]{0,100}$/.test(item.keyEnv))) {
      throw new Error('model_configuration_invalid');
    }
    if (item.apiUrl) {
      const url = new URL(item.apiUrl);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        throw new Error('model_configuration_invalid');
      }
    }
    seen.add(item.id);
    list.push({ id: item.id, label: item.label, kind: item.kind, disabled: item.enabled === false,
      provider: new OpenAICompatibleProvider({ apiUrl: item.apiUrl || '', model: item.model,
        authMode: item.authMode, apiKey: item.keyEnv ? process.env[item.keyEnv] || '' : '',
        maxTokens: item.maxTokens || 2048 }) });
  }
  return list;
}
function catalog() {
  return { default_id: 'default', models: entries().map(({ id, label, kind, provider, disabled }) => ({
    id, label, kind, model: provider.model, configured: !disabled && provider.available,
    status: disabled ? 'disabled' : provider.available ? 'configured_not_capability_verified' : 'not_configured',
  })) };
}
function resolve(id) {
  const requested = id === undefined ? 'default' : id;
  if (typeof requested !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(requested)) throw new Error('invalid_model_id');
  const found = entries().find((item) => item.id === requested);
  if (!found) throw new Error('unknown_model_id');
  if (found.disabled || (requested !== 'default' && !found.provider.available)) throw new Error('model_not_configured');
  found.provider.profileId = found.id;
  return found.provider;
}
module.exports = { catalog, resolve };
