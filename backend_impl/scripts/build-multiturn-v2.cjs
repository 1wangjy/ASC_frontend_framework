'use strict';

// Reproducible dataset migration. Generates specifications and the manual guide;
// never invokes a model, knowledge service or application session.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../test/datasets');
const data = JSON.parse(fs.readFileSync(path.join(root, 'asc-multiturn-v1.json'), 'utf8'));
const forbidden = () => ({ policy: 'forbidden', names: ['*'], reason: '仅执行本轮明确的复述、确认或澄清要求' });
const required = (...names) => ({ policy: 'required', names, reason: '本轮用户明确要求的工具操作' });
const optional = (...allowed) => ({ policy: 'optional', allowed, reason: '按当前历史和返回内容选择，不因工具数量加分' });
const sequence = (...names) => ({ policy: 'required', sequence: names.map(tool => ({ tool,
  ...(tool === 'read_evidence' ? { argument_rule: 'evidence_id必须在同轮实际检索返回后登记；允许与历史ID字符串相同' } : {}) })),
  reason: '遵循用户明确指定的工具顺序' });
const turn = (user, state, checks, tools, extra = {}) => ({ user, expected: { state, checks, tools }, ...extra });
const makeCase = (id, name, dimensions, turns, extra = {}) => ({ id, name, dimensions,
  turns: turns.map((t, i) => ({ turn: i + 1, ...t })), ...extra });
const get = id => data.cases.find(c => c.id === id);

data.schema = 'asc.agent.multiturn.benchmark.v2';
data.version = '2.0';
data.supersedes = 'asc-multiturn-v1.json（设计基线，仅保留回查；后续评测使用v2）';
data.scope.include.push('自然省略追问', '回答内容指代', '歧义澄清', '空检索恢复', '历史截断后的检索回忆');
data.usage.instructions.push(
  'state只包含本轮应检查的语义字段：缺失字段不作断言；null表示该字段未指定或已取消；temperature_c用于单温度，temperatures_c用于多个温度。',
  '有序列表指代使用该次真实助手回答作为目标，不能将夹具预设答案替代实际对话历史。没有对应条目则标fixture_precondition_failed，不能猜测目标。',
  'score_role=setup轮用于形成历史，不计模型语义均分，仍记录完成情况、违规和系统异常。',
  '每个check均有owner与dimension；输出按context、tools、system三栏报告，另外列honesty，不用记忆轮次冲淡工具失败。',
  'read_evidence读取的是本轮登记记录：相同来源和内容可能产生同一个ID；成功标准不要求ID字符串跨轮变化。',
  '主Agent的实际工具请求计工具分；服务答案原文透传、引用保留及UI错误文案计系统分。'
);
data.usage.instructions[1] = '每轮等待结束并保留真实助手回答。模型直测在单轮工具循环中保留真实tool消息；跨轮按应用实际策略构造历史，不额外注入应用原本不会保存的隐藏工具消息。不可用预设答案替代实际历史。';
data.usage.recommended_modes[0].skip_cases_if_no_harness.push('MT13', 'MT14', 'MT15', 'MT17', 'MT18');
data.usage.recommended_modes[0].description = '使用实际模型与固定工具返回；执行器须维护真实助手历史并实现所需夹具';
data.usage.recommended_modes[1].requires = '需要已配置可调用的模型与知识服务。空结果、503及超时使用隔离夹具；不能把故障注入当真实上游结果。';

// Explicit first-tool choice must agree with the user's instruction.
get('MT08').turns[0].expected.tools = sequence('kg_search', 'read_evidence');
get('MT08').turns[2].expected.tools = sequence('kg_search', 'read_evidence');
get('MT08').turns[2].user = '这次限定 1500℃空气，重新用 kg_search 检索并读取本轮返回的一条原文。';
get('MT08').turns[2].expected.checks = ['先重新检索，再读取本轮登记的ID', '即使ID字符串与上一轮相同，也必须有本轮重新取得和登记记录'];
get('MT08').fixture_requirements = [
  '每轮kg_search返回服务答案、来源和至少1条可读取片段，ID由真实EvidenceStore根据夹具来源与内容生成',
  '第1、3轮至少共享一条来源、位置与文本相同的片段，以验证ID可相同但必须本轮重新登记',
  '第2轮未重新检索时不登记旧证据；额外的无效ID拒绝测试见应用验收清单APP06'
];
get('MT10').turns[0].expected.tools = required('kg_search');
get('MT10').turns[1].user = '再用 rag_search 补查同条件下的文献片段。';
get('MT12').name = '短会话干扰与不可信文本';
get('MT12').dimensions = ['短会话记忆', '引用文本隔离', '条件纠正'];
get('MT12').coverage_limit = '用户已明确标出不可信文本，仅测基础隔离；不代表真实检索内容注入防御或长上下文能力。';
for (const c of data.cases) for (const t of c.turns) {
  if (Object.hasOwn(t.expected.state, 'temperature')) {
    t.expected.state.temperature_c = t.expected.state.temperature;
    delete t.expected.state.temperature;
  }
}
get('MT02').turns[2].expected.state.temperature_c = null;
get('MT02').turns[3].expected.state.temperatures_c = [];

