const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const express = require('express');

const routePath = require.resolve('../src/routes/attachment');
const controllerPath = require.resolve('../src/controllers/attachmentController');

function loadRouterWithController(controller) {
  delete require.cache[routePath];
  delete require.cache[controllerPath];
  require.cache[controllerPath] = {
    id: controllerPath,
    filename: controllerPath,
    loaded: true,
    exports: controller,
    children: [],
    paths: module.paths,
  };
  return require(routePath);
}

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

test('attachment routes reject non-PDF bytes before the upload controller', async () => {
  let uploadCount = 0;
  const controller = {
    uploadAttachment(req, res) {
      uploadCount += 1;
      if (!Buffer.isBuffer(req.file?.buffer)) {
        res.status(422).json({ success: false, error: 'missing file buffer' });
        return;
      }
      res.status(204).end();
    },
    getAttachment(req, res) {
      res.status(418).json({ matchedFilename: req.params.filename });
    },
    removeAttachment(req, res) {
      res.status(204).end();
    },
    extractMetadata(req, res) {
      res.status(200).json({ success: true, data: { litId: req.params.litId } });
    },
    isAttachmentStorageReady() {
      return false;
    },
  };
  const app = express();
  app.use('/api/attachment', loadRouterWithController(controller));
  app.use((error, req, res, next) => {
    res.status(500).json({ error: error.message });
  });
  const server = await listen(app);
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/api/attachment`;

  try {
    const wrongType = new FormData();
    wrongType.append('file', new Blob(['plain text'], { type: 'text/plain' }), 'test.txt');
    wrongType.append('litId', 'LIT_TEST');
    const wrongTypeResponse = await fetch(`${baseUrl}/upload`, { method: 'POST', body: wrongType });
    assert.equal(wrongTypeResponse.status, 400);

    const wrongSignature = new FormData();
    wrongSignature.append('file', new Blob(['plain text'], { type: 'application/pdf' }), 'test.pdf');
    wrongSignature.append('litId', 'LIT_TEST');
    const wrongSignatureResponse = await fetch(`${baseUrl}/upload`, { method: 'POST', body: wrongSignature });
    assert.equal(wrongSignatureResponse.status, 400);

    const validPdf = new FormData();
    validPdf.append('file', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'test.pdf');
    validPdf.append('litId', 'LIT_TEST');

    const uploadResponse = await fetch(`${baseUrl}/upload`, { method: 'POST', body: validPdf });
    assert.equal(uploadResponse.status, 204);
    assert.equal(uploadCount, 1);

    const testResponse = await fetch(`${baseUrl}/test`);
    assert.equal(testResponse.status, 503);
    const payload = await testResponse.json();
    assert.deepEqual(payload, { success: false, message: 'MongoDB未连接' });

    const metadataResponse = await fetch(`${baseUrl}/metadata/LIT_TEST`, { method: 'POST' });
    assert.equal(metadataResponse.status, 200);
    assert.deepEqual(await metadataResponse.json(), {
      success: true,
      data: { litId: 'LIT_TEST' },
    });

    const filenameResponse = await fetch(`${baseUrl}/paper.pdf`);
    assert.equal(filenameResponse.status, 418);
  } finally {
    await close(server);
    delete require.cache[routePath];
    delete require.cache[controllerPath];
  }
});
