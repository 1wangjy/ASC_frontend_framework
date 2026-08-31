const mongoose = require('mongoose');

class GridFsBucketStorage {
  constructor(db, bucketName = 'attachments') {
    this.bucketName = bucketName;
    this.bucket = new mongoose.mongo.GridFSBucket(db, { bucketName });
  }

  upload(buffer, filename, contentType = 'application/pdf') {
    return new Promise((resolve, reject) => {
      const stream = this.bucket.openUploadStream(filename, {
        contentType,
        metadata: { contentType },
      });

      stream.once('error', reject);
      stream.once('finish', () => {
        resolve({ id: stream.id, filename });
      });
      stream.end(buffer);
    });
  }

  findByFilename(filename) {
    return this.bucket
      .find({ filename })
      .sort({ uploadDate: -1 })
      .limit(1)
      .next();
  }

  openDownloadStream(id) {
    return this.bucket.openDownloadStream(id);
  }

  async deleteByFilename(filename) {
    const file = await this.findByFilename(filename);
    if (!file) return false;
    await this.bucket.delete(file._id);
    return true;
  }
}

module.exports = GridFsBucketStorage;