const fixtureBoundary = '固定工具返回只用于控制输入；模型选择与参数计模型分，服务答案透传及证据存储计系统分。';
const passthrough = '最终展示与本轮最后一个成功kg_search的服务答案对应；按serviceAnswer投影后的text、citations、service_references比较，不按页面HTML比较';

data.cases.push(
  makeCase('MT13', '自然追问与上一回答条目指代', ['自然追问', '回答指代', '服务答案保留'], [
    turn('请检索 SiC 在 ASC 耐火材料中的主要作用。', { subject: 'SiC/ASC' }, ['检索对象包含SiC与ASC'], required('kg_search')),
    turn('第二点呢？请围绕这一点继续检索。', {}, ['从上一轮实际回答解析第二点作为检索主题', '查询保留SiC与ASC，不把“第二点”原样当作唯一查询'], required('kg_search')),
    turn('给刚才这一点找一条原文，请重新检索后读取片段。', {}, ['继承上一轮实际讨论条目', '先检索后用同轮登记ID读取，不能因已有服务答案就略过明确读取要求'], sequence('kg_search', 'read_evidence')),
    turn('那在 1500℃ 空气下还适用吗？请继续检索。', { temperature_c: 1500, atmosphere: '空气' }, ['保持同一条目、SiC与ASC', '加入1500℃空气条件，不凭空指定时间'], required('kg_search'))
  ], { fixture_profile: 'ordered_service_answer', fixture_requirements: [
    '工具返回明确标记为测试夹具的两点有序服务答案；每点有可区分标题与片段来源',
    '后续查询按其指代目标返回独立服务答案和可登记片段；夹具不得强行修正模型查询',
    '如果真实回答无第二点则该指代轮标前置条件失败；无夹具的现场观察不计为本组可比得分'
  ], scoring_boundary: fixtureBoundary }),
  makeCase('MT14', '连续条件修改真正进入检索参数', ['条件更新检索', '原答案与引用保留'], [
    turn('请检索 SiC/ASC 在 1500℃空气下保温2小时的抗氧化相关资料，并返回知识服务答案。', { subject: 'SiC/ASC', temperature_c: 1500, atmosphere: '空气', hold_hours: 2 }, ['检索包含研究对象及三个条件'], required('kg_search')),
    turn('把温度降到1400℃，其他条件不变，重新检索。', { temperature_c: 1400, atmosphere: '空气', hold_hours: 2 }, ['实际查询使用1400℃，保留空气和2小时', '旧1500℃不得继续作为现行限定'], required('kg_search')),
    turn('气氛换成氮气，再查一次。', { temperature_c: 1400, atmosphere: '氮气', hold_hours: 2 }, ['查询使用1400℃氮气2小时，不沿用空气'], required('kg_search')),
    turn('时间改为30分钟，再检索，其他不变。', { temperature_c: 1400, atmosphere: '氮气', hold_hours: 0.5 }, ['查询保留1400℃氮气，时间为30分钟或0.5小时', '不把原2小时和新时间同时作为现行限定'], required('kg_search'))
  ], { fixture_profile: 'distinct_service_answers', fixture_requirements: [
    '每轮成功kg_search有不同测试标记与引用，记录模型原始query，不由夹具补齐或改写条件',
    '分别捕获工具服务答案、serviceAnswer投影、最终SSE答案和引用，以核对原答案透传'
  ], scoring_boundary: fixtureBoundary }),
  makeCase('MT15', '显式片段检索与读取链', ['rag工具链', '证据范围'], [
    turn('先用kg_search检索SiC/ASC在1500℃空气下的作用，返回服务答案。', { subject: 'SiC/ASC', temperature_c: 1500, atmosphere: '空气' }, ['使用kg_search获取服务成文答案'], required('kg_search')),
    turn('针对同一对象和条件，用rag_search补查文献片段，再用read_evidence读取其中一条。', { temperature_c: 1500, atmosphere: '空气' }, ['rag查询继承SiC/ASC与1500℃空气', 'read_evidence用本轮rag登记ID'], sequence('rag_search', 'read_evidence')),
    turn('这次只把温度改成1400℃，还是先补查片段再读取一条。', { temperature_c: 1400, atmosphere: '空气' }, ['继承上一轮的补查读取任务', 'rag查询更新温度且不丢失空气和对象'], sequence('rag_search', 'read_evidence')),
    turn('刚才拿到的是片段还是全文？只说明范围，不调用工具。', { read_scope: 'API完整片段' }, ['说明读取片段而非论文全文', '不声称rag返回了知识服务成文答案'], forbidden())
  ], { fixture_profile: 'rag_evidence_catalog', fixture_requirements: [
    'kg_search返回成文答案；rag_search仅返回片段与来源，使用同一EvidenceStore登记',
    'rag-only轮单独评工具调用与范围，当前knowledge_service模式无本轮成文答案时可显示缺少成文答案，不能要求模型额外生成材料结论'
  ], scoring_boundary: fixtureBoundary }),
  makeCase('MT16', '歧义先澄清再按对象检索', ['歧义澄清', '多对象绑定'], [
    turn('设两组：A为ASC，1500℃空气；B为Al₂O₃–C，1300℃氮气。先记住，不调用工具。', { A: { material: 'ASC', temperature_c: 1500, atmosphere: '空气' }, B: { material: 'Al₂O₃–C', temperature_c: 1300, atmosphere: '氮气' } }, ['分别绑定A与B条件'], forbidden()),
    turn('把它改成1400℃。先确认我说的是哪一组，不调用工具。', {}, ['询问A还是B', '澄清前不宣称已修改任一组'], forbidden()),
    turn('我指B，其他不变。请按B现在的条件检索相关资料。', { B: { material: 'Al₂O₃–C', temperature_c: 1400, atmosphere: '氮气' } }, ['查询是B的Al₂O₃–C、1400℃、氮气', '不能混入A的SiC/ASC空气条件'], required('kg_search')),
    turn('A保持原样，也按它的条件检索一次。', { A: { material: 'ASC', temperature_c: 1500, atmosphere: '空气' } }, ['查询恢复A的ASC、1500℃、空气', '不把B的1400℃氮气带入A'], required('kg_search'))
  ]),
  makeCase('MT17', '空检索后的范围调整与恢复', ['空结果', '条件放宽', '异常后追问'], [
    turn('检索SiC/ASC在1500℃空气、保温2小时的相关文献。', { subject: 'SiC/ASC', temperature_c: 1500, atmosphere: '空气', hold_hours: 2 }, ['首次检索条件完整', '返回无结果时不声称取得服务答案或原文'], required('kg_search')),
    turn('那先取消保温时间限制，其他条件保留，再检索。', { temperature_c: 1500, atmosphere: '空气', hold_hours: null }, ['查询不再用2小时作为限定', '保留对象、1500℃与空气'], required('kg_search')),
    turn('这次有片段了，重新按相同条件检索并读取一条原文。', { temperature_c: 1500, atmosphere: '空气', hold_hours: null }, ['先重新检索登记证据再读取', '空结果不能永久阻断后续轮次'], sequence('kg_search', 'read_evidence')),
    turn('总结现在的检索条件，别把检索结果中的时间当成我的设定。不调用工具。', { temperature_c: 1500, atmosphere: '空气', hold_hours: null }, ['保温时间仍不限定', '区分用户条件与资料中的试验条件'], forbidden())
  ], { fixture_profile: 'empty_then_recover', fixture_requirements: [
    '第1轮所有检索均返回协议合法的空结果：无成文答案、无片段；它不是超时或503；模型可在预算内合理改写查询，但不能取得夹具未提供的证据',
    '第2、3轮恢复，返回片段中刻意出现“保温4小时”，仅为测试数据；不得污染用户已取消的时间条件',
    '记录原始工具响应及最终状态，系统不得给空结果添加成功取得证据的标记'
  ], scoring_boundary: fixtureBoundary })
);

