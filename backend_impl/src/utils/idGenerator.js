const crypto = require('crypto');

class IdGenerator {
  constructor() {
    this.CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    this.ID_LENGTH = 6;
  }

  generateRandomChars() {
    let result = '';
    const randomBytes = crypto.randomBytes(this.ID_LENGTH);
    for (let i = 0; i < this.ID_LENGTH; i++) {
      const index = randomBytes[i] % this.CHARS.length;
      result += this.CHARS[index];
    }
    return result;
  }

  generateId(prefix) {
    const randomPart = this.generateRandomChars();
    return `${prefix}_${randomPart}`;
  }

  generateMpId() {
    return this.generateId('MP');
  }

  generateTpId() {
    return this.generateId('TP');
  }

  generateMcId() {
    return this.generateId('MC');
  }

  generateMrId() {
    return this.generateId('MR');
  }

  generateFeId() {
    return this.generateId('FE');
  }

  generateRuId() {
    return this.generateId('RU');
  }

  generateLitId() {
    return this.generateId('LIT');
  }

  validateId(id, prefix) {
    const regex = new RegExp(`^${prefix}_[A-Z0-9]{6}$`);
    return regex.test(id);
  }

  validateMpId(id) {
    return this.validateId(id, 'MP');
  }

  validateTpId(id) {
    return this.validateId(id, 'TP');
  }

  validateMcId(id) {
    return this.validateId(id, 'MC');
  }

  validateMrId(id) {
    return this.validateId(id, 'MR');
  }

  validateFeId(id) {
    return this.validateId(id, 'FE');
  }

  validateRuId(id) {
    return this.validateId(id, 'RU');
  }

  getCurrentTimestamp() {
    const now = new Date();
    return now.toISOString().replace('T', ' ').substring(0, 19);
  }
}

module.exports = new IdGenerator();
