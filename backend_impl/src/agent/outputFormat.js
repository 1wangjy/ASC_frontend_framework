'use strict';

// Only the latest user instruction opts in. History/tool data cannot enable it.
function wantsJSONOnly(messages) {
  const last = messages.at(-1);
  if (last?.role !== 'user' || /(?:不要|无需|不用|禁止)\s*(?:只|仅)?\s*(?:用|使用|输出|返回)?\s*JSON/i.test(last.content)) return false;
  return /(?:只(?:需|要)?(?:输出|返回|给出)|仅(?:输出|返回)|只用|仅用)\s*(?:严格\s*|纯\s*|一个\s*|合法\s*)*JSON|JSON\s*(?:格式)?\s*(?:即可|就行)|(?:用|使用)\s*JSON\s*(?:格式)?\s*(?:列出|输出|返回|给出|表示|总结|整理)|(?:输出|返回)\s*(?:相同|同样)?[\u4e00-\u9fff\d\s]{0,8}JSON\s*字段/i.test(last.content);
}

function jsonOnlyText(text) {
  const raw = String(text).trim();
  try { JSON.parse(raw); return raw; } catch { /* Consider one explicit JSON block. */ }
  const blocks = [...raw.matchAll(/```(?:json)?\s*\n?([\s\S]*?)```/gi)];
  if (blocks.length === 1 && (raw.match(/```/g) || []).length === 2) {
    const candidate = blocks[0][1].trim();
    try { JSON.parse(candidate); return candidate; } catch { /* Never invent or repair field values. */ }
  }
  throw new Error('回答未满足只输出JSON的格式要求，请重试。');
}

function nameLimit(request) {
  if (!/(?:起|取|命名|名称|名字|标题)/.test(request)) return null;
  const match = request.match(/不超过\s*(\d{1,3})\s*(?:个)?\s*(?:字|字符)/);
  return match && Number(match[1]) > 0 ? Number(match[1]) : null;
}

function surfaceIssue(text, request) {
  if (/(?:范围|限制|证据\s*ID|evidence_id)/i.test(request) && /\[ev_(?:…|\.{3})\]/.test(text)) {
    return '本轮是在说明证据读取规则，请保留范围说明及历史执行事实，但不要写任何方括号证据ID占位符。只用evidence_id这个字段名描述规则，不构造引用。';
  }
  const limit = nameLimit(request);
  if (limit && ([...String(text).replace(/\s/g, '')].length > limit || /\n/.test(String(text).trim()))) {
    return `本轮只需一个名称，最多${limit}个字符。所有数字、字母、标点都按单个字符计数，只输出名称，不列候选，不加解释。`;
  }
  // Detect only obvious fragments in a requested plan summary, not short valid acknowledgements.
  if (/(?:概括|总结|输出|列出|汇总).{0,10}(?:方案|条件|设置)/.test(request)
      && !/只(?:确认|回复|回答|记住)/.test(request)
      && [...String(text).replace(/\s/g, '')].length < 6) {
    return '刚才回复明显残缺。请按用户历史和本轮修改，完整列出当前方案中的已知对象与条件。不要只输出标题、确认词或半句话，不要编造缺失字段。';
  }
  return null;
}

// Only reconcile execution facts from the server's current-topic history.
// Fixture content can be unverified while the read operation still succeeded.
function historyReadIssue(text, request, history = []) {
  if (!/(?:刚才|之前|上[一轮次])/.test(request) || !/(?:片段|全文|论文|读取|拿到)/.test(request)) return null;
  if (!history.some(entry => entry.tools?.some(tool => tool.name === 'read_evidence' && tool.ok === true))) return null;
  const denial = /(?:没有|未|并未|未能)[^。\n]{0,24}(?:拿到|取到|读取|执行)[^。\n]{0,25}(?:片段|read_evidence)|(?:没有|未给出)[^。\n]{0,12}(?:可用|合法)[^。\n]{0,5}(?:片段|evidence_id)/i;
  if (!denial.test(String(text))) return null;
  return '请核对服务端历史工具执行摘要：其中read_evidence的ok=true，表示当时确实成功读取了API返回的片段，测试夹具片段也属于成功读取事件。请准确说明“读到的是API片段、并非整篇论文，内容真实性和支持度尚未核验”；不能因为夹具内容不是真实文献，或历史最终答案没有显示ID，就否认已记录的读取成功。旧ID仍不得作为本轮证据，当前轮没有新检索也不等于历史没有读取。';
}

module.exports = { wantsJSONOnly, jsonOnlyText, nameLimit, surfaceIssue, historyReadIssue };
