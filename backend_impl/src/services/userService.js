'use strict';

/**
 * 用户与账号领域服务（多用户：邮箱注册 + 管理员审批 + 失败锁定 + 审计）。
 *
 * 存储统一在 SQLite `users` 表（经 `config/database` 抽象层）。
 * 状态机：pending（待审批）→ approved（可登录）｜rejected（已拒绝）｜disabled（已禁用）
 *   另：登录连续失败 MAX_LOGIN_FAILS 次 → 锁定 LOCK_MINUTES 分钟（locked_until）。
 *
 * 设计约定：
 *   - 唯一性：username 唯一；email 非空时（不区分大小写）唯一（DB 部分唯一索引兜底）。
 *   - 审批只由管理员操作，记录 approved_by / approved_at / review_note。
 *   - 任何"删除/禁用"都不能造成"没有任何可用管理员"。
 */

const bcrypt = require('bcrypt');
const database = require('../config/database');

const STATUS = Object.freeze({ PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected', DISABLED: 'disabled' });
const STATUS_LABEL = Object.freeze({ pending: '待审批', approved: '已通过', rejected: '已拒绝', disabled: '已禁用' });

const MAX_LOGIN_FAILS = Number(process.env.AUTH_MAX_LOGIN_FAILS || 5);
const LOCK_MINUTES = Number(process.env.AUTH_LOCK_MINUTES || 15);
const MIN_PASSWORD_LENGTH = Number(process.env.AUTH_MIN_PASSWORD_LENGTH || 8);

const ACCOUNT_COLUMNS = `id, username, password, role, email, real_name, status,
  approved_by, approved_at, last_login_at, fail_count, locked_until, create_time, update_time, is_delete`;

// ───────────────────────── 校验 ─────────────────────────

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validateUsername(value) {
  const username = String(value || '').trim();
  if (!username) return '请输入用户名';
  if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) return '用户名需 3–32 位，仅限字母/数字/下划线/点/连字符';
  return '';
}

function validateEmail(value) {
  const email = normalizeEmail(value);
  if (!email) return '请输入邮箱';
  if (email.length > 190) return '邮箱过长';
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) return '邮箱格式不正确';
  return '';
}

/** 密码强度：至少 MIN_PASSWORD_LENGTH 位，且同时含字母与数字（可由环境变量放宽） */
function validatePasswordStrength(value) {
  const password = String(value || '');
  if (!password) return '请输入密码';
  if (password.length < MIN_PASSWORD_LENGTH) return `密码至少 ${MIN_PASSWORD_LENGTH} 位`;
  if (process.env.AUTH_RELAX_PASSWORD === '1') return '';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return '密码需同时包含字母与数字';
  return '';
}

function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

function safeUser(row) {
  if (!row) return null;
  const { password, is_delete, ...rest } = row;
  return { ...rest, status_label: STATUS_LABEL[rest.status] || rest.status };
}

// ───────────────────────── 查询 ─────────────────────────

async function findByUsername(username) {
  const rows = await database.query(
    `SELECT ${ACCOUNT_COLUMNS} FROM users WHERE username = ? AND is_delete = 0`, [String(username || '').trim()]);
  return rows[0] || null;
}

async function findByEmail(email) {
  const rows = await database.query(
    `SELECT ${ACCOUNT_COLUMNS} FROM users WHERE lower(email) = ? AND is_delete = 0 AND email IS NOT NULL AND email <> ''`,
    [normalizeEmail(email)]);
  return rows[0] || null;
}

async function findById(id) {
  const rows = await database.query(`SELECT ${ACCOUNT_COLUMNS} FROM users WHERE id = ? AND is_delete = 0`, [Number(id)]);
  return rows[0] || null;
}

/** 判断是否已是"最后一个可用管理员"（禁止删除/禁用/降级） */
async function isLastActiveAdmin(id) {
  const rows = await database.query(
    `SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'approved' AND is_delete = 0 AND id <> ?`,
    [Number(id)]);
  return Number(rows[0]?.n || 0) === 0;
}

