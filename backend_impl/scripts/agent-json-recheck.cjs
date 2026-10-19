'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function read(dir) { return JSON.parse(fs.readFileSync(path.join(dir, 'raw-results.json'), 'utf8')); }
function main() {
  const [selected, ...other] = process.argv.slice(2).map(p => path.resolve(p));
  if (!selected) throw new Error('Usage: node agent-json-recheck.cjs <selected-run> [other-attempts...]');
  const r = read(selected), turns = r.turns;
  if (turns.length !== 24 || turns.some(t => t.case_id !== 'MT18')) throw new Error('Expected MT18 full 24 turns');
  const t22 = turns.find(t => t.turn === 22), t23 = turns.find(t => t.turn === 23), t24 = turns.find(t => t.turn === 24);
  let fields = null; try { fields = JSON.parse(t24.assistant); } catch { /* Strict: no extraction in grading. */ }
  const compact = text => String(text).normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  const query = t23.actual_tools.find(t => t.name === 'kg_search')?.args.query || '';
  const q = compact(query);
  const original = turns.find(t => t.turn === 2).user;
  const checks = {
    completed_all_turns_without_errors: r.summary.completed_turns === 24 && r.summary.infrastructure_errors === 0,
    code_matches_tested_versions: Object.entries(r.code_sha256).every(([file, hash]) =>
      crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '..', file))).digest('hex') === hash),
    dataset_unchanged: r.dataset_sha256 === crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '../test/datasets/asc-multiturn-v2.json'))).digest('hex'),
    cross_window_precondition: t22.window_precondition?.passed === true,
    original_history_retrieved: t22.tool_results.some(t => t.name === 'search_history' && t.ok
      && t.data?.usableAsEvidence === false && t.data.results.some(x => x.role === 'user' && x.content === original)),
    recovered_three_fields: /LONG-X73/.test(t22.assistant) && /13\s*wt\s*%/i.test(t22.assistant) && /2\s*(?:小时|h)/.test(t22.assistant),
    followup_query_correct: /sic/.test(q) && /13wt%/.test(q) && /1500/.test(q) && /空气/.test(q)
      && /(?:保温)?2(?:小时|h)/.test(q) && !/1450|氮气|1200|氩气/.test(q),
    tool_policy_all_rounds: turns.every(t => t.tool_policy_pass === true),
    final_no_tools: t24.actual_tools.length === 0,
    strict_final_json: fields !== null && typeof fields === 'object' && !Array.isArray(fields),
    final_values_correct: fields?.['代号'] === 'LONG-X73' && compact(fields?.['SiC含量']) === '13wt%'
      && compact(fields?.['温度']) === '1500°c' && fields?.['气氛'] === '空气'
      && /^(?:2小时|2h)$/.test(compact(fields?.['保温时间'])),
    original_service_answer_preserved: t23.passthrough_pass === true,
  };
  const raw = t24.model_responses.at(-1)?.content;
  let rawStrict = false; try { JSON.parse(raw); rawStrict = true; } catch { /* Report model separately. */ }
  const result = { schema: 'asc.mt18.json_recheck.v1', date: '2026-10-15', actual_model: r.actual_model,
    status: Object.values(checks).every(Boolean) ? 'passed' : 'failed', checks, fields, query,
    attempted_turns: 24, setup_turns: 21, evaluation_turns: 3, regression_tests: { passed: 87, failed: 0 },
    required_tools: { passed: turns.filter(t => t.expected.tools.policy === 'required' && t.tool_policy_pass).length,
      total: turns.filter(t => t.expected.tools.policy === 'required').length },
    raw_model_json_parseable: rawStrict, publication_changed_by_format_guard: raw !== t24.assistant,
    run_dir: selected, other_attempts: other.map(dir => {
      const a = read(dir); let json = false;
      try { JSON.parse(a.turns.find(t => t.turn === 24).assistant); json = true; } catch { /* Actual answer only. */ }
      return { dir, turns: a.turns.length, window_precondition: a.turns.find(t => t.turn === 22)?.window_precondition,
        strict_final_json: json, selected: false };
    }),
    boundary: '真实deepseek-flash + 固定知识工具夹具，生产prepareConversation/runAgent；非真实知识服务验收，非模型单独裸测，未重跑其他17组。' };
  fs.writeFileSync(path.join(selected, 'json-recheck-results.json'), JSON.stringify(result, null, 2) + '\n');
  const lines = ['MT18 历史检索与严格JSON格式修复复测', '日期：2026-10-15',
    `结论：${result.status === 'passed' ? '本次MT18完整链路通过' : '仍有未通过检查'}。`,
    `真实模型：${r.actual_model}；知识工具为固定夹具。完整24轮（21轮准备、3轮评测）。`,
    '修复：识别本轮“只输出JSON”和“用JSON列出”；添加格式提示并在最终发布前严格解析。',
    '仅一个合法JSON代码块时可移除代码围栏及外部说明，不修改内部字段或数值；无法解析则明确报错，不编造JSON。',
    '历史/工具数据不能开启格式模式；普通回答、引用检查及知识服务原答案发布保持原逻辑。',
    '', ...Object.entries(checks).map(([key, value]) => `${key}: ${value ? 'pass' : 'fail'}`),
    '', `必须工具调用规则：${result.required_tools.passed}/${result.required_tools.total}；相关自动化回归87项通过。`,
    `最终原始模型输出可直接解析：${rawStrict}；发布格式守卫是否实际改写本轮文本：${result.publication_changed_by_format_guard}。`,
    '最终JSON：', t24.assistant, '', '其他尝试（完整保留，不隐去失败或前置条件不成立的记录）：',
    ...result.other_attempts.map(a => `${a.dir}: ${a.turns}轮；窗口前置条件=${a.window_precondition?.passed}；严格JSON=${a.strict_final_json}`),
    '', result.boundary,
    '不能将此前27/28与本次2/2拼成新的全量28/28。报告仅反映本组本次运行，不保证所有随机重复均通过。',
    '尚未重启运行中的Node后端，未更新PPT或推送Git。无自动重载时需重启Node后端加载新逻辑。',
    '原始输入、模型原始回复、最终发布回复、工具参数与代码指纹见同目录raw-results.json。'];
  fs.writeFileSync(path.join(selected, 'JSON格式修复复测结果.txt'), lines.join('\n') + '\n');
  console.log(JSON.stringify({ status: result.status, checks, report: path.join(selected, 'JSON格式修复复测结果.txt') }));
  if (result.status !== 'passed') process.exitCode = 1;
}
main();
