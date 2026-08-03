# ASC LAB Frontend Fidelity Verification

## Verification method

- Concept images inspected with `view_image`:
  - `docs/design/asc-qa-concept.png`
  - `docs/design/document-library-concept.png`
- Implementation captured with Playwright using installed Google Chrome at a native `1600 × 1000` desktop viewport and `390 × 844` mobile viewport.
- Browser automation fallback was used because the current in-app browser exposes navigation but no callable inspection/click API.
- Core workflow automation reported zero browser-console errors and zero uncaught page errors.

## Render evidence

- `docs/superpowers/verification/asc-qa-desktop.png`
- `docs/superpowers/verification/document-library-desktop.png`
- `docs/superpowers/verification/asc-qa-mobile-drawer.png`

## Fidelity ledger

| Comparison point | Concept evidence | Render evidence | Result |
| --- | --- | --- | --- |
| Application shell | Fixed 208px navy sidebar, ASC mark, new question action, five primary routes | Same fixed rail, labels, active state, recent chats and bottom status | Matched |
| QA three-column anatomy | Sidebar, central conversation, right evidence rail | Same anatomy at 1600px; right rail becomes drawer below 1180px | Matched |
| QA copy and controls | Chinese research question, Hybrid RAG selectors, inline R1–R3, expert/LLM evaluation | All required strings and controls are code-native and interactive | Matched |
| QA vertical rhythm | Question and answer appear as consecutive conversation rows | Initial grid stretch created oversized whitespace; fixed with max-content grid rows and re-captured | Fixed and matched |
| Palette and typography | True white, cool gray, dark navy, saturated blue and restrained green | Tokens reproduce the palette; all tool chrome uses explicit compact typography | Matched |
| Literature container model | Metrics, toolbar and a table with a persistent right detail rail | Table remains table-driven; detail rail now starts at the metrics row and spans the workspace | Fixed and matched |
| Literature density | Five compact records, tags, scores and process states | Five records remain visible at 1600 × 1000 with the selected row and metadata rail | Matched |
| Responsive navigation | Mobile navigation is expected to become an overlay drawer | 286px drawer verified at x=0 in a 390 × 844 viewport with a working scrim and close control | Matched |

## Above-the-fold copy audit

QA includes only the approved product and workflow copy: ASC LAB, new question, five navigation destinations, research context, the selected question, answer, evidence evaluation, and composer controls. The literature page includes only the approved title, summary metrics, import actions, filters, table fields, and detail data. No legacy five-step workflow copy appears in active routes.

## Interaction evidence

1. Opened `/`.
2. Submitted an ASC thermal-shock question.
3. Waited for the evidence report to open.
4. Selected inline citation `R2`.
5. Opened `/documents`.
6. Filtered for `SiC`; exactly one table row remained.
7. Selected a non-indexed record and added it to the QA evidence library.
8. Opened `/knowledge`, `/data`, and `/models`.
9. Opened the mobile navigation drawer.

## Intentional boundaries

- All research content and import actions use explicit local demo data.
- No backend result is claimed or synthesized.
- The old workflow files remain in the repository for recoverability but are not reachable from the active router.