const longTurns = [
  turn('我们讨论SiC材料测试计划，后面补充虚构试样数据。先只确认收到，不调用工具。', {}, ['按要求只确认收到'], forbidden(), { score_role: 'setup' }),
  turn('补充虚构历史记录：试样代号 LONG-X73，SiC为13 wt%，1450℃氮气，保温2小时。只确认收到，不复述数据，不调用工具。',
    { sample: 'LONG-X73', sic_wt: 13, temperature_c: 1450, atmosphere: '氮气', hold_hours: 2 }, ['按要求只确认收到'], forbidden(), { score_role: 'setup' })
];
for (let i = 3; i <= 21; i++) longTurns.push(turn(
  `历史填充轮${i}：本条仅为接收确认，请只回答“收到”，不复述任何试样或条件，不调用工具。`, {},
  ['仅确认收到，保留真实助手消息用于形成历史'], forbidden(), { score_role: 'setup' }));
longTurns.push(
  turn('请用search_history查找本会话最早记录的试样代号、SiC含量和保温时间。', { sample: 'LONG-X73', sic_wt: 13, hold_hours: 2 },
    ['调用search_history检索早期试样记录', '从实际历史结果正确取回代号、13 wt%与2小时'], required('search_history')),
  turn('按刚才找回的方案，只将温度改为1500℃、气氛改为空气，请检索。', { sample: 'LONG-X73', sic_wt: 13, temperature_c: 1500, atmosphere: '空气', hold_hours: 2 },
    ['检索对象含SiC/ASC相关材料描述、13 wt%与1500℃空气2小时；试样代号可省略', '使用找回的时间和含量，不沿用旧1450℃氮气'], required('kg_search')),
  turn('用JSON列出代号、SiC含量、温度、气氛和保温时间，不调用工具。', { sample: 'LONG-X73', sic_wt: 13, temperature_c: 1500, atmosphere: '空气', hold_hours: 2 },
    ['JSON可解析且五项与最终状态一致', '不把历史记录当作已发表文献'], forbidden())
);
// The material was not specified as ASC; do not demand that the model invent it.
longTurns[22].expected.checks[0] = '查询保留SiC材料描述、13 wt%与1500℃空气2小时；试样代号可省略，不擅自补ASC体系';
data.cases.push(makeCase('MT18', '跨历史窗口后的检索回忆', ['窗口截断', '历史工具', '恢复后条件更新'], longTurns, {
  fixture_profile: 'history_window_39', fixture_requirements: [
    '固定应用当前策略：prepareConversation传最近39条活动历史消息，另有researchState温度/气氛原话及首轮topicRequest；故首轮仅建主题，第二轮才录入待回忆数据',
    '逐轮发送并保留真实助手回答，不注入预设助手回复；模型直测也必须模拟该窗口和历史工具，不能给全量历史',
    '第22轮请求前检查实际模型输入：LONG-X73、13 wt%和保温2小时的早期记录已不在最近消息或其他提示中，但仍在当前主题历史存储',
    '若助手在填充轮重述导致早期字段留在窗口，标precondition_failed，不宣称完成截断回忆；记录实际传入消息数与token数',
    '这是应用消息窗口边界测试，不代表模型最大token上下文压力测试'
  ], scoring_boundary: '第1至21轮为setup；第22至24轮计模型分。窗口构造、存储可检索性及输入检查计系统分。'
}));

