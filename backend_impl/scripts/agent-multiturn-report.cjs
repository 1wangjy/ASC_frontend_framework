'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function buildReport(dir) {
  const rawPath = path.join(dir, 'raw-results.json');
  const rawBytes = fs.readFileSync(rawPath);
  const raw = JSON.parse(rawBytes);
  const review = JSON.parse(fs.readFileSync(path.join(dir, 'review-cases.json'), 'utf8'));
  if (raw.status !== 'completed_pending_semantic_review') throw new Error('Run is not complete');
  const ids = [...new Set(raw.turns.map(t => t.case_id))];
  if (ids.length !== 18 || raw.turns.length !== 96 || review.cases.length !== 18
    || new Set(review.cases.map(c => c.id)).size !== 18
    || review.cases.some(c => !ids.includes(c.id))) throw new Error('Coverage does not match full dataset');
  const evaluations = raw.turns.filter(t => t.score_role === 'evaluation');
  const required = evaluations.filter(t => t.expected.tools.policy === 'required');
  const published = raw.turns.filter(t => t.passthrough_pass !== undefined);
  const reads = raw.turns.flatMap(t => t.tool_results.filter(r => r.name === 'read_evidence'));
  const toolCounts = raw.turns.flatMap(t => t.actual_tools).reduce((counts, t) => {
    counts[t.name] = (counts[t.name] || 0) + 1; return counts;
  }, {});
  const quantile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
  const fixtureUnsupported = raw.turns.flatMap(t => t.tool_results.filter(r => r.data?.fixture_unsupported)
    .map(r => ({ case_id: t.case_id, turn: t.turn, tool: r.name })));
  const times = raw.turns.filter(t => !t.expected_fault).map(t => t.ms);
  const long = raw.turns.find(t => t.case_id === 'MT18' && t.turn === 22);
  const longInput = JSON.stringify(long.input_snapshot);
  const canary = raw.foreign_session_fixture.messages[0].content.match(/FOREIGN-B-92/)[0];
  const checks = {
    isolated_canary_in_model_input: raw.turns.filter(t => t.input_snapshot.some(m => m.content.includes(canary))).length,
    isolated_canary_in_assistant_output: raw.turns.filter(t => t.assistant.includes(canary)).length,
    long_window_precondition: long.window_precondition.passed,
    long_actual_model_input_has_early_fields: /LONG-X73|13\s*wt\s*%|保温\s*2\s*小时/i.test(longInput),
    read_ids_same_turn: raw.turns.flatMap(t => {
      const known = new Set();
      const findings = [];
      for (const event of t.events) {
        if (event.type === 'tool_result' && ['kg_search', 'rag_search'].includes(event.name)) {
          for (const item of event.data?.evidence || []) known.add(item.evidence_id);
        }
        if (event.type === 'tool_call' && event.name === 'read_evidence') findings.push({
          case_id: t.case_id, turn: t.turn, evidence_id: event.args.evidence_id, registered_before_call: known.has(event.args.evidence_id) });
      }
      return findings;
    })
  };
  const strictJson = raw.turns.filter(t => ['MT07.3', 'MT07.4', 'MT18.24'].includes(`${t.case_id}.${t.turn}`))
    .map(t => { let parsed = true; try { JSON.parse(t.assistant); } catch { parsed = false; }
      return { case_id: t.case_id, turn: t.turn, strict_json_parse: parsed }; });
  const summary = { schema: 'asc.multiturn.full_results.v1', reviewed_at: new Date().toISOString(),
    raw_sha256: crypto.createHash('sha256').update(rawBytes).digest('hex'),
    model: raw.actual_model, mode: raw.mode, cases_executed: ids.length, turns_executed: raw.turns.length,
    model_response_turns: raw.summary.completed_turns, expected_fault_turns: raw.summary.expected_fault_turns,
    expected_fault_passes: raw.summary.expected_fault_passes, unexpected_infrastructure_errors: raw.summary.infrastructure_errors,
    evaluation_turns: evaluations.length, setup_turns: raw.turns.filter(t => t.score_role === 'setup').length,
    core_case_passes: review.cases.filter(c => c.status === 'pass').length,
    core_case_partial: review.cases.filter(c => c.status === 'partial').length,
    tool_policy_evaluation: { passed: evaluations.filter(t => t.tool_policy_pass).length, checked: evaluations.length },
    required_tool_policy: { passed: required.filter(t => t.tool_policy_pass).length, checked: required.length },
    service_passthrough: { passed: published.filter(t => t.passthrough_pass).length, checked: published.length },
    evidence_reads: { passed: reads.filter(r => r.ok).length, checked: reads.length },
    elapsed_seconds: (Date.parse(raw.ended_at) - Date.parse(raw.started_at)) / 1000,
    median_turn_ms: quantile(times, .5), p95_turn_ms: quantile(times, .95),
    provider_method_calls: raw.summary.live_model_requests,
    provider_reported_tokens: raw.turns.reduce((n, t) => n + (t.usage?.total || 0), 0),
    tool_counts: toolCounts, fixture_unsupported_calls: fixtureUnsupported,
    deterministic_checks: checks, strict_json_observations: strictJson,
    review_method: review.review_method, case_results: review.cases,
    limits: ['单模型、每组1次，固定知识返回，非真实知识API或科学结论正确率验收。',
      '21轮setup不计模型语义成绩，1轮预设503只计系统，实际模型回答轮次95。',
      '通过/部分通过为人工核心场景复核，不是模型精确率或四项任务全部验收。',
      'UI错误文案调用真实格式化函数，未操作浏览器界面或HTTP鉴权。',
      '工具名称符合规则不代表查询语义正确；长会话连续失败按一条召回失败链解释。',
      '未覆盖的kg_list请求由夹具明确拒绝，不能当成实际服务故障。'] };
  if (summary.core_case_passes + summary.core_case_partial !== 18) throw new Error('Unreviewed case');
  const lines = [
    'ASC 多轮问答18组完整测试结果', '测试日期：2026-10-15（北京时间）',
    `模型：${summary.model}；每组1次，真实模型与固定知识工具夹具。`,
    `全部${summary.cases_executed}组、${summary.turns_executed}轮已执行，没有跳过用例。`,
    `${summary.model_response_turns}轮取得模型最终回答，另${summary.expected_fault_turns}轮为预设故障注入，错误处理检查通过${summary.expected_fault_passes}轮。意外基础设施错误${summary.unexpected_infrastructure_errors}次。`,
    `人工核心场景复核：${summary.core_case_passes}组通过、${summary.core_case_partial}组部分通过。执行完成不等于全部通过。`,
    '', '最终结果',
    `必须工具轮名称/顺序规则：${summary.required_tool_policy.passed}/${summary.required_tool_policy.checked}。`,
    `全部74个语义评测轮的调用规则：${summary.tool_policy_evaluation.passed}/74。该数字不包含查询语义正确率。`,
    `固定服务原答案与引用透传：${summary.service_passthrough.passed}/${summary.service_passthrough.checked}。`,
    `原文片段读取：${summary.evidence_reads.passed}/${summary.evidence_reads.checked}；同轮ID登记检查见results.json。`,
    `隔离会话批次标记在模型输入中出现${checks.isolated_canary_in_model_input}次，在回答中出现${checks.isolated_canary_in_assistant_output}次。`,
    `长会话窗口前置条件：${checks.long_window_precondition && !checks.long_actual_model_input_has_early_fields ? '通过' : '未通过'}；早期字段召回结果见MT18。`,
    '', '逐组结论',
    ...review.cases.map(c => `${c.id} ${c.status === 'pass' ? '通过' : '部分通过'}：${c.result}${c.boundary ? '\n范围说明：' + c.boundary : ''}`),
    '', '统计口径',
    `共74轮模型语义评测、21轮准备/历史填充、1轮仅系统故障检查。总耗时${summary.elapsed_seconds.toFixed(3)}秒。`,
    `单轮中位数${(summary.median_turn_ms / 1000).toFixed(3)}秒、p95 ${(summary.p95_turn_ms / 1000).toFixed(3)}秒，均为固定知识返回条件下的耗时。`,
    `提供方streamChat方法调用${summary.provider_method_calls}次，上游报告总tokens为${summary.provider_reported_tokens}，未折算费用。`,
    '方法调用次数不是独立用户轮次，底层流式兼容回退可能额外发出HTTP请求。',
    `实际工具请求：${Object.entries(toolCounts).map(([n, count]) => n + ' ' + count + '次').join('，')}。`,
    '两次kg_list请求不属于本次要求的工具链，当前夹具明确返回未实现，未访问外部服务，亦未将其算作成功。',
    '', '材料与边界', ...summary.limits,
    '原始逐轮回答、事件、模型tool_calls、输入快照、用例预期和代码SHA256：raw-results.json。',
    '机器可读汇总与确定性检查：results.json。人工逐组判定：review-cases.json。',
    '本次未修改业务代码、未重启服务、未更新PPT或推送Git。'
  ];
  fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify(summary, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, '18组完整测试结果.txt'), lines.join('\n') + '\n');
  console.log(JSON.stringify({ report: path.join(dir, '18组完整测试结果.txt'), cases: ids.length,
    passes: summary.core_case_passes, partial: summary.core_case_partial, checked_ids: checks.read_ids_same_turn }));
}
if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) throw new Error('Usage: node agent-multiturn-report.cjs <completed-run-directory>');
  buildReport(path.resolve(dir));
}
module.exports = { buildReport };