async function counts() {
  const rows = await database.query(
    `SELECT status, COUNT(*) AS n FROM users WHERE is_delete = 0 GROUP BY status`);
  const result = { total: 0, pending: 0, approved: 0, rejected: 0, disabled: 0 };
  for (const row of rows) {
    const key = String(row.status || 'approved');
    result[key] = Number(row.n);
    result.total += Number(row.n);
  }
  return result;
}

async function listUsers({ status = '', keyword = '', page = 1, pageSize = 50 } = {}) {
  const where = ['is_delete = 0'];
  const params = [];
  if (status && STATUS[String(status).toUpperCase()]) {
    where.push('status = ?');
    params.push(String(status).toLowerCase());
  }
  const text = String(keyword || '').trim();
  if (text) {
    where.push('(username LIKE ? OR email LIKE ? OR real_name LIKE ?)');
    params.push(`%${text}%`, `%${text}%`, `%${text}%`);
  }
  const clause = where.join(' AND ');
  const totalRows = await database.query(`SELECT COUNT(*) AS n FROM users WHERE ${clause}`, params);
  const total = Number(totalRows[0]?.n || 0);
  const size = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
  const offset = Math.max((Number(page) || 1) - 1, 0) * size;
  const rows = await database.query(
    `SELECT ${ACCOUNT_COLUMNS} FROM users WHERE ${clause} ORDER BY
       CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'disabled' THEN 2 ELSE 3 END,
       id DESC LIMIT ? OFFSET ?`, [...params, size, offset]);
  return { items: rows.map(safeUser), total, page: Number(page) || 1, pageSize: size, counts: await counts() };
}

// ───────────────────────── 注册 / 登录 ─────────────────────────

/** 新用户注册：落库为 pending，需管理员审批后方可登录。 */
async function register({ username, email, password, realName } = {}) {
  const usernameError = validateUsername(username);
  if (usernameError) return { ok: false, code: 'INVALID_USERNAME', message: usernameError };
  const emailError = validateEmail(email);
  if (emailError) return { ok: false, code: 'INVALID_EMAIL', message: emailError };
  const passwordError = validatePasswordStrength(password);
  if (passwordError) return { ok: false, code: 'WEAK_PASSWORD', message: passwordError };

  const account = String(username).trim();
  if (await findByUsername(account)) return { ok: false, code: 'USERNAME_TAKEN', message: '该用户名已被注册' };
  if (await findByEmail(email)) return { ok: false, code: 'EMAIL_TAKEN', message: '该邮箱已被注册' };

  const hashed = await hashPassword(password);
  const result = await database.execute(
    `INSERT INTO users (username, password, role, email, real_name, status, fail_count, is_delete)
     VALUES (?, ?, 'user', ?, ?, ?, 0, 0)`,
    [account, hashed, normalizeEmail(email), String(realName || '').trim(), STATUS.PENDING]);
  const created = await findById(result.lastID || result.insertId);
  return {
    ok: true,
    user: safeUser(created),
    message: '注册申请已提交，需管理员审批通过后方可登录',
  };
}

/**
 * 登录校验（含状态与锁定判定）。
 * 返回 { ok, code, message, user?, retryAfterMinutes? }
 */
async function authenticate({ username, password } = {}) {
  const account = String(username || '').trim();
  if (!account || !password) return { ok: false, code: 'MISSING_CREDENTIALS', message: '请输入用户名与密码' };

  // 支持用邮箱登录（邮箱唯一）
  const user = account.includes('@') ? await findByEmail(account) : await findByUsername(account);
  if (!user) return { ok: false, code: 'USER_NOT_FOUND', message: '用户名或密码错误' };

  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    const minutes = Math.max(1, Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000));
    return { ok: false, code: 'LOCKED', message: `账号已锁定，请约 ${minutes} 分钟后再试`, retryAfterMinutes: minutes };
  }

  if (!(await bcrypt.compare(String(password), user.password))) {
    await recordLoginFailure(user.id, user.fail_count);
    return { ok: false, code: 'BAD_PASSWORD', message: '用户名或密码错误' };
  }

  const status = String(user.status || 'approved');
  if (status === STATUS.PENDING) {
    return { ok: false, code: 'PENDING_APPROVAL', message: '账号待管理员审批，通过后即可登录' };
  }
  if (status === STATUS.REJECTED) {
    return { ok: false, code: 'REJECTED', message: user.approved_by ? `注册申请未通过${user.approved_by ? '' : ''}` : '注册申请未通过' };
  }
  if (status === STATUS.DISABLED) {
    return { ok: false, code: 'DISABLED', message: '账号已被禁用，请联系管理员' };
  }

  await recordLoginSuccess(user.id);
  return { ok: true, user: safeUser({ ...user, fail_count: 0, locked_until: null }) };
}

