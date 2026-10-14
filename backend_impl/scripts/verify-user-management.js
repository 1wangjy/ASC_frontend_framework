#!/usr/bin/env node
'use strict';

/**
 * 多用户管理端到端验证（可重复运行，验收页也会调用它）。
 *
 * 覆盖：邮箱注册 → 待审批登录被拒 → 管理员审批 → 登录成功 → me/自助改密 → 负例（重复/弱密码/锁定/权限）。
 * 说明：管理员令牌用同一 JWT 密钥本地签发（避免改动 admin 的真实密码）。
 *
 * 用法：node backend_impl/scripts/verify-user-management.js [--base http://127.0.0.1:3001]
 */

const path = require('node:path');
const crypto = require('node:crypto');

const BASE = (process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : '') || 'http://127.0.0.1:3001';
const ROOT = path.resolve(__dirname, '..', '..');

/** 读取后端 .env（服务端的 JWT_SECRET 通常写在这里，必须与之一致，否则令牌验签失败） */
function readBackendEnv() {
  const env = {};
  try {
    const text = require('node:fs').readFileSync(path.join(ROOT, 'backend_impl', '.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch { /* 无 .env 则用默认 */ }
  return env;
}

function signAdminToken() {
  const jwt = require(path.join(ROOT, 'backend_impl', 'node_modules', 'jsonwebtoken'));
  const env = readBackendEnv();
  const secret = process.env.JWT_SECRET || env.JWT_SECRET || 'your-secret-key';
  return jwt.sign({ id: 2, username: 'admin', role: 'admin' }, secret, { expiresIn: '10m' });
}

/**
 * 本机 HTTP 一律走 curl `--noproxy '*'`：
 * 该环境设了 HTTP_PROXY=127.0.0.1:7890，Node 的 fetch（undici EnvHttpProxyAgent）会把请求打到代理，
 * 得到 502 / socket closed（已踩）。curl 加 --noproxy 可稳定直连。
 */
function call(method, url, { token, body } = {}) {
  const { spawnSync } = require('node:child_process');
  const args = ['--noproxy', '*', '-s', '-S', '-m', '30', '-o', '-', '-w', '\n%{http_code}', '-X', method, `${BASE}${url}`,
    '-H', 'Content-Type: application/json'];
  if (token) args.push('-H', `Authorization: Bearer ${token}`);
  if (body !== undefined) args.push('-d', JSON.stringify(body));
  const result = spawnSync('curl', args, { encoding: 'utf8' });
  if (result.error) return { status: 0, payload: null, error: String(result.error.message) };
  const lines = String(result.stdout || '').split('\n');
  const status = Number(lines.pop() || 0);
  let payload = null;
  try { payload = JSON.parse(lines.join('\n')); } catch { /* 非 JSON */ }
  return { status, payload };
}

const results = [];
function check(name, passed, detail) {
  results.push({ name, passed: !!passed, detail: detail === undefined ? '' : String(detail).slice(0, 160) });
  console.log(`${passed ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const stamp = Date.now().toString(36);
  const username = `qa_${stamp}`;
  const email = `${username}@accept.example.com`;
  const password = 'Passw0rd!23';

  // 1) 注册（邮箱）
  const reg = call('POST', '/api/auth/register', { body: { username, email, password, real_name: '验收测试用户' } });
  check('注册接口可用且落库为待审批', reg.status === 200 && reg.payload?.data?.status === 'pending',
    `HTTP ${reg.status} status=${reg.payload?.data?.status}`);

  // 2) 待审批登录被拒
  const loginPending = call('POST', '/api/auth/login', { body: { username, password } });
  check('待审批账号登录被拒（PENDING_APPROVAL）', loginPending.status === 403 && loginPending.payload?.error_code === 'PENDING_APPROVAL',
    `HTTP ${loginPending.status} ${loginPending.payload?.error_code}`);

  // 3) 负例：重复邮箱 / 弱密码 / 非法邮箱
  const dup = call('POST', '/api/auth/register', { body: { username: `${username}b`, email, password } });
  check('重复邮箱被拒（EMAIL_TAKEN）', dup.status === 400 && dup.payload?.error_code === 'EMAIL_TAKEN', `HTTP ${dup.status} ${dup.payload?.error_code}`);
  const weak = call('POST', '/api/auth/register', { body: { username: `${username}c`, email: `w_${email}`, password: 'abc' } });
  check('弱密码被拒（WEAK_PASSWORD）', weak.status === 400 && weak.payload?.error_code === 'WEAK_PASSWORD', `HTTP ${weak.status} ${weak.payload?.error_code}`);
  const badEmail = call('POST', '/api/auth/register', { body: { username: `${username}d`, email: 'not-an-email', password } });
  check('非法邮箱被拒（INVALID_EMAIL）', badEmail.status === 400 && badEmail.payload?.error_code === 'INVALID_EMAIL', `HTTP ${badEmail.status} ${badEmail.payload?.error_code}`);

  // 4) 非管理员不能访问用户管理
  const noToken = call('GET', '/api/user/users');
  check('未带令牌访问用户管理被拒（401）', noToken.status === 401, `HTTP ${noToken.status}`);

  const adminToken = signAdminToken();

  // 5) 管理员可见待审批列表
  const list = call('GET', `/api/user/users?status=pending&keyword=${encodeURIComponent(username)}`, { token: adminToken });
  const target = (list.payload?.data?.items || []).find((item) => item.username === username);
  check('管理员能检索到待审批用户', list.status === 200 && !!target, `HTTP ${list.status} total=${list.payload?.data?.total}`);

  // 6) 审批通过
  const approve = call('POST', `/api/user/users/${target?.id}/approve`, { token: adminToken, body: { note: '端到端脚本审批' } });
  check('管理员审批通过', approve.status === 200 && approve.payload?.data?.user?.status === 'approved', `HTTP ${approve.status}`);

  // 7) 审批后可登录
  const login = call('POST', '/api/auth/login', { body: { username, password } });
  const token = login.payload?.data?.token;
  check('审批后登录成功并签发 token', login.status === 200 && typeof token === 'string' && token.length > 20, `HTTP ${login.status}`);

  // 8) 邮箱亦可登录
  const loginByEmail = call('POST', '/api/auth/login', { body: { username: email, password } });
  check('支持用邮箱登录', loginByEmail.status === 200, `HTTP ${loginByEmail.status}`);

  // 9) /api/auth/me 与 /api/user/me
  const me = call('GET', '/api/auth/me', { token });
  check('/api/auth/me 返回当前用户', me.status === 200 && me.payload?.data?.user?.username === username, `HTTP ${me.status}`);

  // 10) 自助改密 → 新密码可登录，旧密码失效
  const newPassword = 'Passw0rd!24';
  const change = call('POST', '/api/user/password/change', { token, body: { old_password: password, new_password: newPassword } });
  check('自助改密成功', change.status === 200, `HTTP ${change.status} ${change.payload?.error_code || ''}`);
  const oldLogin = call('POST', '/api/auth/login', { body: { username, password } });
  const newLogin = call('POST', '/api/auth/login', { body: { username, password: newPassword } });
  check('改密后：旧密码失效 / 新密码可用', oldLogin.status === 401 && newLogin.status === 200,
    `old=${oldLogin.status} new=${newLogin.status}`);

  // 11) 失败锁定（连续 5 次错误密码 → 429）
  let locked = null;
  for (let i = 0; i < 6; i += 1) {
    const attempt = call('POST', '/api/auth/login', { body: { username, password: `${newPassword}-wrong` } });
    if (attempt.status === 429) { locked = attempt; break; }
  }
  check('连续失败触发锁定（429 + 重试分钟）', !!locked && Number(locked.payload?.retry_after_minutes) > 0,
    locked ? `HTTP 429 retry=${locked.payload?.retry_after_minutes}` : '未触发');

  // 12) 禁用后登录被拒 + 令牌失效
  const disable = call('PUT', `/api/user/users/${target?.id}`, { token: adminToken, body: { status: 'disabled' } });
  const disabledLogin = call('POST', '/api/auth/login', { body: { username, password: newPassword } });
  check('禁用后登录被拒（DISABLED）', disable.status === 200 && disabledLogin.status === 403 && disabledLogin.payload?.error_code === 'DISABLED',
    `HTTP ${disabledLogin.status} ${disabledLogin.payload?.error_code}`);
  const meAfterDisable = call('GET', '/api/auth/me', { token });
  check('禁用后原令牌在 /me 处失效（403）', meAfterDisable.status === 403, `HTTP ${meAfterDisable.status}`);

  // 13) 清理：软删除该测试用户（保持库干净）
  const cleanup = call('DELETE', `/api/user/users/${target?.id}`, { token: adminToken });
  check('软删除清理测试用户', cleanup.status === 200, `HTTP ${cleanup.status}`);

  const failed = results.filter((item) => !item.passed);
  // node:test 风格摘要：验收页 parseTests 依赖 "# tests / # pass / # fail"
  console.log(`# tests ${results.length}`);
  console.log(`# pass ${results.length - failed.length}`);
  console.log(`# fail ${failed.length}`);
  console.log(`\n汇总：通过 ${results.length - failed.length}/${results.length}`);
  if (failed.length) {
    console.log('未通过：', failed.map((item) => item.name).join('；'));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('验证脚本异常：', error);
  process.exitCode = 1;
});
