# ASC LAB Frontend Redesign Specification

## Objective

Replace the visible legacy five-step workflow with a new ASC LAB research interface. The first usable release centers on:

1. A ChatGPT-like refractory-materials QA homepage.
2. A table-driven literature management library.
3. Route-complete supporting pages for knowledge graph, data platform, and professional models.

The replacement is non-destructive: legacy source files remain in the repository but are no longer mounted by the active router or application shell.

## Authoritative visual references

- `docs/design/asc-qa-concept.png`
- `docs/design/document-library-concept.png`

The implementation must preserve their three-column QA anatomy, table-driven literature layout, cool white/navy palette, restrained borders, compact scientific-product typography, and responsive drawer behavior.

## Information architecture

| Route | Page | Purpose |
| --- | --- | --- |
| `/` | ASC QA | Main research question and answer workspace |
| `/documents` | Literature management | Search, filter, inspect, and add literature to QA evidence |
| `/knowledge` | Knowledge graph | First-release route-complete graph overview |
| `/data` | Data platform | First-release route-complete data resource overview |
| `/models` | Professional models | First-release route-complete model catalogue |

Unknown paths redirect to `/`.

## Shared application shell

- Fixed dark navy sidebar on desktop.
- ASC LAB wordmark and a prominent “新建问答” action.
- Primary navigation: `QA 首页`, `文献管理`, `知识图谱`, `数据平台`, `专业模型`.
- Recent conversations appear below the primary navigation on the QA route.
- Main content uses true white and pale cool gray surfaces.
- Context panels use a right rail on desktop and an overlay drawer below 1180px.
- Below 760px the sidebar becomes an off-canvas navigation drawer.
- Existing Vue 3 and Vue Router dependencies remain unchanged.

## QA homepage

### Empty state

- Heading: `今天想研究什么？`
- Supporting text focuses on refractory composition, process, microstructure, service performance, and failure mechanism.
- Large composer accepts text and visually supports file attachment.
- Four task shortcuts:
  - `宏观性能分析`
  - `配方与工艺映射`
  - `机理与物相分析`
  - `文献证据检索`

### Composer controls

- File attachment
- Knowledge source: `ASC 文献库`, `个人文献`, `当前文件`
- Model: `Auto`, `ASC 专业模型`, `通用模型`
- Framework: `Auto`, `Hybrid RAG`, `知识图谱 RAG`, `纯文献检索`
- Reasoning: `Auto`, `快速`, `深度分析`
- Ontology enhancement: on/off
- Send

### Answered state

- User question in a pale blue message.
- Structured answer with inline `[R1]`, `[R2]`, `[R3]` citations.
- Research-path footer.
- Follow-up composer fixed at the bottom of the content column.
- Sending an empty question is ignored.
- Sending a question transitions through a brief loading state to the answered state.
- Starting a new question resets the conversation and closes the evidence drawer.

### Evidence evaluation

- Opens automatically when a mock answer completes.
- Three source records linked to citation IDs.
- Switchable `专家评分` and `LLM Judge` modes.
- Metrics:
  - Evidence coverage
  - Source consistency
  - Ontology consistency
  - Conclusion confidence
- Clicking an inline citation selects and highlights the matching source.
- The panel can be closed and reopened without losing the answer.

## Literature management

### Summary and commands

- Summary metrics: total literature, expert-selected, parsed, and QA-indexed.
- Commands: `导入 DOI`, `批量导入`, `上传文献`.
- Commands open a front-end-only modal or simulated success state; no backend is required in this release.

### Search and filters

- Search title, DOI, author, journal, or keyword.
- Filters: literature type, year, expert status, parsing status, language.
- Filters combine with search using AND semantics.
- Reset restores the full dataset.

### Table

Visible columns:

- Literature
- DOI
- Author
- Year
- Type
- Domain tags
- Expert score
- Processing status
- Updated time

Selecting a row opens the detail rail. The selected row remains visibly highlighted.

### Detail rail

- PDF thumbnail treatment
- Title, authors, year, DOI, journal, pages, language
- Knowledge level and QA citation count
- Processing pipeline: upload, parse, chunk, index
- Citable chunk preview
- `预览 PDF` and `加入 QA 证据库`
- Adding to QA updates local UI state and the row status.

## Supporting pages

Knowledge graph, data platform, and professional model routes use the shared shell and production-quality empty/overview states. They explain the planned module scope and provide interactive tabs or list selection, but do not invent backend results.

## Design system

- Background: `#f3f7fb`
- Surface: `#ffffff`
- Sidebar: `#073b66` to `#042d50` only as flat adjacent tones, not a gradient
- Primary: `#0869ad`
- Primary hover: `#05588f`
- Heading: `#102a43`
- Body: `#334e68`
- Muted: `#6b7f93`
- Border: `#d8e3ed`
- Success: `#139968`
- Warning: `#c98216`
- Danger: `#c34646`
- Radius: 8px for primary containers, 6px for controls
- Shadow: used only for drawers and floating menus
- Font stack: `Inter`, `Noto Sans SC`, `PingFang SC`, `Microsoft YaHei`, system sans-serif
- Control text: 12–14px, explicit weight and line height
- Body text: 14–16px
- Motion: 160–220ms ease, disabled under `prefers-reduced-motion`

## State and data boundaries

- All first-release content is local mock data.
- Pure model modules own navigation, QA state transitions, evidence selection, literature filtering, and index status.
- Vue components own presentation and event binding.
- No legacy API call is required to render or interact with the new routes.
- Future API integration replaces model data sources without changing page composition.

## Error and empty states

- Empty QA submissions do nothing.
- No literature matches shows a clear reset action.
- Unsupported upload files show a local validation message.
- Mock import actions show an explicit simulated-success message.
- All drawers and modals are keyboard closable.

## Verification

- Node tests cover route definitions, QA state transitions, citation selection, and literature filtering/index updates.
- `npm run build` must succeed.
- Browser verification covers desktop and mobile layouts.
- Core path: open QA → send question → inspect evidence → open literature → filter rows → select document → add to QA.
- Final screenshots are compared directly with both authoritative concept images.