async function recordLoginFailure(id, currentFailCount) {
  const fails = Number(currentFailCount || 0) + 1;
  if (fails >= MAX_LOGIN_FAILS) {
    const until = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString();
    await database.execute('UPDATE users SET fail_count = ?, locked_until = ?, update_time = CURRENT_TIMESTAMP WHERE id = ?',
      [fails, until, Number(id)]);
    return { locked: true, fails };
  }
  await database.execute('UPDATE users SET fail_count = ?, update_time = CURRENT_TIMESTAMP WHERE id = ?',
    [fails, Number(id)]);
  return { locked: false, fails };
}

async function recordLoginSuccess(id) {
  await database.execute(
    `UPDATE users SET last_login_at = CURRENT_TIMESTAMP, fail_count = 0, locked_until = NULL,
      update_time = CURRENT_TIMESTAMP WHERE id = ?`, [Number(id)]);
}

// ───────────────────────── 管理操作 ─────────────────────────

/** 管理员审批通过 */
async function approve(id, adminName = '', note = '') {
  const user = await findById(id);
  if (!user) return { ok: false, code: 'NOT_FOUND', message: '用户不存在' };
  if (user.status === STATUS.APPROVED) return { ok: false, code: 'ALREADY_APPROVED', message: '该用户已是通过状态' };
  await database.execute(
    `UPDATE users SET status = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP, review_note = ?,
      fail_count = 0, locked_until = NULL, update_time = CURRENT_TIMESTAMP WHERE id = ?`,
    [STATUS.APPROVED, String(adminName || ''), String(note || ''), Number(id)]);
  return { ok: true, user: safeUser(await findById(id)), message: '已通过注册申请' };
}

/** 管理员拒绝注册 */
async function reject(id, adminName = '', note = '') {
  const user = await findById(id);
  if (!user) return { ok: false, code: 'NOT_FOUND', message: '用户不存在' };
  if (user.role === 'admin' && await isLastActiveAdmin(id)) {
    return { ok: false, code: 'LAST_ADMIN', message: '不能拒绝最后一个管理员' };
  }
  await database.execute(
    `UPDATE users SET status = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP, review_note = ?,
      update_time = CURRENT_TIMESTAMP WHERE id = ?`,
    [STATUS.REJECTED, String(adminName || ''), String(note || ''), Number(id)]);
  return { ok: true, user: safeUser(await findById(id)), message: '已拒绝该注册申请' };
}

/** 管理员启用/禁用 */
async function setStatus(id, status, adminName = '', note = '') {
  const allowed = [STATUS.APPROVED, STATUS.DISABLED, STATUS.PENDING];
  if (!allowed.includes(status)) return { ok: false, code: 'BAD_STATUS', message: `不支持的状态：${status}` };
  const user = await findById(id);
  if (!user) return { ok: false, code: 'NOT_FOUND', message: '用户不存在' };
  if (status !== STATUS.APPROVED && user.role === 'admin' && await isLastActiveAdmin(id)) {
    return { ok: false, code: 'LAST_ADMIN', message: '不能禁用最后一个管理员' };
  }
  // 管理员介入即重置登录失败计数与锁定（否则"禁用/重新启用"仍会被旧的锁定挡住）
  await database.execute(
    `UPDATE users SET status = ?, approved_by = ?, approved_at = CASE WHEN ? = 'approved' THEN CURRENT_TIMESTAMP ELSE approved_at END,
      review_note = ?, fail_count = 0, locked_until = NULL, update_time = CURRENT_TIMESTAMP WHERE id = ?`,
    [status, String(adminName || ''), status, String(note || ''), Number(id)]);
  return { ok: true, user: safeUser(await findById(id)), message: '状态已更新' };
}

