# ASC LAB Three-Page Refinement Fidelity Ledger

## Verification method

- Opened `http://127.0.0.1:4173/` in the Codex built-in browser first.
- The built-in browser surface did not expose screenshot, viewport, or DOM-inspection controls to this task, so visual capture and interaction automation used bundled Playwright with the locally installed Microsoft Edge executable.
- Desktop implementation viewport: 1600 × 1000.
- Graph concept capture viewport: 1500 × 920.
- Mobile implementation viewport: 390 × 844.
- Accepted references inspected with `view_image`:
  - `docs/design/asc-qa-concept.png`
  - `docs/design/document-library-concept.png`
  - `docs/superpowers/verification/2026-08-03-graph-concept.png`
- Latest implementation screenshots inspected with `view_image`:
  - `docs/superpowers/verification/2026-08-03-qa-desktop.png`
  - `docs/superpowers/verification/2026-08-03-library-desktop.png`
  - `docs/superpowers/verification/2026-08-03-graph-entry-desktop.png`
  - `docs/superpowers/verification/2026-08-03-graph-explorer-desktop.png`
  - `docs/superpowers/verification/2026-08-03-mobile.png`

## Fidelity comparisons

| Area | Accepted evidence | Render evidence | Result or repair |
| --- | --- | --- | --- |
| Shared shell | Navy ASC LAB sidebar, cool gray page, white content surfaces | All four desktop screenshots | Preserved sidebar width, active route treatment, palette, borders, and compact type. Removed only the explicitly rejected bottom demo status. |
| QA first viewport | Centered research prompt and compact scientific controls | `2026-08-03-qa-desktop.png` | Preserved centered hierarchy. Removed file and knowledge-base controls; domestic model, framework, reasoning, ontology, and send controls fit one desktop row. |
| Four prompt cards | Four equal compact cards in the original area | QA desktop and mobile screenshots | Desktop uses one 4-column row with equal 76px cards; mobile reflows to one column. Each card has one category, one question, and one refresh icon. |
| QA interaction | Settings remain visible and evidence workflow remains available | Playwright interaction report | Single-card refresh changed only that question; card click filled without sending; NEXUS forced ontology on and disabled the toggle. |
| Literature search | Table-first library with summary metrics and detail rail | `2026-08-03-library-desktop.png` | Preserved summary/table density. Replaced five metadata filters with the approved search, exact-year buttons, type, active conditions, and result count. |
| Literature details | Right rail aligned with selected table row | Library desktop screenshot | Rail now contains exactly title, abstract, and keywords. Pipeline, chunk preview, duplicated metadata, and QA action were removed. |
| Literature mobile | Responsive table plus overlay details | Playwright mobile check | Repaired initial mobile state so the list is unobstructed; selecting a row opens the detail drawer. No whole-page horizontal overflow. |
| Graph entry | One API launch card followed by graph workspace | Graph concept and `2026-08-03-graph-entry-desktop.png` | Production entry retains one central launch action and omits concept-only explanatory contract cards. |
| Graph search and focus | Top search, stable node IDs, centered highlighted target, right detail | Graph concept and latest explorer screenshot | `SiC` search selected `material:sic`; transform is `translate(80px, 44px) scale(1.2)`, details synchronized, direct relations highlighted. |
| Graph canvas fit | All focused neighbors remain readable inside the workspace | Latest explorer screenshot | Repaired oversized nodes, moved the far-right seed node, and constrained the canvas to the viewport. Final check reported all node bounds inside the canvas and page height equal to viewport height. |
| Mobile QA and graph | Controls remain usable at approximately 390px | QA mobile screenshot plus graph mobile check | No document-level horizontal overflow; controls stack cleanly and graph details move above the compact canvas. |

## Above-the-fold copy audit

- QA visible components contain none of: `文件`, `知识库`, `个人文献`, `当前文件`, `本体增强已启用`.
- Approved categories are present in the question-guide model.
- Model options come only from the approved domestic `LLM · Version` list.
- Literature details contain none of: `处理流水线`, `切片`, `加入 QA`, `预览 PDF`, `知识层级`, `引用次数`.
- Knowledge entry no longer mounts `ModuleOverview` or its three legacy overview cards.

## Core interaction evidence

- Card refresh changed the displayed question and left the other categories intact through the tested model contract.
- Clicking a guide filled the composer without sending.
- NEXUS set ontology `aria-pressed="true"` and disabled its control.
- Year `2024` plus query `residual strength` produced exactly one document row.
- Document details rendered two sections: abstract and keywords; pipeline count was zero.
- Knowledge launch navigated to `/knowledge/explorer` when no API endpoint was configured.
- Searching `SiC` focused the SiC SVG node, centered the tested coordinate, and updated the details panel.
- Browser console and page-error collection returned zero issues.

## Intentional deviations

- The graph concept's API-contract explanation cards and service-status pill are design-review annotations, not production UI, so they are not rendered inside ASC LAB.
- The local graph explorer contains eight front-end demonstration nodes. A configured launch API may redirect to the backend-owned graph page without changing the ASC entry page.
- The earlier QA and literature concept PNGs remain visual-system references; the approved 2026-08-03 written specification supersedes their removed controls and detail fields.

No material visual mismatch remains in the verified states.
