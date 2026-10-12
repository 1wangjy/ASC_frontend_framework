'use strict';

/**
 * 验收检查运行器（纯本地：读文件/SQLite、调本机 HTTP、跑测试命令）。
 *
 * 与 `config/acceptanceChecks.js` 配合：注册表声明"检查什么"，本服务负责"怎么判"。
 * 所有检查都返回 { id, label, status: 'pass'|'fail'|'manual'|'error', detail, durationMs, output? }
 * 支持逐条运行，也支持 SSE 流式批量运行（页面点击 → 实时看到每条结果）。
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const registry = require('../config/acceptanceChecks');

const HTTP_TIMEOUT_MS = Number(process.env.ACCEPTANCE_HTTP_TIMEOUT_MS || 25000);
const CMD_TIMEOUT_MS = Number(process.env.ACCEPTANCE_CMD_TIMEOUT_MS || 240000);

// ───────────────────────── 基础工具 ─────────────────────────

function compare(actual, op, expect) {
  switch (op) {
    case '>=': return Number(actual) >= Number(expect);
    case '<=': return Number(actual) <= Number(expect);
    case '>': return Number(actual) > Number(expect);
    case '<': return Number(actual) < Number(expect);
    case '==': return String(actual) === String(expect);
    case '!=': return String(actual) !== String(expect);
    default: throw new Error(`未知比较符: ${op}`);
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** 点号路径取值（支持数组下标，如 models.0.holdout_r2） */
function pick(root, dotted) {
  return String(dotted).split('.').reduce((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return acc[key];
  }, root);
}

function fmt(value) {
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(4);
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 120);
  return String(value);
}

function ok(id, label, detail, extra = {}) {
  return { id, label, status: 'pass', detail, ...extra };
}
function bad(id, label, detail, extra = {}) {
  return { id, label, status: 'fail', detail, ...extra };
}

/** 解析 node --test / npm test 输出里的通过数 */
function parseTestCounts(text) {
  const pass = /^# pass (\d+)/m.exec(text);
  const fail = /^# fail (\d+)/m.exec(text);
  const tests = /^# tests (\d+)/m.exec(text);
  if (!pass && !fail) return null;
  return {
    pass: pass ? Number(pass[1]) : 0,
    fail: fail ? Number(fail[1]) : 0,
    tests: tests ? Number(tests[1]) : null,
  };
}

function spawnCommand({ cmd, args = [], cwd, parseTests = false }) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: process.env, shell: process.platform === 'win32' });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* 已退出 */ }
    }, CMD_TIMEOUT_MS);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: `${stderr}${error.message}`, timedOut: false });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut: stdout === '' && stderr === '' && code !== 0 });
    });
  });
}

/**
 * 本机 HTTP：走 `curl --noproxy '*'`。
 * 本环境 shell 设了 HTTP_PROXY=127.0.0.1:7890，node:http 的请求会被打到代理并得到 502；
 * curl 加 --noproxy 可稳定直连（与人工核验口径一致）。
 */
