const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');

const { extractPdfMetadata } = require('../src/services/pdfMetadataExtractorService');

function writeFixture(directory, body) {
  const fixturePath = path.join(directory, 'extractor-fixture.js');
  fs.writeFileSync(fixturePath, body, 'utf8');
  return fixturePath;
}

test('streams one PDF to the extractor and removes its temporary file', async () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metadata-fixture-'));
  const fixturePath = writeFixture(fixtureDir, `
    const fs = require('node:fs');
    const pdfPath = process.argv[2];
    const bytes = fs.readFileSync(pdfPath, 'utf8');
    process.stdout.write(JSON.stringify({
      success: true,
      metadata: { title: bytes.startsWith('%PDF-') ? 'Extracted title' : null },
      source: { temporary_pdf: pdfPath }
    }));
  `);

  try {
    const result = await extractPdfMetadata({
      pdfStream: Readable.from(Buffer.from('%PDF-1.4\n')),
      filename: 'paper.pdf',
      command: process.execPath,
      scriptPath: fixturePath,
      timeoutMs: 1000,
    });

    assert.equal(result.metadata.title, 'Extracted title');
    assert.equal(fs.existsSync(result.source.temporary_pdf), false);
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test('rejects an extractor failure instead of returning false metadata', async () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metadata-fixture-'));
  const fixturePath = writeFixture(fixtureDir, `
    process.stdout.write(JSON.stringify({
      success: false,
      error: { message: 'provider unavailable' }
    }));
    process.exitCode = 1;
  `);

  try {
    await assert.rejects(
      extractPdfMetadata({
        pdfStream: Readable.from(Buffer.from('%PDF-1.4\n')),
        filename: 'paper.pdf',
        command: process.execPath,
        scriptPath: fixturePath,
        timeoutMs: 1000,
      }),
      /provider unavailable/,
    );
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});