/** 管理员改角色（仅 user/admin） */
async function setRole(id, role, adminName = '') {
  const next = String(role || '').trim();
  if (!['user', 'admin'].includes(next)) return { ok: false, code: 'BAD_ROLE', message: '角色只能是 user 或 admin' };
  const user = await findById(id);
  if (!user) return { ok: false, code: 'NOT_FOUND', message: '用户不存在' };
  if (next === 'user' && user.role === 'admin' && await isLastActiveAdmin(id)) {
    return { ok: false, code: 'LAST_ADMIN', message: '不能降级最后一个管理员' };
  }
  await database.execute('UPDATE users SET role = ?, approved_by = ?, update_time = CURRENT_TIMESTAMP WHERE id = ?',
    [next, String(adminName || ''), Number(id)]);
  return { ok: true, user: safeUser(await findById(id)), message: `角色已改为 ${next}` };
}

/** 管理员直接设置密码（重置） */
async function setPassword(id, password) {
  const error = validatePasswordStrength(password);
  if (error) return { ok: false, code: 'WEAK_PASSWORD', message: error };
  const user = await findById(id);
  if (!user) return { ok: false, code: 'NOT_FOUND', message: '用户不存在' };
  await database.execute(
    'UPDATE users SET password = ?, fail_count = 0, locked_until = NULL, update_time = CURRENT_TIMESTAMP WHERE id = ?',
    [await hashPassword(password), Number(id)]);
  return { ok: true, message: '密码已重置' };
}

/** 自助改密（校验原密码） */
async function changeOwnPassword(id, oldPassword, newPassword) {
  const user = await findById(id);
  if (!user) return { ok: false, code: 'NOT_FOUND', message: '用户不存在' };
  if (!(await bcrypt.compare(String(oldPassword || ''), user.password))) {
    return { ok: false, code: 'BAD_OLD_PASSWORD', message: '原密码不正确' };
  }
  const error = validatePasswordStrength(newPassword);
  if (error) return { ok: false, code: 'WEAK_PASSWORD', message: error };
  if (String(oldPassword) === String(newPassword)) {
    return { ok: false, code: 'SAME_PASSWORD', message: '新密码不能与原密码相同' };
  }
  return { ...(await setPassword(id, newPassword)), message: '密码已更新' };
}

/** 管理员软删除（不可删自己；不可删最后一个管理员） */
async function softDelete(id, operator = {}) {
  const user = await findById(id);
  if (!user) return { ok: false, code: 'NOT_FOUND', message: '用户不存在' };
  if (Number(operator.id) === Number(id)) return { ok: false, code: 'SELF_DELETE', message: '不能删除当前登录账号' };
  if (user.role === 'admin' && await isLastActiveAdmin(id)) {
    return { ok: false, code: 'LAST_ADMIN', message: '不能删除最后一个管理员' };
  }
  await database.execute('UPDATE users SET is_delete = 1, update_time = CURRENT_TIMESTAMP WHERE id = ?', [Number(id)]);
  return { ok: true, message: '用户已删除（软删除）' };
}

module.exports = {
  STATUS, STATUS_LABEL, MAX_LOGIN_FAILS, LOCK_MINUTES,
  normalizeEmail, validateUsername, validateEmail, validatePasswordStrength, hashPassword, safeUser,
  findByUsername, findByEmail, findById, counts, listUsers,
  register, authenticate, recordLoginFailure, recordLoginSuccess,
  approve, reject, setStatus, setRole, setPassword, changeOwnPassword, softDelete,
};