function curlRequest({ url, method = 'GET', body = null, timeoutMs = HTTP_TIMEOUT_MS }) {
  return new Promise((resolve) => {
    const seconds = Math.max(1, Math.round(timeoutMs / 1000));
    const args = ['--noproxy', '*', '-s', '-S', '-m', String(seconds), '-o', '-', '-w', '\n%{http_code}', '-X', method, url];
    if (body !== null) args.push('-H', 'Content-Type: application/json', '-d', typeof body === 'string' ? body : JSON.stringify(body));
    const child = spawn('curl', args, { env: process.env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => resolve({ status: 0, body: '', error: error.message }));
    child.on('close', (code) => {
      if (code !== 0 && !stdout.trim()) {
        resolve({ status: 0, body: '', error: stderr.trim() || `curl exit ${code}` });
        return;
      }
      const lines = stdout.split('\n');
      const status = Number(lines.pop() || 0);
      resolve({ status, body: lines.join('\n') });
    });
  });
}

function httpGet(url, expect, timeoutMs = HTTP_TIMEOUT_MS) {
  return curlRequest({ url, timeoutMs }).then((result) => ({ ...result, expect }));
}

function httpPostJson(url, payload, timeoutMs = HTTP_TIMEOUT_MS) {
  return curlRequest({ url, method: 'POST', body: payload, timeoutMs });
}

// ───────────────────────── 各 kind 的实现 ─────────────────────────

async function runSqlite(check) {
  if (!fs.existsSync(check.db)) return bad(check.id, check.label, `数据库文件不存在：${check.db}`);
  let DatabaseSync;
  try {
    ({ DatabaseSync } = require('node:sqlite'));   // Node 22+ 内置，零额外依赖
  } catch {
    return bad(check.id, check.label, '当前 Node 不支持 node:sqlite，无法执行 SQL 核验');
  }
  try {
    const db = new DatabaseSync(check.db, { readOnly: true });
    const row = db.prepare(check.query).get();
    db.close();
    const value = row ? Object.values(row)[0] : null;
    const passed = compare(value, check.op, check.expect);
    const detail = `${check.query} → ${fmt(value)}（要求 ${check.op} ${fmt(check.expect)}）`;
    return passed ? ok(check.id, check.label, detail) : bad(check.id, check.label, detail);
  } catch (error) {
    return bad(check.id, check.label, `SQL 执行失败：${error.message}`);
  }
}

function runJson(check) {
  if (!fs.existsSync(check.file)) return bad(check.id, check.label, `文件不存在：${check.file}`);
  let data;
  try {
    data = readJson(check.file);
  } catch (error) {
    return bad(check.id, check.label, `JSON 解析失败：${error.message}`);
  }
  const assertion = check.assert || {};
  if (assertion.every) {
    const list = pick(data, assertion.path);
    if (!Array.isArray(list) || !list.length) return bad(check.id, check.label, `${assertion.path} 不是非空数组`);
    const badRows = list.filter((row) => !compare(pick(row, assertion.every.field), assertion.every.op, assertion.every.value));
    const detail = `${assertion.path}: ${list.length} 条，${badRows.length} 条不满足 ${assertion.every.field} ${assertion.every.op} ${assertion.every.value}`;
    return badRows.length ? bad(check.id, check.label, detail) : ok(check.id, check.label, detail);
  }
  const value = pick(data, assertion.path);
  const passed = compare(value, assertion.op, assertion.value);
  const detail = `${assertion.path} = ${fmt(value)}（要求 ${assertion.op} ${fmt(assertion.value)}）`;
  return passed ? ok(check.id, check.label, detail) : bad(check.id, check.label, detail);
}

function runJsonStat(check) {
  if (!fs.existsSync(check.file)) return bad(check.id, check.label, `文件不存在：${check.file}`);
  const data = readJson(check.file);
  const rules = [
    ['配方总数', '>=', 300],
    ['组分记录数', '>=', 300],
        ];
  const tableRules = [['material_base', '>=', 80]];
  const failures = [];
  const facts = [];
  for (const [key, op, expect] of rules) {
    const value = data[key];
    facts.push(`${key}=${fmt(value)}`);
    if (!compare(value, op, expect)) failures.push(`${key} ${fmt(value)} 不满足 ${op} ${expect}`);
  }
  for (const [key, op, expect] of tableRules) {
    const value = (data['非空表'] || {})[key];
    facts.push(`非空表.${key}=${fmt(value)}`);
    if (!compare(value, op, expect)) failures.push(`非空表.${key} ${fmt(value)} 不满足 ${op} ${expect}`);
  }
  const detail = facts.join('、');
  return failures.length ? bad(check.id, check.label, `${detail}｜不达标：${failures.join('；')}`) : ok(check.id, check.label, detail);
}

function runDeviationCsv(check) {
  if (!fs.existsSync(check.file)) return bad(check.id, check.label, `文件不存在：${check.file}`);
  const text = fs.readFileSync(check.file, 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const header = lines.shift().split(',');
  const index = (name) => header.indexOf(name);
  const iProp = index('属性'); const iCond = index('工况'); const iDev = index('偏差pct'); const iOk = index('是否≤25%');
  if ([iProp, iCond, iDev, iOk].some((i) => i < 0)) {
    return bad(check.id, check.label, `CSV 表头缺少必需列：${header.join(',')}`);
  }
  const rows = lines.map((line) => line.split(','));
  const perProperty = new Map();
  let within = 0;
  for (const row of rows) {
    const dev = Number(row[iDev]);
    const prop = row[iProp];
    if (Number.isFinite(dev)) {
      if (!perProperty.has(prop)) perProperty.set(prop, []);
      perProperty.get(prop).push(dev);
      if (dev <= 25) within += 1;
    }
  }
  const propertyStats = [...perProperty.entries()].map(([name, values]) => ({
    name, count: values.length,
    mean: values.reduce((sum, v) => sum + v, 0) / values.length,
  }));
  const overMean = propertyStats.filter((s) => s.mean > 25);
  const failures = [];
  if (rows.length < 200) failures.push(`样本数 ${rows.length} < 200`);
  if (within < 200) failures.push(`偏差≤25% 的样本只有 ${within} 条`);
  if (overMean.length) failures.push(`逐属性均值超阈值：${overMean.map((s) => `${s.name} ${s.mean.toFixed(2)}%`).join('、')}`);
  const detail = `样本 ${rows.length} 条，≤25% 共 ${within} 条；逐属性均值 ` +
    propertyStats.map((s) => `${s.name} ${s.mean.toFixed(2)}%（n=${s.count}）`).join('、');
  return failures.length ? bad(check.id, check.label, `${detail}｜${failures.join('；')}`) : ok(check.id, check.label, detail);
}

function runOptCases(check) {
  if (!fs.existsSync(check.file)) return bad(check.id, check.label, `文件不存在：${check.file}`);
  const data = readJson(check.file);
  const cases = Array.isArray(data['案例']) ? data['案例'] : [];
  const declared = Number(data['案例数'] || 0);
  const notAchieved = cases.filter((item) => {
    const achieved = item['目标达成'];
    if (!achieved || typeof achieved !== 'object') return true;
    return !Object.values(achieved).some((v) => v === true || v === 'True' || v === 'true');
  });
  const failures = [];
  if (declared < 2) failures.push(`案例数 ${declared} < 2`);
  if (cases.length < 2) failures.push(`案例明细 ${cases.length} 条 < 2`);
  if (notAchieved.length) failures.push(`${notAchieved.length} 个案例未见目标达成`);
  const detail = `案例数 ${declared}，明细 ${cases.length} 条，目标达成 ${cases.length - notAchieved.length}/${cases.length}；` +
    `算法 ${cases[0]?.['算法'] || '-'}，迭代 ${cases[0]?.['迭代次数'] || '-'}`;
  return failures.length ? bad(check.id, check.label, `${detail}｜${failures.join('；')}`) : ok(check.id, check.label, detail);
}

function runKgStats(check) {
  if (!fs.existsSync(check.file)) return bad(check.id, check.label, `文件不存在：${check.file}`);
  const data = readJson(check.file);
  const entityTypes = Number(data['实体类型数'] || (data['实体类型分布'] || []).length);
  const relationTypes = Number(data['关系类型数'] || (data['关系类型分布'] || []).length);
  const ontology = data['固定本体'] || {};
  const failures = [];
  if (entityTypes < 10) failures.push(`实体类型数 ${entityTypes} < 10`);
  if (relationTypes < 10) failures.push(`关系类型数 ${relationTypes} < 10`);
  if (!(Number(data['节点数']) > 0)) failures.push('节点数非正');
  if (!(Number(data['边数']) > 0)) failures.push('边数非正');
  if (Number(ontology['实体类'] || 0) < 10 || Number(ontology['关系类'] || 0) < 10) {
    failures.push(`固定本体 ${ontology['实体类']}/${ontology['关系类']} < 10/10`);
  }
  const detail = `节点 ${data['节点数']} / 边 ${data['边数']} / 实体类型 ${entityTypes} / 关系类型 ${relationTypes}` +
    `（本体 ${ontology['实体类']}类实体 + ${ontology['关系类']}类关系）`;
  return failures.length ? bad(check.id, check.label, `${detail}｜${failures.join('；')}`) : ok(check.id, check.label, detail);
}

function runFile(check) {
  if (!fs.existsSync(check.file)) return bad(check.id, check.label, `文件不存在：${check.file}`);
  const stat = fs.statSync(check.file);
  const min = Number(check.minBytes || 1);
  const detail = `${path.basename(check.file)}：${(stat.size / 1024).toFixed(1)} KB` +
    (min > 1 ? `（要求 ≥${(min / 1024).toFixed(1)} KB）` : '');
  return stat.size >= min ? ok(check.id, check.label, detail) : bad(check.id, check.label, `${detail} 体积不足`);
}

async function runHttp(check) {
  const result = await httpGet(check.url, check.expect);
  if (result.error) return bad(check.id, check.label, `请求失败：${result.error}（${check.url}）`);
  const detail = `${check.url} → HTTP ${result.status}`;
  return Number(result.status) === Number(check.expect) ? ok(check.id, check.label, detail) : bad(check.id, check.label, `${detail}（要求 ${check.expect}）`);
}

async function runHttpJson(check) {
  const result = await httpGet(check.url);
  if (result.error) return bad(check.id, check.label, `请求失败：${result.error}（${check.url}）`);
  let data;
  try {
    data = JSON.parse(result.body);
  } catch (error) {
    return bad(check.id, check.label, `响应非 JSON（HTTP ${result.status}）：${result.body.slice(0, 120)}`);
  }
  const assertion = check.assert || {};
  if (assertion.minLength !== undefined) {   // 裸数组响应（如文献列表）按条数断言
    const length = Array.isArray(data) ? data.length : -1;
    const passed = length >= Number(assertion.minLength);
    const detail = `HTTP ${result.status}｜返回 ${length} 条（要求 ≥${assertion.minLength}）`;
    return passed ? ok(check.id, check.label, detail) : bad(check.id, check.label, detail);
  }
  const value = pick(data, assertion.path);
  const passed = compare(value, assertion.op, assertion.value);
  const detail = `HTTP ${result.status}｜${assertion.path} = ${fmt(value)}（要求 ${assertion.op} ${fmt(assertion.value)}）`;
  return passed ? ok(check.id, check.label, detail) : bad(check.id, check.label, detail);
}

/** 性能预测在线冒烟：用固定样本调用推理服务，要求返回有限值 */
async function runHttpPredict(check) {
  const payload = {
    X_comp: [[61, 10.0, 8.0, 15.0, '棕刚玉'], [53, 22.0, 0.0, 1.0, '高铝']],
    X_global: [3.6, 10, 0],
    properties: ['bulk_density', 'cold_modulus', 'crushing_strength', 'linear_change'],
    conditions: ['110℃', '1450℃/1500℃'],
  };
  const result = await httpPostJson('http://127.0.0.1:8100/api/v1/predict/simple', payload, 60000);
  if (result.error) return bad(check.id, check.label, `请求失败：${result.error}`);
  let data;
  try {
    data = JSON.parse(result.body);
  } catch {
    return bad(check.id, check.label, `响应非 JSON（HTTP ${result.status}）`);
  }
  const predictions = (data.predictions || []).filter((p) => Number.isFinite(Number(p.value)));
  const versions = [...new Set((data.predictions || []).map((p) => p.model?.version).filter(Boolean))];
  const detail = `预测 ${predictions.length}/${(data.predictions || []).length} 条有限值；模型版本 ${versions.join(',') || '-'}`;
  const passed = result.status === 200 && predictions.length >= 4;
  return passed ? ok(check.id, check.label, detail) : bad(check.id, check.label, detail);
}

async function runCommand(check) {
  const { code, stdout, stderr, timedOut } = await spawnCommand(check);
  const combined = `${stdout}\n${stderr}`;
  if (check.parseTests) {
    const counts = parseTestCounts(combined);
    if (counts) {
      const passed = counts.fail === 0 && counts.pass > 0;
      const detail = `tests ${counts.tests ?? '-'}｜pass ${counts.pass}｜fail ${counts.fail}（exit ${code}）`;
      const output = combined.split('\n').filter((l) => /^(not ok|# (tests|pass|fail))/.test(l)).slice(0, 20).join('\n');
      return passed ? ok(check.id, check.label, detail, { output }) : bad(check.id, check.label, `${detail}${timedOut ? '（超时）' : ''}`, { output });
    }
  }
  const passed = code === 0 && !timedOut;
  const tail = combined.trim().split('\n').slice(-6).join('\n');
  return passed ? ok(check.id, check.label, 'exit 0', { output: tail })
    : bad(check.id, check.label, `exit ${code}${timedOut ? '（超时）' : ''}`, { output: tail.slice(0, 600) });
}

/** 平台结构核验：路由/支柱/二级菜单 + 验收页自身是否注册 */
function runPlatformStructure(check) {
  const routesFile = path.join(registry.REPO, 'src', 'config', 'ascRoutes.js');
  const navFile = path.join(registry.REPO, 'src', 'features', 'navigation', 'appNavigation.js');
  if (!fs.existsSync(routesFile) || !fs.existsSync(navFile)) {
    return bad(check.id, check.label, '缺少 ascRoutes.js 或 appNavigation.js');
  }
  const routesSrc = fs.readFileSync(routesFile, 'utf8');
  const navSrc = fs.readFileSync(navFile, 'utf8');
  const routeNames = [...routesSrc.matchAll(/name:\s*'([^']+)'/g)].map((m) => m[1]);
  const pillars = [...navSrc.matchAll(/label:\s*'([^']+)'/g)].map((m) => m[1]);
  const childPaths = [...navSrc.matchAll(/path:\s*'([^']+)'/g)].map((m) => m[1]);
  const failures = [];
  if (!routeNames.includes('Acceptance2026')) failures.push('验收页路由 Acceptance2026 未注册');
  if (!navSrc.includes('/platform/acceptance')) failures.push('侧边栏未挂载验收页入口');
  if (pillars.filter((p) => ['问题研究', '数据平台', '模型入口'].includes(p)).length < 3) {
    failures.push('三支柱（问题研究/数据平台/模型入口）不完整');
  }
  const detail = `路由 ${routeNames.length} 条｜支柱 ${pillars.slice(0, 6).join('/')}｜菜单项 ${childPaths.length} 个｜验收页已注册`;
  return failures.length ? bad(check.id, check.label, `${detail}｜${failures.join('；')}`) : ok(check.id, check.label, detail);
}

async function runManual(check) {
  return { id: check.id, label: check.label, status: 'manual', detail: check.note || '需人工确认', output: '' };
}

const RUNNERS = {
  sqlite: runSqlite,
  json: runJson,
  'json-stat': runJsonStat,
  'deviation-csv': runDeviationCsv,
  'opt-cases': runOptCases,
  'kg-stats': runKgStats,
  file: runFile,
  http: runHttp,
  'http-json': runHttpJson,
  'http-predict': runHttpPredict,
  command: runCommand,
  'platform-structure': runPlatformStructure,
  manual: runManual,
};

/** 找到 check 定义（含所属验收项） */
function findCheck(checkId) {
  for (const item of registry.items) {
    const check = item.checks.find((c) => c.id === checkId);
    if (check) return { item, check };
  }
  return null;
}

/** 运行单条检查 */
async function runCheck(checkId) {
  const found = findCheck(checkId);
  if (!found) return { id: checkId, label: checkId, status: 'error', detail: '未找到该检查项', durationMs: 0 };
  const { item, check } = found;
  const start = Date.now();
  const runner = RUNNERS[check.kind];
  if (!runner) return { id: checkId, label: check.label, status: 'error', detail: `未知检查类型 ${check.kind}`, durationMs: 0 };
  try {
    const result = await runner(check);
    return { ...result, itemId: item.id, itemTitle: item.title, durationMs: Date.now() - start };
  } catch (error) {
    return { id: checkId, label: check.label, itemId: item.id, itemTitle: item.title, status: 'error', detail: `执行异常：${error.message}`, durationMs: Date.now() - start };
  }
}

/** 逐条运行（回调可在每条完成时推送，用于 SSE） */
async function runAll({ onResult = () => {}, only = null } = {}) {
  const results = [];
  for (const item of registry.items) {
    for (const check of item.checks) {
      if (only && !only.includes(check.id)) continue;
      const result = await runCheck(check.id);
      results.push(result);
      onResult(result);
    }
  }
  const summary = {
    total: results.length,
    pass: results.filter((r) => r.status === 'pass').length,
    fail: results.filter((r) => r.status === 'fail').length,
    manual: results.filter((r) => r.status === 'manual').length,
    error: results.filter((r) => r.status === 'error').length,
  };
  return { results, summary };
}

module.exports = { runCheck, runAll, publicRegistry: registry.publicRegistry };
