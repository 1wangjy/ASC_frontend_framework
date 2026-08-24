function normalizeUploadFilename(filename = '') {
  const value = String(filename);
  if (!/[\u0080-\u00ff]/.test(value)) return value;
  if ([...value].some((character) => character.codePointAt(0) > 0xff)) return value;

  const decoded = Buffer.from(value, 'latin1').toString('utf8');
  if (decoded.includes('\ufffd')) return value;
  return decoded;
}

module.exports = { normalizeUploadFilename };