// Explicit owner/dimension mapping for legacy human-readable checks.
// S=state, I=instruction, T=tools, H=honesty; Y=system behavior.
const maps = {
  MT01: ['TS', 'TS', 'SS', 'SS'], MT02: ['I', 'SS', 'SH', 'SS'],
  MT03: ['S', 'S', 'SS', 'SS'], MT04: ['H', 'SS', 'II', 'SSH'],
  MT05: ['S', 'SS', 'HH', 'SH'], MT06: ['S', 'SS', 'S', 'TT'],
  MT07: ['T', 'SH', 'IS', 'IS'], MT08: ['TT', 'HH', 'TT', 'HH'],
  MT09: ['S', 'TH', 'HH', 'SH'], MT10: ['Y', 'TH', 'SS', 'TY'],
  MT11: ['S', 'YYY', 'SS', 'SS'], MT12: ['S', 'IS', 'S', 'IS', 'SH', 'SS', 'S', 'SSH'],
  MT13: ['T', 'TT', 'TT', 'TT'], MT14: ['T', 'TT', 'T', 'TT'],
  MT15: ['T', 'TT', 'TT', 'HH'], MT16: ['S', 'IS', 'TT', 'TT'],
  MT17: ['TH', 'TT', 'TY', 'SH']
};
const dimension = { S: 'state_and_reference', I: 'instruction_following', T: 'tool_selection_and_args', H: 'honest_failure_and_scope', Y: 'system_behavior' };
for (const c of data.cases) for (const t of c.turns) {
  const letters = c.id === 'MT18' ? (t.turn <= 21 ? 'I' : t.turn === 22 ? 'TS' : t.turn === 23 ? 'TT' : 'IH') : maps[c.id][t.turn - 1];
  if (letters.length !== t.expected.checks.length) throw new Error(`check mapping mismatch ${c.id}/${t.turn}`);
  t.score_role ||= 'evaluation';
  t.expected.checks = t.expected.checks.map((text, i) => ({ id: `${c.id}.${t.turn}.c${i + 1}`, text,
    owner: letters[i] === 'Y' ? 'system' : 'model', dimension: dimension[letters[i]], evidence: letters[i] === 'T' ? '模型原始tool_calls及工具响应' : letters[i] === 'Y' ? '系统事件、工具结果或最终展示' : '实际助手回答及本轮用户历史' }));
  if (Object.keys(t.expected.state).length) t.expected.checks.push({ id: `${c.id}.${t.turn}.state`, owner: 'model', dimension: 'state_and_reference',
    text: '本轮适用输出或工具参数符合expected.state；无需额外输出内部状态或重复用户未要求的全部字段', evidence: '实际回答、工具参数与语义状态逐字段核对' });
  t.expected.checks.push({ id: `${c.id}.${t.turn}.tools`, owner: 'model', dimension: 'tool_selection_and_args', text: '符合expected.tools；optional.allowed为穷举白名单，未列出的工具均不允许', evidence: '模型请求的原始调用；被控制器拒绝的请求也记录，不因门禁拦截就算模型正确' });
  if (['MT08', 'MT13', 'MT14'].includes(c.id) && t.expected.tools.policy === 'required') {
    t.expected.checks.push({ id: `${c.id}.${t.turn}.passthrough`, owner: 'system', dimension: 'system_behavior', text: passthrough, evidence: '工具服务答案、serviceAnswer投影、最终SSE text与references' });
  }
  if (c.id === 'MT11' && t.turn === 2) {
    // A provider failure has no model output to grade, including state/tools.
    t.expected.checks = t.expected.checks.filter(check => check.owner === 'system');
    t.score_role = 'infrastructure_only';
  }
}
data.scoring = {
  primary_reports: { context: ['state_and_reference', 'instruction_following'], tools: ['tool_selection_and_args'],
    system: ['system_behavior'], honesty: ['honest_failure_and_scope'] },
  overall_score: null,
  check_result: ['pass', 'fail', 'not_applicable', 'not_run'],
  aggregation: '先按轮次适用check的通过比例算维度，再在同用例中平均，最后按用例平均。模型维度仅用evaluation轮；system使用全部非setup轮，包括infrastructure_only轮。context的两个适用维度等权，缺失维度标N/A。工具主分只对required轮聚合，另列禁止调用遵循率和optional合理性，禁止记忆轮次冲淡必须工具链的失败。system、honesty单列。',
  rules: [
    '每项check只按标明的owner与dimension计一次；state是该轮语义检查目标，不要求模型输出数据库状态字段。',
    'optional.allowed为穷举白名单；required.names表示每个名称至少出现一次，required.sequence是有序子序列；其余非必要调用仍单列，不因多调工具加分。',
    '仅在确实无适用条件时使用not_applicable，并记录理由；应执行但未完成用not_run，不能从分母删除以抬高分数。',
    '预置条件不成立用precondition_failed单独报告，不能记通过。无有效模型响应的503为infrastructure_error，不记模型语义错，计入端到端未完成。',
    'setup轮不计模型语义均分，基础设施轮只计系统；所有轮均记录完成状态、延迟及硬失败。',
    '模型选择、参数、范围表述与系统门禁分别观察；只看到系统拒绝不能证明模型主动遵守了范围。',
    '硬失败：输出隔离存储canary或虚构工具成功记录。单列责任方、原始证据及违规次数；责任未查清不得自动将系统泄漏算模型零分。',
    '检索成功是系统实际取得对应结果；模型如实解释超时可通过诚实性检查，但不能算检索成功。',
    '固定模型、提示词、工具schema、answerMode、预算、窗口策略与采样参数；每用例建议重复3次；报告每组有效样本及跳过原因。',
    '材料科学事实正确率和论文支持度不在本版评分内。'
  ]
};
delete data.report_template.metrics.model_score;
Object.assign(data.report_template.metrics, { context_score: null, tools_score: null, system_pass_rate: null, honesty_score: null, precondition_failures: 0, setup_turns: 0 });
Object.assign(data.report_template.metrics, { forbidden_tool_compliance: null, optional_tool_appropriateness: null });
delete data.report_template.per_turn_record.model_score;
data.report_template.per_turn_record.checks = [{ id: '', owner: '', dimension: '', result: 'not_run', evidence: '', reason: '' }];
Object.assign(data.report_template.settings, { answer_mode: 'knowledge_service', history_window_messages: 39, tool_schema_hash: null });
data.total_conversations = data.cases.length;
data.total_user_turns = data.cases.reduce((n, c) => n + c.turns.length, 0);
data.counts = { evaluation_turns: 0, setup_turns: 0, infrastructure_only_turns: 0, tool_policy: {} };
for (const t of data.cases.flatMap(c => c.turns)) {
  data.counts[`${t.score_role}_turns`]++;
  const p = t.expected.tools.policy;
  data.counts.tool_policy[p] = (data.counts.tool_policy[p] || 0) + 1;
}
const output = path.join(root, 'asc-multiturn-v2.json');
fs.writeFileSync(output, JSON.stringify(data, null, 2) + '\n');
const guide = [
  'ASC Agent 多轮问答测试集 v2（当前推荐版本）',
  `设计日期：2026-10-15；${data.total_conversations}组、${data.total_user_turns}个用户轮次；其中${data.counts.setup_turns}轮为历史填充/准备，1轮仅测故障系统表现。`,
  '状态：测试规格已设计，尚未执行真实模型/API评测；生成与结构校验通过不代表模型通过。',
  '', '使用方式',
  '使用asc-multiturn-v2.json；v1保留回查，旧说明中的ID跨轮变化等要求以v2为准。',
  '一组一个独立会话，按顺序发送用户问题，保留真实助手回答。不要发送expected、评分、夹具配置或其他会话canary。',
  'MT01–07、MT12、MT16可先做人工聊天观察；涉及检索仍需配置模型/服务。',
  'MT08–11、MT13–15、MT17–18需要隔离工具夹具、故障注入或模型输入检查；没有执行器不可宣称已验收。',
  '所有模型离线比较均需固定工具返回；当前文件不是评测执行器。',
  '', '本版修正',
  '1. 明确kg_search成文答案与rag_search片段的区别；显式指定工具的用例按原指令检查。',
  '2. 证据按本轮登记判断，不要求ID字符串变化；同一来源内容重新返回时ID可相同。',
  '3. 单温度用temperature_c，温度集合用temperatures_c；缺失字段不作断言，null为未指定/已取消。',
  '4. 每项check有owner、dimension、证据要求；context、tools、system单列，另外列honesty。工具主分仅聚合必须工具轮，禁止调用遵循率另外列出。',
  '5. MT12只称短会话干扰；MT18使用24轮跨最近39条历史消息窗口，前21轮不计语义均分。',
  '6. 新增MT13–18覆盖自然追问、修改后检索、rag读取链、歧义澄清、空结果恢复和窗口截断回忆。',
  '', '评分与边界', ...data.scoring.rules,
  '每条语义检查按实际回答/参数判定，保留理由与原始证据；禁止仅看关键词。',
  'UI刷新、模型切换、图谱切换、流式展示等见asc-multiturn-应用验收清单.txt，单列系统结果。',
  '', '逐轮问题（只发送用户问题；其余为评测者说明）'
];
for (const c of data.cases) {
  guide.push('', `${c.id} ${c.name}`, `覆盖：${c.dimensions.join('、')}`);
  if (c.fixture_profile || c.harness_setup) guide.push('需要隔离夹具/专门设置：参照JSON配置，不可用普通聊天冒充全部验收。');
  if (c.coverage_limit) guide.push(c.coverage_limit);
  for (const t of c.turns) {
    guide.push(`第${t.turn}轮用户问题：${t.user}`, `用途：${t.score_role}`, '核对：' + t.expected.checks.map(x => `[${x.owner}/${x.dimension}]${x.text}`).join('；'));
  }
}
fs.writeFileSync(path.join(root, 'asc-multiturn-v2-使用说明.txt'), guide.join('\n') + '\n');
console.log(JSON.stringify({ output, conversations: data.total_conversations, turns: data.total_user_turns, counts: data.counts }));
