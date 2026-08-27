const METADATA_FIELDS = [
  'title',
  'authors',
  'journal',
  'year',
  'pages',
  'doi',
  'abstract',
  'note',
  'entry_type',
];

let queueTail = Promise.resolve();

function enqueue(task) {
  const result = queueTail.then(task, task);
  queueTail = result.catch(() => {});
  return result;
}

function isPresent(value) {
  return value !== null
    && value !== undefined
    && (typeof value !== 'string' || value.trim() !== '');
}

function availableMetadata(metadata = {}) {
  return Object.fromEntries(
    METADATA_FIELDS
      .filter(field => isPresent(metadata[field]))
      .map(field => [
        field,
        typeof metadata[field] === 'string' ? metadata[field].trim() : metadata[field],
      ]),
  );
}

async function waitForAttachment(
  storage,
  filename,
  {
    timeoutMs = 5000,
    intervalMs = 250,
    wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  } = {},
) {
  const maximumAttempts = Math.max(1, Math.ceil(timeoutMs / intervalMs) + 1);
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    const file = await storage.findByFilename(filename);
    if (file) return file;
    if (attempt < maximumAttempts) await wait(intervalMs);
  }

  const error = new Error('GridFS 中暂时无法读取刚上传的附件');
  error.code = 'GRIDFS_ATTACHMENT_NOT_READY';
  throw error;
}

async function extractAndPersistMetadata({
  litId,
  filename,
  storage,
  dbService,
  extractorService,
  overwriteExisting = false,
  wait,
  attachmentTimeoutMs,
  attachmentPollIntervalMs,
}) {
  return enqueue(async () => {
    const file = await waitForAttachment(storage, filename, {
      timeoutMs: attachmentTimeoutMs,
      intervalMs: attachmentPollIntervalMs,
      wait,
    });
    const extraction = await extractorService.extractPdfMetadata({
      pdfStream: storage.openDownloadStream(file._id),
      filename,
    });
    const metadata = availableMetadata(extraction.metadata);
    const current = await dbService.getLit(litId);
    if (!current) {
      const error = new Error('文献记录不存在');
      error.code = 'LITERATURE_NOT_FOUND';
      throw error;
    }

    const payload = Object.fromEntries(
      Object.entries(metadata).filter(([field]) => (
        overwriteExisting || !isPresent(current[field])
      )),
    );
    if (Object.keys(payload).length) {
      await dbService.updateLit(litId, payload);
    }

    const literature = Object.keys(payload).length
      ? await dbService.getLit(litId)
      : current;
    return {
      ...extraction,
      metadata,
      literature,
    };
  });
}

module.exports = {
  extractAndPersistMetadata,
  waitForAttachment,
};
