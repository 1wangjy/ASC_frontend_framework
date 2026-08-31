const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeUploadFilename } = require('../src/utils/uploadFilename');

test('restores a UTF-8 filename decoded by multipart as latin1', () => {
  assert.equal(
    normalizeUploadFilename('åå­¦ç­åå­¦ä¸èç«ææ.pdf'),
    '化学热力学与耐火材料.pdf'
  );
});

test('keeps ASCII and already-correct Unicode filenames unchanged', () => {
  assert.equal(normalizeUploadFilename('paper.pdf'), 'paper.pdf');
  assert.equal(normalizeUploadFilename('耐火材料.pdf'), '耐火材料.pdf');
  assert.equal(normalizeUploadFilename('café.pdf'), 'café.pdf');
});
