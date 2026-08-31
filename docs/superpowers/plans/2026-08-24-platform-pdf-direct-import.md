# Platform PDF Direct Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user import one PDF into the data-platform literature library without completing metadata first, while preserving GridFS preview and later manual editing.

**Architecture:** A focused browser utility validates the PDF and reads standard Document Info metadata. A separate import workflow composes the existing 3001 health, literature CRUD, and attachment APIs with rollback and degraded-success semantics; `DataManagerView.vue` only manages file selection and user-facing status. The 3001 attachment route remains GridFS-backed and rejects non-PDF uploads before the controller writes them.

**Tech Stack:** Vue 3, browser File/ArrayBuffer APIs, Axios, Node.js built-in test runner, Express, Multer, SQLite, MongoDB GridFS.

## Global Constraints

- Work only in `D:\ASC\AI4Sci-NEXUS-ASC-Development-Domain-main\frontend`.
- Vue runs on 3005, Node data platform on 3001, Python on 5001, and MongoDB on 27017.
- Do not modify `backend/**`, `/documents`, `/api/pdf-library/*`, graph flows, models, LLM, Embedding, authentication, or 3001-to-5001 synchronization.
- Import exactly one PDF at a time; do not add batching, OCR, online DOI lookup, LLM extraction, search, filtering, or pagination.
- Do not add a PDF parsing dependency. Only read reliably decodable standard PDF Document Info `Title` and `Author`; otherwise retain the filename fallback title.
- Keep the existing manual literature create/edit/delete and `entry_type = patent` behavior.
- Keep GridFS as the attachment store. Do not mock MongoDB success and do not install MongoDB for verification.

---

### Task 1: Browser PDF validation and metadata extraction

**Files:**
- Create: `src/platform/utils/pdfMetadata.js`
- Test: `tests/platformPdfMetadata.test.js`

**Interfaces:**
- Produces: `fallbackTitleFromFilename(filename: string): string`.
- Produces: `validatePdfSelection(file: File): Promise<void>`, rejecting with a Chinese user-facing error for a bad name, MIME type, or `%PDF-` signature.
- Produces: `extractPdfMetadata(file: File): Promise<{ title?: string, authors?: string }>`; unparseable metadata returns `{}` and never invents fields.

- [ ] **Step 1: Write failing utility tests**

```js
test('uses the PDF filename as fallback title', () => {
  assert.equal(fallbackTitleFromFilename('A_review.pdf'), 'A_review')
})

test('rejects a renamed non-PDF by signature', async () => {
  const file = new File(['not pdf'], 'fake.pdf', { type: 'application/pdf' })
  await assert.rejects(validatePdfSelection(file), /有效的 PDF/)
})

test('extracts literal standard PDF title and author', async () => {
  const source = '%PDF-1.4\n1 0 obj << /Title (Rubber Study) /Author (Alice; Bob) >> endobj'
  const file = new File([source], 'fallback.pdf', { type: 'application/pdf' })
  assert.deepEqual(await extractPdfMetadata(file), {
    title: 'Rubber Study',
    authors: 'Alice; Bob'
  })
})
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/platformPdfMetadata.test.js`

Expected: FAIL because `src/platform/utils/pdfMetadata.js` does not exist.

- [ ] **Step 3: Implement the no-dependency utility**

Implement filename normalization, `File.arrayBuffer()` reading, `%PDF-` signature validation, PDF literal-string escape decoding, and Document Info lookup for `/Title (...)` and `/Author (...)`. Also support UTF-16BE hex strings with a BOM when the value is written as `<FEFF...>`; return only non-empty values.

```js
export function fallbackTitleFromFilename(filename = '') {
  const normalized = String(filename).trim().replace(/\.pdf$/i, '').trim()
  return normalized || String(filename).trim() || '未命名 PDF'
}

export async function validatePdfSelection(file) {
  if (!file || !/\.pdf$/i.test(file.name || '')) throw new Error('请选择 PDF 文件')
  if (file.type && file.type !== 'application/pdf') throw new Error('请选择 PDF 文件')
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (new TextDecoder('ascii').decode(bytes.slice(0, 5)) !== '%PDF-') {
    throw new Error('文件不是有效的 PDF')
  }
}
```

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `node --test tests/platformPdfMetadata.test.js`

Expected: all tests PASS.

- [ ] **Step 5: Commit the utility task**

```powershell
git add -- src/platform/utils/pdfMetadata.js tests/platformPdfMetadata.test.js
git commit -m "feat: read PDF import metadata"
```

### Task 2: Transaction-like literature PDF import workflow

