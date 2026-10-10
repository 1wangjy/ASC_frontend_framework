'use strict';

const parameters = {
  type: 'object', properties: { evidence_id: { type: 'string', minLength: 27, maxLength: 27 } },
  required: ['evidence_id'], additionalProperties: false,
};
function validate(args) {
  if (!/^ev_[a-f0-9]{24}$/.test(args.evidence_id)) throw new Error('invalid evidence_id');
  return args;
}
async function execute(args, ctx = {}) {
  validate(args);
  const item = ctx.evidenceStore && ctx.evidenceStore.read(args.evidence_id);
  if (!item) return { ok: false, summary: '证据 ID 不属于本轮已登记的 API 返回证据。', data: null };
  return { ok: true, summary: '返回 API 提供的完整片段；不是整篇文献，支持度未核验。',
    data: { ...item, untrusted: true, usableAsVerifiedFact: false } };
}
module.exports = { name: 'read_evidence', description: '按本轮证据 ID 读取已通过知识 API 返回的完整片段及来源定位。不是整篇文献；不能读取其他任务或任意路径。', parameters, validate, execute };
