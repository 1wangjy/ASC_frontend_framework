import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
// Use the bundled authoring runtime, without installing project dependencies.
const runtime = 'C:/Users/27913/.cache/codex-runtimes/codex-primary-runtime/dependencies';
process.env.RUNTIME_NODE_MODULES = runtime + '/node/node_modules';
process.env.RUNTIME_NODE = runtime + '/node/bin/node.exe';
const skill = 'C:/Users/27913/.codex/plugins/cache/openai-primary-runtime/presentations/26.1007.11041/skills/presentations';
const { Presentation, PresentationFile, FileBlob } = await import(pathToFileURL(runtime + '/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs').href);
const { finalizePresentation } = await import(pathToFileURL(skill + '/container_tools/artifact_tool_utils.mjs').href);
const workspaceDir = path.resolve(process.argv[2]);
const report = JSON.parse(await fs.readFile(path.join(workspaceDir, 'report.json'), 'utf8'));
if (!report.ended_at) throw new Error('Acceptance run is still active');
const build = path.join(workspaceDir, '.build');
const output = path.join(workspaceDir, 'output');
await fs.mkdir(build, { recursive: true });
await fs.mkdir(output, { recursive: true });
const font = 'Microsoft YaHei';
const deck = Presentation.create({ slideSize: { width: 1280, height: 720 } });
const color = { ink: '#123451', blue: '#086AA8', gray: '#52667A', light: '#E8F1F8' };
function text(slide, content, top, height, size = 26, bold = false, tint = color.ink) {
  const shape = slide.shapes.add({ geometry: 'textbox', position: { left: 65, top, width: 1150, height },
    fill: 'none', line: { fill: 'none', width: 0 } });
  shape.text = content;
  shape.text.style = { fontSize: size, typeface: font, bold, color: tint, wrap: true,
    insets: { left: 0, right: 0, top: 0, bottom: 0 } };
  return shape;
}
function slide(title, subtitle) {
  const s = deck.slides.add(); s.background.fill = '#FFFFFF';
  text(s, title, 45, 64, 44, true);
  text(s, subtitle, 117, 66, 25, false, color.gray);
  return s;
}
function table(s, values, widths, top = 205, height = 350, size = 24) {
  const t = s.tables.add({ rows: values.length, columns: values[0].length, values,
    left: 65, top, width: 1150, height, columnWidths: widths });
  t.borders.assign({ style: 'solid', fill: '#D8E3EC', width: 1 });
  t.cells.block({ row: 0, column: 0, rowCount: values.length, columnCount: values[0].length }).assign({
    textStyle: { typeface: font, fontSize: size, color: color.ink },
    margins: { left: 13, right: 13, top: 9, bottom: 9 }, anchor: 'center' });
  t.cells.block({ row: 0, column: 0, rowCount: 1, columnCount: values[0].length }).assign({
    fill: color.blue, textStyle: { typeface: font, fontSize: size, bold: true, color: '#FFFFFF' } });
  for (let r = 1; r < values.length; r++) {
    t.cells.block({ row: r, column: 0, rowCount: 1, columnCount: values[0].length }).fill = r % 2 ? '#F4F8FB' : '#FFFFFF';
  }
  return t;
}
const find = name => report.cases.find(c => c.name === name);
const sec = name => find(name)?.ms == null ? '未测' : (find(name).ms / 1000).toFixed(2) + ' 秒';
const status = name => ({ pass: '通过', fail: '失败', blocked: '待验收' })[find(name)?.status] || '未测';
const pub = find('kg_search_fixed_query')?.result?.data?.service_answer;
const refCount = pub?.references?.length || 0;
const s1 = slide('Agent 工具测试范围', '2026-10-09   固定工具功能测试，暂不评价回答质量');
table(s1, [
  ['能力', '已注册工具', '调用方式'],
  ['图谱查询', 'kg_list、kg_graph、kg_search', '知识 API'],
  ['文献检索', 'rag_search', '知识 API 的检索模式'],
  ['历史与片段', 'search_history、read_evidence', '当前会话历史 / 本轮 API 片段'],
  ['预测与优化', 'predict、recipe_optimize', '预测服务 / 配方优化 API'],
  ['网页读取', 'web_browse', '受白名单限制的网页请求'],
], [210, 570, 370], 205, 355);
text(s1, `共 ${report.inventory.length} 个工具。离线功能与边界测试 ${report.offline.pass}/${report.offline.tests} 通过`, 592, 40, 28, true, color.blue);
text(s1, '本轮新增 7 项代表性测试。离线通过不代表外部服务已经部署', 644, 38, 24, false, color.gray);
s1.speakerNotes.text = `来源：${path.join(workspaceDir, 'report.json')}\n离线原始记录：${path.join(workspaceDir, 'offline-tests.tap')}\n${report.offline.tests}项属于选定的7个测试文件，不是全项目总数。真实测试采用固定工具调用，不含主Agent模型决策。`;
const s2 = slide('代表性工具测试结果', '固定问题：SiC 与 ASC 耐火材料的抗氧化性能有哪些关联？');
table(s2, [
  ['工具', '测试方式', '结果'],
  ['kg_list / kg_graph', '真实 API 各一次', `${status('catalog')} / ${status('graph_read')}，${sec('catalog')} / ${sec('graph_read')}`],
  ['kg_search', '真实 API 一次', `${status('kg_search_fixed_query')}，${sec('kg_search_fixed_query')}，${refCount} 条服务引用`],
  ['rag_search', '真实 API 一次', `${status('rag_search_fixed_query')}，${sec('rag_search_fixed_query')}`],
  ['search_history', '已保存会话 + 本地工具', `${status('persisted_session_history')}，当前主题检索与重置隔离`],
  ['read_evidence', '真实 API 片段 + 本地工具', `${status('kg_search_read_returned_snippet')}，完整片段读取及无效 ID 拒绝`],
  ['predict', '模拟服务；真实部署待测', '成功、参数错误、HTTP错误及断网测试通过'],
], [245, 365, 540], 202, 385);
text(s2, '服务答案、引用及引用绑定逐项比较，原样保留检查通过', 625, 36, 25, true, color.blue);
text(s2, '耗时来自单次样本，不代表平均或并发性能。知识服务费用未提供', 672, 32, 23, false, color.gray);
s2.speakerNotes.text = `逐项来源：${path.join(workspaceDir, 'report.json')}\n知识检索原始服务响应：${path.join(workspaceDir, 'kg_search-upstream.json')}\n范围：${JSON.stringify(report.scope)}\n本页“通过”指功能契约。有效工具请求返回值、答案内容、引用及绑定保持一致。未评价论文支持度，未测完整Agent完成率。predict真实服务健康探测未通过，不能声称真实预测完成。`;
const s3 = slide('待完成项与下一步联调', '本轮完成工具盘点及代表性测试，四项清单仍有待验收内容');
table(s3, [
  ['清单项', '当前结果 / 待完成内容'],
  ['1  工具测试与 PPT', '9 个工具已盘点，代表性测试已留档。预测部署待验收'],
  ['2  前端与模型入口', '已有文本链路与历史验收。两个 Tab 整体验收、本地微调模型仍需补齐'],
  ['3  API 等待状态', `知识检索单次 ${sec('kg_search_fixed_query')}。需联调上游状态事件，确认可优化环节`],
  ['4  推理模式与多模态', 'CoT/ToT 默认策略、subagent 公开摘要/状态协议及真实图片测试待确认'],
], [305, 845], 205, 350);
text(s3, '下一步：按统一清单验收前端入口，再与李铭豪核对服务协议', 590, 60, 28, true, color.blue);
text(s3, '保留范围校验与错误处理。暂不新增答案质量实验或语义核验', 654, 34, 24, false, color.gray);
s3.speakerNotes.text = `测试结果：${path.join(workspaceDir, 'report.json')}\n已有浏览器记录：backend_impl/data/agent/integration/browser-stop-history-recheck-20261009/验收记录.md\n任务要求：用户最新四项清单。不存在已协商的CoT/ToT或subagent协议。九工具注册表尚无独立图片分析工具。本轮未改变Agent回答路径。`;
for (let i = 0; i < deck.slides.items.length; i++) {
  const png = await deck.export({ slide: deck.slides.items[i], format: 'png', scale: 1 });
  await fs.writeFile(path.join(build, `slide-${i + 1}.png`), new Uint8Array(await png.arrayBuffer()));
}
const candidatePath = path.join(build, 'candidate.pptx');
await (await PresentationFile.exportPptx(deck)).save(candidatePath);
const finalPath = path.join(output, 'ASC-Agent工具测试结果-20261009-v2.pptx');
const result = await finalizePresentation({ workspaceDir, candidatePath,
  finalPath,
  pythonExecutable: runtime + '/python/python.exe',
  integrityValidatorPath: skill + '/container_tools/inspect_presentation_package_integrity.py',
  layoutValidatorPath: skill + '/container_tools/inspect_presentation_layout_geometry.py',
  explicitTotalSlideCount: 3, requiredNativeTableOwnerSlides: [1, 2, 3],
  layoutArgs: ['--expected-slide-size-emu', '12192000,6858000', '--validate-heading-fit',
    '--require-native-table-slide', '1', '--require-native-table-slide', '2', '--require-native-table-slide', '3'],
  fontPolicy: { basis: 'design', families: [font] }, verifyArtifactToolImport: true,
  receiptPath: path.join(build, 'validation-v2.json') });
const finalDeck = await PresentationFile.importPptx(await FileBlob.load(finalPath));
for (let i = 0; i < finalDeck.slides.items.length; i++) {
  const png = await finalDeck.export({ slide: finalDeck.slides.items[i], format: 'png', scale: 1 });
  await fs.writeFile(path.join(build, `final-slide-${i + 1}.png`), new Uint8Array(await png.arrayBuffer()));
}
console.log(JSON.stringify(result));
