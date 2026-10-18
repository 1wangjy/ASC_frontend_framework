'use strict';

/**
 * MongoDB 可视化管理接口（只读浏览 + 索引管理 + 聚合统计）。
 * 路由前缀：`/api/mongo`
 */

const mongoAdmin = require('../services/mongoAdminService');

function fail(res, error) {
  const status = error?.status || 500;
  const message = String(error?.message || '操作失败');
  if (status >= 500) console.error('mongo-admin error:', error);
  return res.status(status).json({ success: false, error: message.slice(0, 500) });
}

exports.status = async (req, res) => {
  try {
    res.json({ success: true, data: await mongoAdmin.status() });
  } catch (error) { fail(res, error); }
};

exports.collections = async (req, res) => {
  try {
    res.json({ success: true, data: await mongoAdmin.listCollections() });
  } catch (error) { fail(res, error); }
};

exports.find = async (req, res) => {
  try {
    const body = req.body || {};
    res.json({ success: true, data: await mongoAdmin.find(body.collection, body) });
  } catch (error) { fail(res, error); }
};

exports.listIndexes = async (req, res) => {
  try {
    res.json({ success: true, data: await mongoAdmin.listIndexes(req.params.name) });
  } catch (error) { fail(res, error); }
};

exports.createIndex = async (req, res) => {
  try {
    res.json({ success: true, data: await mongoAdmin.createIndex(req.params.name, req.body || {}) });
  } catch (error) { fail(res, error); }
};

exports.dropIndex = async (req, res) => {
  try {
    res.json({ success: true, data: await mongoAdmin.dropIndex(req.params.name, req.params.indexName) });
  } catch (error) { fail(res, error); }
};

exports.aggregate = async (req, res) => {
  try {
    const body = req.body || {};
    res.json({ success: true, data: await mongoAdmin.aggregate(body.collection, body) });
  } catch (error) { fail(res, error); }
};

exports.files = async (req, res) => {
  try {
    const query = { ...req.query };
    res.json({ success: true, data: await mongoAdmin.listFiles(query) });
  } catch (error) { fail(res, error); }
};

exports.bucketFiles = async (req, res) => {
  try {
    const query = { ...req.query };
    res.json({ success: true, data: await mongoAdmin.listBucketFiles(req.params.bucket, query) });
  } catch (error) { fail(res, error); }
};
