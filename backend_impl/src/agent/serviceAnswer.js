'use strict';
// A service response, not a scientifically verified answer. No model rewrite.
function serviceAnswer(outcome, context = {}) {
  const answer = outcome?.ok === true ? outcome.data?.service_answer : null;
  if (!answer || typeof answer.text !== 'string' || !answer.text.trim()) return null;
  if ((context.projectId && answer.scope?.project_id !== context.projectId)
    || (context.graphId && answer.scope?.graph_id !== context.graphId)) return null;
  return { text: answer.text,
    citations: (answer.references || []).map((ref, i) => ({
      evidence_id: ref.reference_id || `service_reference_${i + 1}`,
      title: ref.document_title || ref.source_filename || ref.reference_id,
      source_id: ref.source_file_id || ref.paper_id || ref.source_filename,
      text: ref.original_quote || ref.evidence_chunk?.text || '',
      locator: { page: ref.page_number || null, chunk_id: ref.evidence_chunk?.chunk_id || null },
      support_status: 'service_reported_not_checked',
    })),
    service_references: answer.references, citation_bindings: answer.citation_bindings,
    answer_check: { status: 'knowledge_service_answer', scope: 'service_passthrough',
      semantic_support_verified: false, qa_run_id: answer.qa_run_id, source: 'knowledge_service' } };
}
module.exports = { serviceAnswer };