**Files:**
- Create: `src/platform/services/literaturePdfImport.js`
- Modify: `src/platform/api/attachment.js`
- Test: `tests/platformLiteraturePdfImport.test.js`

**Interfaces:**
- Consumes: `validatePdfSelection`, `fallbackTitleFromFilename`, and `extractPdfMetadata` from Task 1.
- Produces: `importLiteraturePdf(file: File, options?: { dependencies?: object, onProgress?: function }): Promise<{ literature: object, metadataApplied: boolean, degraded: boolean }>`.
- The injectable dependency object uses these exact names: `validatePdfSelection`, `testMongoDB`, `createLiterature`, `uploadAttachment`, `extractPdfMetadata`, `updateLiterature`, and `removeLiterature`.
- Progress values are exactly `validating`, `uploading`, `parsing`, and `complete`.
- `testMongoDB()` resolves only when GridFS is ready and rejects when `/api/attachment/test` reports unavailable.

- [ ] **Step 1: Write failing workflow tests with injected dependencies**

Cover these cases with event arrays and fake functions:

```js
test('preflight failure creates no literature', async () => {
  let created = 0
  await assert.rejects(importLiteraturePdf(pdfFile, {
    dependencies: {
      validatePdfSelection: async () => {},
      testMongoDB: async () => { throw new Error('MongoDB未连接') },
      createLiterature: async () => { created += 1 }
    }
  }), /MongoDB未连接/)
  assert.equal(created, 0)
})

test('creates, uploads, extracts and updates in order', async () => {
  assert.deepEqual(events, ['health', 'create', 'upload:LIT_1', 'extract', 'update:LIT_1'])
})

test('rolls back a temporary literature when upload fails', async () => {
  assert.deepEqual(events, ['health', 'create', 'upload:LIT_1', 'remove:LIT_1'])
})

test('metadata failure returns degraded success without deleting the PDF record', async () => {
  assert.equal(result.degraded, true)
  assert.equal(events.includes('remove:LIT_1'), false)
})
```

Also assert that create receives a payload whose `title` is the filename fallback, whose `entry_type` is `journal`, and whose unsupported/unknown metadata fields are empty rather than invented.

- [ ] **Step 2: Run workflow tests and verify RED**

Run: `node --test tests/platformLiteraturePdfImport.test.js`

Expected: FAIL because the workflow module does not exist.

- [ ] **Step 3: Implement the workflow using existing APIs**

Use default dependencies wrapping `create('lit', payload)`, `update('lit', litId, data)`, `remove('lit', litId)`, `uploadAttachment(file, litId)`, and `testMongoDB()`. Validate before preflight; create only after preflight succeeds. On upload failure, attempt `remove('lit', litId)` and rethrow an error that mentions rollback failure if cleanup also fails. Catch extraction or metadata-update errors and return `{ degraded: true }` without deleting the uploaded record.

```js
const minimalLiterature = {
  title: fallbackTitleFromFilename(file.name),
  authors: '', journal: '', year: '', volume: '', number: '', pages: '',
  doi: '', abstract: '', note: '', entry_type: 'journal'
}
```

Update `testMongoDB()` to catch Axios HTTP failures and throw `new Error(error.response?.data?.message || error.response?.data?.error || error.message || '附件服务不可用')`. A `{ success: false }` HTTP-200 response continues to be rejected by `unwrapApiSuccess`.

- [ ] **Step 4: Run Task 1 and Task 2 tests and verify GREEN**

Run: `node --test tests/platformPdfMetadata.test.js tests/platformLiteraturePdfImport.test.js`

Expected: all tests PASS.

- [ ] **Step 5: Commit the workflow task**

```powershell
git add -- src/platform/services/literaturePdfImport.js src/platform/api/attachment.js tests/platformLiteraturePdfImport.test.js
git commit -m "feat: orchestrate direct PDF literature import"
```

### Task 3: Enforce PDF-only uploads and expose GridFS readiness

**Files:**
- Modify: `backend_impl/src/routes/attachment.js`
- Modify: `backend_impl/src/controllers/attachmentController.js`
- Modify: `backend_impl/test/attachmentRoutes.test.js`

**Interfaces:**
- Produces: `attachmentController.isAttachmentStorageReady(): boolean`.
- `GET /api/attachment/test` returns HTTP 200 with `{ success: true }` only when GridFS is initialized; otherwise HTTP 503 with `{ success: false, message: 'MongoDB未连接' }`.
- `POST /api/attachment/upload` returns HTTP 400 `{ success: false, error: '只允许上传 PDF 文件' }` when filename, MIME, or `%PDF-` signature validation fails.

- [ ] **Step 1: Extend the existing route test and verify RED**

Add cases that send:

