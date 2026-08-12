# Task 7 Report: Report-center verification checkpoint

## Automated verification

- Focused report suite: 90/90 passed.
- Full frontend suite: 382/382 passed.
- Production build: exit 0, 763 modules transformed.
- `git diff --check 192e1c6..HEAD`: exit 0.
- Existing Vite `d3` mixed-import warning remains; this checkpoint did not touch those imports.

## Stopped-status TDD closeout

RED command:

```powershell
node --test tests/ascLabExperience.test.js
```

RED result: 58 tests, 57 passed, 1 failed because stopped simulations still fell through to `Running` and 60% progress.

GREEN command:

```powershell
node --test tests/ascLabExperience.test.js
```

GREEN result: 58 tests, 58 passed. `SimulationRunView` now displays `Stopped`, uses 50% non-completed progress, and has a neutral stopped status dot.

## Controlled real-browser verification

- The existing port-3000 Vite process belonged to the repository-root frontend, not this worktree. It was not interrupted or reused as proof of the current diff.
- The current worktree ran on temporary `http://127.0.0.1:4175`, proxied to the existing `http://127.0.0.1:5002` backend.
- Browser: Chrome 151.0.7922.76, separate headless profile, CDP network capture. Non-read methods were configured for browser-side interception; none were attempted.
- Backend fixtures: project `proj_3a65ef421cc6`, graph `nexus_b1826c08d4ab49bc`, simulation `sim_1df0b4f7267d`, report `report_1a6c38f80e39`.
- Inventory: 7 backend reports, all completed; 8 backend graph projects.
- Report center: 6 lifecycle cards, 5 completed cards, 1 unmatched/unknown project record, 5 Preview links, 5 Download buttons, and 3 qualified QA buttons.
- Existing reuse: `/api/report/check/sim_1df0b4f7267d` returned the same completed `report_1a6c38f80e39` and `has_report: true`.
- Preview: `/report/report_1a6c38f80e39` rendered the canonical completed document plus Download and QA actions.
- Download: one deliberate click produced exactly one `GET /api/report/report_1a6c38f80e39/download`.
- Network totals: 15 backend requests, 15 GET, 15 HTTP 200, 0 writes, 0 report-generation requests, 0 graph-build/ontology-generation requests, 0 simulation create/start requests.
- Post-smoke report inventory remained 7 completed reports.

## Live-data limitations

- The live backend exposed no generating report, so generating UI could not be observed against real data; automated lifecycle, action, and reader tests cover it.
- The live snapshot exposed no eligible Generate button. No disposable project was authorized, so no generation click was performed; POST count remained 0. Controller behavior tests retain the deliberate-click one-POST proof.

## Boundaries and self-review

- No backend path, `D:/WEB` file, port-3001 reference frontend, or worktree `tmp/` was modified.
- Business-code changes in this checkpoint are limited to the authorized stopped-status display/progress closeout and its test.
- The exact checkpoint evidence is appended to the migration plan; no expected result is represented as a live result.
- Independent read-only review: APPROVED, with no Critical, Important, or Minor findings. The reviewer independently reran the focused suite (90/90), full suite (382/382), and build (763 modules).
- No known blocking concern.

## Commit

Commit subject: `docs: verify report center migration`

The stopped-status closeout, plan evidence, and this report are included in the same checkpoint commit.
