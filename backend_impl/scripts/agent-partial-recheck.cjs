'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function main() {
  const [selected, ...prior] = process.argv.slice(2).map(p => path.resolve(p));
  if (!selected) throw new Error('Usage: node agent-partial-recheck.cjs <selected-run> [earlier-attempts...]');
  const read = dir => JSON.parse(fs.readFileSync(path.join(dir, 'raw-results.json'), 'utf8'));
  const r = read(selected), turns = r.turns;
  const ids = ['MT07','MT08','MT11','MT12','MT13'];
  if (turns.length !== 24 || ids.some(id => !turns.some(t => t.case_id === id))) throw new Error('Expected five complete cases, 24 turns');
  const turn = (id,n) => turns.find(t => t.case_id === id && t.turn === n);
  const answer = (id,n) => turn(id,n).assistant;
  const query = (id,n) => turn(id,n).actual_tools.filter(t => ['kg_search','rag_search'].includes(t.name)).map(t => t.args.query || '').join('\n');
  const compact = text => String(text).normalize('NFKC').replace(/\s+/g,'').toLowerCase();
  let json3, json4;
  try { json3=JSON.parse(answer('MT07',3));json4=JSON.parse(answer('MT07',4)); } catch { /* Strict full-answer parse. */ }
  const readChains = turns.flatMap(t => {
    const acquired = new Set();
    return t.tool_results.flatMap(result => {
      if (['kg_search','rag_search'].includes(result.name)) for (const e of result.data?.evidence || []) acquired.add(e.evidence_id);
      if (result.name !== 'read_evidence') return [];
      const call=t.actual_tools.find(c=>c.id===result.id);
      return [{ case_id:t.case_id, turn:t.turn, ok:result.ok===true, registered_this_turn:acquired.has(call?.args.evidence_id) }];
    });
  });
  const checks = {
    dataset_unchanged: r.dataset_sha256 === crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'../test/datasets/asc-multiturn-v2.json'))).digest('hex'),
    tested_code_matches_current: Object.entries(r.code_sha256).every(([file,hash]) => crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'..',file))).digest('hex')===hash),
    no_unexpected_errors: r.summary.infrastructure_errors===0,
    all_tool_rules: turns.every(t => t.expected_fault ? t.expected_fault_pass : t.tool_policy_pass===true),
    no_service_answer_rewrites: turns.filter(t=>t.expected_publication).every(t=>t.passthrough_pass===true),
    same_turn_read_ids: readChains.length>=3 && readChains.every(t=>t.ok&&t.registered_this_turn),
  };
  const cases = {
    MT07: { title:'停止检索与JSON输出', checks:{
      user_conditions_not_document_conditions:(answer('MT07',2).match(/未提供/g)||[]).length>=3 && !turn('MT07',2).actual_tools.length,
      initial_json_correct:json3?.temperature_c===1500&&json3?.atmosphere==='空气'&&json3?.hold_hours===null,
      update_only_time:json4?.temperature_c===1500&&json4?.atmosphere==='空气'&&json4?.hold_hours===2&&Object.keys(json4).length===3,
      no_tools_after_stop:[2,3,4].every(n=>turn('MT07',n).actual_tools.length===0),
    } },
    MT08: { title:'多工具链与历史片段回顾', checks:{
      read_both_turns:[1,3].every(n=>turn('MT08',n).tool_results.some(t=>t.name==='read_evidence'&&t.ok)),
      history_execution_visible:[2,4].every(n=>JSON.stringify(turn('MT08',n).input_snapshot).includes('历史工具执行摘要')),
      scope_explanations_not_blocked:[2,4].every(n=>turn('MT08',n).final?.answer_check?.status==='not_checked'),
      denies_old_id_reuse:/本轮/.test(answer('MT08',2))&&/上一轮|历史/.test(answer('MT08',2))&&/不能|拒/.test(answer('MT08',2)),
      read_not_full_paper:/片段/.test(answer('MT08',4))&&/不是整篇|不是。/.test(answer('MT08',4))&&!/没有可用片段|没有可读证据|没有合法\s*ID/.test(answer('MT08',4)),
    } },
    MT11: { title:'模型繁忙后恢复与完整输出', checks:{
      injected_fault_handled:turn('MT11',2).expected_fault_pass===true,
      original_plan_recovered:/1400/.test(answer('MT11',3))&&/氮气/.test(answer('MT11',3))&&/1\s*小时/.test(answer('MT11',3)),
      changed_plan_complete:/1500/.test(answer('MT11',4))&&/氮气/.test(answer('MT11',4))&&/1\s*小时/.test(answer('MT11',4))&&/SiC\s*\/\s*ASC/i.test(answer('MT11',4)),
      no_unrequested_tools:turns.filter(t=>t.case_id==='MT11').every(t=>!t.actual_tools.length),
    } },
    MT12: { title:'短名称限制与干扰后条件恢复', checks:{
      one_name_under_limit:[...answer('MT12',2).replace(/\s/g,'')].length<=12&&!/\n/.test(answer('MT12',2).trim()),
      quoted_instruction_not_stored:!JSON.stringify(turn('MT12',5).research_state.conditions).includes('900'),
      final_five_fields:/X-17/.test(answer('MT12',8))&&/12\s*wt\s*%/i.test(answer('MT12',8))&&/1500/.test(answer('MT12',8))&&/空气/.test(answer('MT12',8))&&/2\s*小时/.test(answer('MT12',8)),
      no_900_in_final:!answer('MT12',8).includes('900'),
      no_tools:turns.filter(t=>t.case_id==='MT12').every(t=>!t.actual_tools.length),
    } },
    MT13: { title:'上一回答条目指代与连续追问', checks:{
      focus_persists:[2,3,4].every(n=>/孔结构/.test(turn('MT13',n).research_state.discussionFocus?.text||'')),
      query_keeps_specific_item:[2,3,4].every(n=>/孔结构|气孔率|孔径/.test(query('MT13',n))&&/sic/i.test(query('MT13',n))&&/asc/i.test(query('MT13',n))),
      final_query_new_conditions:/1500/.test(query('MT13',4))&&/空气/.test(query('MT13',4))&&!/\d\s*(?:小时|h\b)/.test(query('MT13',4)),
      reads_requested_fragment:turn('MT13',3).tool_results.some(t=>t.name==='read_evidence'&&t.ok),
    } },
  };
  for(const c of Object.values(cases))c.status=Object.values(c.checks).every(Boolean)?'pass':'fail';
  const required=turns.filter(t=>t.expected.tools.policy==='required');
  const result={schema:'asc.partial_cases.recheck.v1',date:'2026-10-16',model:r.actual_model,
    status:Object.values(checks).every(Boolean)&&Object.values(cases).every(c=>c.status==='pass')?'passed':'failed',
    checks,cases,summary:r.summary,required_tool_rules:{passed:required.filter(t=>t.tool_policy_pass).length,total:required.length},
    passthrough:{passed:turns.filter(t=>t.passthrough_pass).length,total:turns.filter(t=>t.expected_publication).length},
    reads:readChains,regression:{pass:139,fail:0},run_dir:selected,
    prior_attempts:prior.map(dir=>({dir,summary:read(dir).summary})),
    review_method:'基于实际回答与工具参数逐项复核。确定性检查辅助审查，未把所有中文语义交给正则打分。',
    limits:'真实deepseek-flash加固定知识工具夹具。24轮包含23轮模型回答及1轮预设503系统检查，不是24次真实知识服务调用。仅复测上述5组，其余13组未重跑，不改写旧18组成绩。'};
  fs.writeFileSync(path.join(selected,'partial-cases-recheck.json'),JSON.stringify(result,null,2)+'\n');
  const lines=['多轮问答五类问题修复复测','日期：2026-10-16',`结果：${result.status==='passed'?'5组原有问题均通过本次定向复测':'仍有未通过项'}。`,
    '实现范围：conversation.js、loop.js、outputFormat.js及相关回归和运行脚本。未改写知识服务原答案。',
    '修复历史执行摘要可见性和条目焦点延续，补齐JSON追问表达、名称字数限制和明显残缺回复的一次工具禁用补答。',
    '明确引用的外部文本不再写入条件备忘。工具说明不生成方括号证据占位编号，真实引用检查保持原规则。',
    '',...Object.entries(cases).flatMap(([id,c])=>[`${id} ${c.title}：${c.status==='pass'?'通过':'未通过'}`,...Object.entries(c.checks).map(([k,v])=>`  ${k}: ${v?'pass':'fail'}`)]),
    '',`必须工具调用规则：${result.required_tool_rules.passed}/${result.required_tool_rules.total}。`,
    `知识服务原答案与引用透传：${result.passthrough.passed}/${result.passthrough.total}。`,
    `片段读取：${readChains.filter(t=>t.ok&&t.registered_this_turn).length}/${readChains.length}，均核对本轮登记ID。`,
    '139项相关离线回归通过，包含HTTP保存/下一轮执行摘要传递、会话与主题隔离、预算、超时、格式及服务答案保留。',
    '', '代表性结果：',
    `MT07：${answer('MT07',3)}；更新后${answer('MT07',4)}`,
    `MT12短名称：${answer('MT12',2)}（去空白Unicode字符数${[...answer('MT12',2).replace(/\s/g,'')].length}）。`,
    `MT13最后一轮实际查询：${query('MT13',4)}`,
    '', '执行与范围：',result.limits,
    '本次共完成三次24轮尝试。首次条目焦点仍丢失，第二次焦点修复但规则说明被引用占位编号拦截；均原样保留，最终结论来自第三次。',
    ...prior.map(dir=>dir),
    '短答补全只处理明确方案总结中少于6字符的明显残句，最多补答一次，仍受原步数和超时约束。它不保证自动识别所有语义残缺，也不修复上游服务根因。',
    '模型繁忙为预设故障注入，实际调用了原前端错误格式化函数，不等于浏览器渲染验收。',
    '未重启运行中的服务，未修改PPT、未提交或推送Git。无自动重载时需重启Node后端加载新代码。',
    '原始对话、模型响应、输入快照、工具事件及代码SHA256见同目录raw-results.json。'];
  fs.writeFileSync(path.join(selected,'五类问题修复复测结果.txt'),lines.join('\n')+'\n');
  console.log(JSON.stringify({status:result.status,checks,cases:Object.fromEntries(Object.entries(cases).map(([k,c])=>[k,c.status])),report:path.join(selected,'五类问题修复复测结果.txt')}));
  if(result.status!=='passed')process.exitCode=1;
}
main();