```js
new Blob(['plain text'], { type: 'text/plain' }), 'fake.txt'
new Blob(['plain text'], { type: 'application/pdf' }), 'fake.pdf'
new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'valid.pdf'
```

Assert the first two receive 400 and never call the upload controller; assert the valid PDF reaches the controller with `req.file.buffer`. Stub `isAttachmentStorageReady` as both true and false and assert `/test` returns 200 and 503 respectively without matching `/:filename`.

- [ ] **Step 2: Run the backend route test and verify RED**

Run from `backend_impl`: `node --test test/attachmentRoutes.test.js`

Expected: at least the MIME/signature rejection and unavailable-status assertions FAIL.

- [ ] **Step 3: Add the minimal route/controller validation**

Keep `multer.memoryStorage()`. Add one upload middleware after `upload.single('file')` that checks:

```js
const hasPdfName = /\.pdf$/i.test(req.file?.originalname || '')
const hasPdfMime = req.file?.mimetype === 'application/pdf'
const hasPdfSignature = req.file?.buffer?.subarray(0, 5).toString('ascii') === '%PDF-'
```

Return 400 unless all three are true. Export `isAttachmentStorageReady` from the controller as `Boolean(gfs && mongoose.connection.readyState === 1)`, and make `/test` return 503 when it is false.

- [ ] **Step 4: Run backend attachment and schema tests and verify GREEN**

Run from `backend_impl`: `node --test test/attachmentRoutes.test.js test/literatureSchema.test.js`

Expected: all tests PASS.

- [ ] **Step 5: Commit the backend validation task**

```powershell
git add -- backend_impl/src/routes/attachment.js backend_impl/src/controllers/attachmentController.js backend_impl/test/attachmentRoutes.test.js
git commit -m "fix: validate GridFS PDF uploads"
```

### Task 4: Add the direct-import page flow

**Files:**
- Modify: `src/platform/views/DataManagerView.vue`
- Create: `tests/platformLiteratureDirectImportView.test.js`

**Interfaces:**
- Consumes: `importLiteraturePdf(file, { onProgress })` from Task 2.
- Keeps: existing `openAddLitModal`, `openEditLitModal`, CRUD operations, and `LiteratureAttachmentActions` preview behavior.

- [ ] **Step 1: Write the failing view contract test**

Render or load `DataManagerView.vue` and assert that the literature tab contains a primary “导入 PDF” action, a secondary “手动新增” action, `accept=".pdf,application/pdf"`, and progress copy for importing. Assert the existing edit button and `LiteratureAttachmentActions` remain present.

- [ ] **Step 2: Run the view test and verify RED**

Run: `node --test tests/platformLiteratureDirectImportView.test.js`

Expected: FAIL because the direct-import action and status do not exist.

- [ ] **Step 3: Implement the page interaction**

Add `importingPdf` and `pdfImportStatus` refs. The primary action opens a single-file input directly rather than the metadata modal. Its change handler calls `importLiteraturePdf` and maps progress to:

```js
const progressText = {
  validating: '正在检查 PDF…',
  uploading: '正在上传 PDF…',
  parsing: '正在解析文献信息…',
  complete: '导入完成'
}
```

After success, refresh `litData`. Show `PDF 已导入，可稍后补充文献信息` when `result.degraded` is true. On failure, show the backend/user-facing error and do not claim success. Disable import while busy. Keep the current manual form as the secondary “手动新增” action.

- [ ] **Step 4: Run focused frontend tests and build**

Run:

```powershell
node --test tests/platformPdfMetadata.test.js tests/platformLiteraturePdfImport.test.js tests/platformLiteratureDirectImportView.test.js tests/platformLiteratureApi.test.js tests/platformLiteratureAttachmentActions.test.js
npm run build
```

Expected: all focused tests PASS and Vite exits 0.

- [ ] **Step 5: Verify the live environment without installing MongoDB**

Check listeners on 3001, 3005, and 27017. If 27017 is unavailable, call the 3005-proxied attachment health endpoint and verify direct import stops before literature creation; report live upload and preview as `BLOCKED_BY_MONGODB`. Verify ordinary literature CRUD remains available.

- [ ] **Step 6: Check scope and working-tree safety**

Run:

```powershell
git diff --check
git diff --name-only
git diff --name-only -- backend src/views/DocumentLibraryView.vue src/api/pdfLibrary.js
```

Expected: no whitespace errors, and no changes under prohibited paths.

- [ ] **Step 7: Commit the page integration**

```powershell
git add -- src/platform/views/DataManagerView.vue tests/platformLiteratureDirectImportView.test.js
git commit -m "feat: add direct PDF literature import"
```
