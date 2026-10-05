#!/usr/bin/env node
'use strict';

/**
 * CLI 桥接：stdin 读 JSON → 解析 → stdout 输出 JSON。
 * 供 Python 端（npy/HTTP）调用，避免跨语言重复实现解析逻辑。
 *
 * 输入：{"text": "配方文本", "mode": "parse" | "xcomp", "componentFeatureNames": [...]}
 * 输出：parse → parseRecipeText 结果；xcomp → {rows, ...}
 */

const { BaseRegistry, parseRecipeText, toXComp, toXGlobal } = require('../lib/parser');

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

(async () => {
  try {
    const raw = await readStdin();
    const payload = JSON.parse(raw || '{}');
    const registry = BaseRegistry.load(payload.options || {});
    const result = parseRecipeText(payload.text || '', registry, {});
    let output = result;
    if (payload.mode === 'xcomp') {
      output = { ...result, xcomp: toXComp(result.components, payload.componentFeatureNames), xglobal: toXGlobal(payload.globalFields) };
    }
    process.stdout.write(JSON.stringify(output));
  } catch (error) {
    process.stdout.write(JSON.stringify({ error: String(error && error.message ? error.message : error) }));
    process.exitCode = 1;
  }
})();
