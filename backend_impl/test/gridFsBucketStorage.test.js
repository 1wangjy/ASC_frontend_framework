const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const GridFsBucketStorage = require('../src/services/gridFsBucketStorage');

test('stores, streams, and deletes a PDF with the current MongoDB driver', async (t) => {
  const client = new mongoose.mongo.MongoClient('mongodb://127.0.0.1:27017', {
    serverSelectionTimeoutMS: 1000,
  });
  const databaseName = `asc_gridfs_test_${Date.now()}_${process.pid}`;

  try {
    await client.connect();
  } catch (error) {
    t.skip(`MongoDB unavailable: ${error.message}`);
    return;
  }

  const db = client.db(databaseName);
  const storage = new GridFsBucketStorage(db, 'attachments');
  const pdf = Buffer.from('%PDF-1.4\nGridFS integration test');

  try {
    const uploaded = await storage.upload(pdf, 'paper.pdf', 'application/pdf');
    const storedFile = await storage.findByFilename('paper.pdf');
    assert.equal(storedFile._id.toString(), uploaded.id.toString());
    assert.equal(storedFile.contentType, 'application/pdf');

    const chunks = [];
    for await (const chunk of storage.openDownloadStream(storedFile._id)) {
      chunks.push(chunk);
    }
    assert.deepEqual(Buffer.concat(chunks), pdf);

    assert.equal(await storage.deleteByFilename('paper.pdf'), true);
    assert.equal(await storage.findByFilename('paper.pdf'), null);
  } finally {
    await db.dropDatabase();
    await client.close();
  }
});
