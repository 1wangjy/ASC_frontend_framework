'use strict';

const crypto = require('node:crypto');
const string = (value, limit = 300) => typeof value === 'string' ? value.trim().slice(0, limit) : null;
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const SAFE_NOTICE = '本轮尚不能发布带证据的研究结论：引用缺失、不可用或不属于当前检索范围。请补充原文或继续检索；不能据此确认材料机理。';

/** Task-local ledger. Only the trusted API adapter may register references.
 * A quote hash is NOT a document revision, nor proof of semantic support.
 */
class EvidenceStore {
  constructor(scope = {}) {
    this.scope = { project_id: string(scope.projectId), graph_id: string(scope.graphId) };
    this.records = new Map();
    this.bytes = 0;
    this.retrievalAttempted = false;
  }

  register(references, scope = {}, acquisition = {}) {
    const registered = [];
    for (const raw of (Array.isArray(references) ? references : []).slice(0, 20)) {
      const ref = object(raw);
      const chunk = object(ref.evidence_chunk);
      const metadata = object(ref.metadata);
      const quote = typeof ref.original_quote === 'string' && ref.original_quote.trim()
        ? ref.original_quote : typeof chunk.text === 'string' ? chunk.text : '';
      // Preserve the complete returned snippet, or decline it explicitly.
      // No invented full-document reads and no silently truncated evidence.
      if (quote.length > 8000) continue;
      const project = string(scope.project_id);
      const graph = string(scope.graph_id);
      const mismatch = Boolean((this.scope.project_id && project !== this.scope.project_id)
        || (this.scope.graph_id && graph !== this.scope.graph_id)
        || (ref.project_id && project && string(ref.project_id) !== project));
      const flagSources = [ref, object(chunk.metadata), metadata, object(ref.review_flags)];
      const unsupported = ['unsupported', 'reviewed_unsupported'].includes(ref.relation_status)
        || ['unsupported', 'reviewed_unsupported'].includes(metadata.relation_status)
        || object(ref.human_review).status === 'unsupported';
      const reviewRequired = flagSources.some((flags) => flags.synthetic_bridge === true
        || flags.not_source_fact === true || flags.requires_human_calibration === true);
      const sourceId = string(ref.source_file_id || ref.paper_id || ref.source_filename || ref.document_title);
      const revision = string(ref.source_revision || metadata.source_revision);
      const locator = {
        chunk_id: string(chunk.chunk_id),
        page: Number.isInteger(ref.page_number) && ref.page_number > 0 ? ref.page_number : null,
        section: string(object(ref.spatial_metadata).section),
      };
      const quoteHash = crypto.createHash('sha256').update(quote).digest('hex');
      const identity = JSON.stringify({ project, graph, sourceId, revision, locator, quoteHash });
      const evidenceId = 'ev_' + crypto.createHash('sha256').update(identity).digest('hex').slice(0, 24);
      const record = {
        evidence_id: evidenceId, kind: 'api_returned_quote',
        reference_id: string(ref.reference_id), source_id: sourceId,
        title: string(ref.document_title || ref.source_filename || ref.reference_id),
        source_revision: revision, quote_sha256: quoteHash, locator, text: quote,
        scope: { project_id: project, graph_id: graph, simulation_id: string(scope.simulation_id) },
        acquisition: { endpoint: string(acquisition.url, 500), qa_run_id: string(acquisition.qa_run_id) },
        provenance_status: 'api_reported_not_independently_verified',
        support_status: unsupported ? 'reviewed_unsupported' : 'unverified',
        citation_eligible: Boolean(quote.trim() && sourceId && (project || graph || scope.simulation_id)
          && !mismatch && !unsupported && !reviewRequired),
        exclusion_reason: mismatch ? 'scope_mismatch' : unsupported ? 'reviewed_unsupported'
          : reviewRequired ? 'requires_review' : !quote.trim() ? 'missing_quote' : !sourceId ? 'missing_source' : null,
        limitations: [!revision && 'document_revision_unknown', !locator.page && !locator.chunk_id && 'locator_unknown',
          'semantic_support_unverified', 'returned_snippet_not_full_document'].filter(Boolean),
      };
      const existing = this.records.get(evidenceId);
      if (!existing) {
        if (this.bytes + quote.length > 60000 || this.records.size >= 20) continue;
        this.records.set(evidenceId, record); this.bytes += quote.length;
      } else if (!record.citation_eligible) {
        // A later observation cannot rehabilitate an earlier rejected item;
        // conversely a newly discovered review flag must revoke eligibility.
        this.records.set(evidenceId, { ...existing, citation_eligible: false,
          exclusion_reason: record.exclusion_reason, support_status: record.support_status });
      }
      registered.push(this.records.get(evidenceId));
    }
    return registered;
  }

  read(id) { return this.records.get(id) || null; }
  snapshot() { return [...this.records.values()]; }
}

function checkAnswer(text, store) {
  const cited = [...new Set(Array.from(String(text).matchAll(/\[(ev_[a-f0-9]{24})\]/g), (m) => m[1]))];
  const malformed = Array.from(String(text).matchAll(/\[(ev_[^\]]{1,100})\]/g), (m) => m[1])
    .filter((id) => !cited.includes(id));
  const invalid = cited.filter((id) => !store.read(id) || !store.read(id).citation_eligible);
  const required = store.retrievalAttempted || cited.length > 0 || malformed.length > 0;
  const blocked = required && (!cited.length || invalid.length > 0 || malformed.length > 0);
  const citations = blocked ? [] : cited.map((id) => {
    const item = store.read(id);
    return { evidence_id: id, title: item.title, source_id: item.source_id,
      quote: item.text.slice(0, 400), locator: item.locator, support_status: item.support_status };
  });
  return {
    text: blocked ? SAFE_NOTICE : required ? '以下为待核验草稿：引用完整性已检查，原文是否支持结论尚未核验。\n\n' + String(text) : String(text), citations,
    answer_check: { status: blocked ? 'blocked' : required ? 'citations_valid_support_unverified' : 'not_checked',
      scope: 'citation_integrity_only', invalid_ids: [...invalid, ...malformed],
      reason: blocked ? !cited.length ? 'missing_current_turn_citation' : 'invalid_or_ineligible_citation' : null,
      semantic_support_verified: false },
  };
}

module.exports = { EvidenceStore, checkAnswer, SAFE_NOTICE };
