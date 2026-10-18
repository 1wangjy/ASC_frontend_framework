// Structured flags only: a failed call is never promoted to success.
export function resolveToolStatus(result) {
  if (result?.ok === true) return 'ok'
  if (result?.stopped === true) return 'stopped'
  if (result?.budgetDenied === true || result?.data?.retrieval_budget_exhausted === true || result?.data?.quota_exceeded === true) return 'budget_denied'
  return 'error'
}
