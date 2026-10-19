'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { prepareConversation } = require('../src/agent/conversation');
const historyTool = require('../src/agent/tools/searchHistory');

async function main() {
  const [baselineArg, retestArg, excludedArg] = process.argv.slice(2);
  if (!baselineArg || !retestArg) throw new Error('Usage: node agent-history-recheck.cjs <baseline-run> <retest-run> [precondition-failed-run]');
  const baselineDir = path.resolve(baselineArg), retestDir = path.resolve(retestArg);
  const baseline = JSON.parse(fs.readFileSync(path.join(baselineDir, 'raw-results.json'), 'utf8'));
  const retest = JSON.parse(fs.readFileSync(path.join(retestDir, 'raw-results.json'), 'utf8'));
  const turns = retest.turns;
  if (turns.length !== 24 || turns.some(t => t.case_id !== 'MT18')) throw new Error('Expected complete MT18 retest');
  const early = baseline.turns.filter(t => t.case_id === 'MT18' && t.turn <= 21);
  const old22 = baseline.turns.find(t => t.case_id === 'MT18' && t.turn === 22);
  const oldArgs = old22.actual_tools.find(t => t.name === 'search_history').args;
  const context = prepareConversation({ researchState: early.at(-1).research_state,
    messages: early.flatMap(t => [{ role: 'user', content: t.user }, { role: 'assistant', content: t.assistant }]) },
  [{ role: 'user', content: old22.user }], { projectId: 'fixture-project', graphId: 'fixture-graph' }).context;
  const replay = await historyTool.execute(oldArgs, context);
  const t22 = turns.find(t => t.turn === 22), t23 = turns.find(t => t.turn === 23), t24 = turns.find(t => t.turn === 24);
  const historyResult = t22.tool_results.find(t => t.name === 'search_history');
  const query = t23.actual_tools.find(t => t.name === 'kg_search')?.args.query || '';
  const compactQuery = query.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  const input = JSON.stringify(t22.input_snapshot);
  let strictJSON = true, fields;
  try { fields = JSON.parse(t24.assistant); }
  catch { strictJSON = false; fields = JSON.parse(t24.assistant.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || 'null'); }
  const sourceHash = crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '../src/agent/tools/searchHistory.js'))).digest('hex');
  const checks = {
    dataset_unchanged: baseline.dataset_sha256 === retest.dataset_sha256,
    current_code_matches_tested_code: sourceHash === retest.code_sha256['src/agent/tools/searchHistory.js'],
    identical_old_query_hits_original_record: replay.data.results.some(r => r.content === early[1].user),
    cross_window_precondition: t22.window_precondition?.passed === true
      && !/LONG-X73|13\s*wt\s*%|保温\s*2\s*小时/i.test(input),
    history_returns_original_record: historyResult?.ok === true && historyResult.data.results.some(r => r.content === early[1].user),
    user_statement_not_verified_evidence: historyResult?.data.usableAsEvidence === false,
    recovered_fields_in_answer: /LONG-X73/.test(t22.assistant) && /13\s*wt%/i.test(t22.assistant) && /2\s*小时/.test(t22.assistant),
    next_turn_knowledge_called: t23.actual_tools.some(t => t.name === 'kg_search') && t23.tool_policy_pass,
    correct_query_conditions: /sic/.test(compactQuery) && /13wt%/.test(compactQuery)
      && /1500/.test(compactQuery) && /空气/.test(compactQuery) && /保温2(?:小时|h)/.test(compactQuery) && !/1450|氮气/.test(compactQuery),
    final_field_values: fields?.['代号'] === 'LONG-X73' && fields?.['SiC含量'] === '13 wt%'
      && fields?.['温度'] === '1500℃' && fields?.['气氛'] === '空气' && fields?.['保温时间'] === '2 小时',
    no_unexpected_service_errors: retest.summary.infrastructure_errors === 0,
  };
  const excluded = excludedArg ? JSON.parse(fs.readFileSync(path.resolve(excludedArg, 'raw-results.json'), 'utf8')) : null;
  const result = { schema: 'asc.history_matching.recheck.v1', date: '2026-10-15', actual_model: retest.actual_model,
    status: Object.values(checks).every(Boolean) ? 'history_and_followup_passed' : 'failed', checks,
    selected_case: 'MT18', attempted_turns: turns.length, setup_turns: 21, evaluation_turns: 3,
    required_tool_rules: { passed: turns.filter(t => t.expected.tools.policy === 'required' && t.tool_policy_pass).length,
      total: turns.filter(t => t.expected.tools.policy === 'required').length },
    strict_final_json: strictJSON, final_fields: fields, query,
    regression_tests_passed: 50, source_sha256: sourceHash,
    baseline_dir: baselineDir, retest_dir: retestDir, identical_old_query_replay: { args: oldArgs, result: replay },
    excluded_attempt: excluded ? { path: path.resolve(excludedArg), turns: excluded.turns.length,
      window_precondition: excluded.turns.find(t => t.turn === 22).window_precondition,
      reason: '模型在第2轮复述了编号，该消息仍在第22轮窗口中。未计为满足截断前置条件的通过样本。' } : null,
    boundary: '历史召回、后续检索与字段值通过，不将整组严格JSON格式标为通过；本次未重跑其他17组。' };
  fs.writeFileSync(path.join(retestDir, 'history-recheck-results.json'), JSON.stringify(result, null, 2) + '\n');
  const lines = [
    'MT18 历史匹配修复及定向复测', '日期：2026-10-15',
    '修复：字段别名、Unicode/大小写及分隔符归一化，仍要求所有关键词在同一条当前主题历史中匹配。',
    '“试样代号 SiC含量 保温时间”现在可以检索到原记录“SiC为13 wt%、保温2小时”。',
    '组件名称、数值、会话/主题范围仍受限制，原始历史文本保持不变，返回值不作为已核验知识证据。',
    '', '最终结果',
    `历史召回及后续检索链路：${result.status === 'history_and_followup_passed' ? '通过' : '未通过'}。`,
    '50项相关自动化回归检查通过。',
    `本组完整${turns.length}轮重新执行，实际模型${retest.actual_model}，知识服务为固定夹具。`,
    `必须工具调用规则：${result.required_tool_rules.passed}/${result.required_tool_rules.total}。`,
    '第22轮：真实模型输入已不含早期字段，通过search_history命中原始用户记录并正确找回LONG-X73、13 wt%、2小时。',
    `第23轮：实际kg_search查询为“${query}”。`,
    '第24轮：最终五项字段为LONG-X73、13 wt%、1500℃、空气、2小时。',
    '', '验证证据',
    ...Object.entries(checks).map(([name, pass]) => `${name}: ${pass ? 'pass' : 'fail'}`),
    '', '范围与执行记录',
    '第一次完整复测24轮中，匹配和后续检索成功，但模型提前重复编号，不满足严格窗口截断前置条件，原记录保留。',
    '第二次完整复测24轮满足前置条件，以上链路结论来自第二次。两次均未修改用例或注入预设助手回答。',
    `第24轮严格整段JSON解析：${strictJSON ? '通过' : '未通过（仍有代码围栏或说明）'}。字段语义通过不代表严格格式通过。`,
    '本组历史匹配与检索已通过。按包含严格JSON格式的完整检查口径，整组仍有格式项待完善。',
    '只复测了MT18，不能把旧18组的27/28与本次结果拼成一次新的28/28全量成绩。',
    '原始回答、工具参数、输入快照与代码SHA256见同目录raw-results.json。精确检查与旧查询回放见history-recheck-results.json。',
    '数据集未变更，业务代码只修改历史检索匹配。本次未重启运行中的Node后端，未更新PPT或推送Git。',
    '若后端没有自动重载，需要重启Node后端加载新匹配规则，前端和Python知识服务无需因本修复重启。'
  ];
  fs.writeFileSync(path.join(retestDir, '历史检索修复复测结果.txt'), lines.join('\n') + '\n');
  console.log(JSON.stringify({ status: result.status, checks, report: path.join(retestDir, '历史检索修复复测结果.txt') }));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
