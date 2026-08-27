const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const {
  extractAndPersistMetadata,
} = require('../src/services/literatureMetadataService');

test('waits for GridFS visibility and persists only extractable empty fields', async () => {
  let findCount = 0;
  const waits = [];
  let updatePayload;
  const current = {
    lit_id: 'LIT_TEST',
    title: 'Existing title',
    authors: '',
    year: '',
    doi: '',
    entry_type: '',
    attachment: 'paper.pdf',
  };
  const storage = {
    async findByFilename() {
      findCount += 1;
      return findCount < 3 ? null : { _id: 'GRID_FILE' };
    },
    openDownloadStream() {
      return Readable.from(Buffer.from('%PDF-1.4\n'));
    },
  };
  const dbService = {
    async getLit() {
      return updatePayload ? { ...current, ...updatePayload } : current;
    },
    async updateLit(litId, payload) {
      assert.equal(litId, 'LIT_TEST');
      updatePayload = payload;
    },
  };
  const extractorService = {
    async extractPdfMetadata() {
      return {
        success: true,
        metadata: {
          title: 'Extracted title',
          authors: 'Alice, Bob',
          year: 2025,
          doi: null,
          entry_type: 'journal',
        },
      };
    },
  };

  const result = await extractAndPersistMetadata({
    litId: 'LIT_TEST',
    filename: 'paper.pdf',
    storage,
    dbService,
    extractorService,
    overwriteExisting: false,
    wait: async (milliseconds) => { waits.push(milliseconds); },
  });

  assert.deepEqual(waits, [250, 250]);
  assert.deepEqual(updatePayload, {
    authors: 'Alice, Bob',
    year: 2025,
    entry_type: 'journal',
  });
  assert.equal(result.literature.title, 'Existing title');
  assert.equal(result.literature.authors, 'Alice, Bob');
});

test('runs metadata extraction jobs one at a time', async () => {
  let active = 0;
  let maximumActive = 0;
  const storage = {
    async findByFilename(filename) {
      return { _id: filename };
    },
    openDownloadStream() {
      return Readable.from(Buffer.from('%PDF-1.4\n'));
    },
  };
  const dbService = {
    async getLit(litId) {
      return { lit_id: litId, title: '', attachment: `${litId}.pdf` };
    },
    async updateLit() {},
  };
  const extractorService = {
    async extractPdfMetadata() {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise(resolve => setTimeout(resolve, 10));
      active -= 1;
      return { success: true, metadata: { title: 'Extracted' } };
    },
  };

  await Promise.all([
    extractAndPersistMetadata({
      litId: 'LIT_A', filename: 'A.pdf', storage, dbService, extractorService,
    }),
    extractAndPersistMetadata({
      litId: 'LIT_B', filename: 'B.pdf', storage, dbService, extractorService,
    }),
  ]);

  assert.equal(maximumActive, 1);
});
