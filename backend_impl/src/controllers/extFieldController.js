const db = require('../models/db');

class ExtFieldController {
  // 添加维度
  async addExtField(req, res) {
    try {
      const { collection, id, fieldName, fieldValue } = req.body;

      if (!collection || !id || !fieldName) {
        return res.status(400).json({
          code: 400,
          message: 'Collection, id, and fieldName are required'
        });
      }

      // 查询现有数据
      const data = (await db.read(collection, { id }))[0];
      if (!data) {
        return res.status(404).json({
          code: 404,
          message: 'Data not found'
        });
      }

      // 更新ext_fields
      const extFields = data.ext_fields || {};
      extFields[fieldName] = fieldValue;

      await db.update(collection, { id }, { ext_fields: extFields });

      res.json({
        code: 200,
        message: 'Extension field added successfully',
        data: {
          collection,
          id,
          fieldName,
          fieldValue
        }
      });
    } catch (error) {
      console.error('Error adding extension field:', error);
      res.status(500).json({
        code: 500,
        message: 'Internal server error'
      });
    }
  }

  // 编辑维度
  async updateExtField(req, res) {
    try {
      const { collection, id, fieldName, fieldValue } = req.body;

      if (!collection || !id || !fieldName) {
        return res.status(400).json({
          code: 400,
          message: 'Collection, id, and fieldName are required'
        });
      }

      // 查询现有数据
      const data = (await db.read(collection, { id }))[0];
      if (!data) {
        return res.status(404).json({
          code: 404,
          message: 'Data not found'
        });
      }

      // 更新ext_fields
      const extFields = data.ext_fields || {};
      if (!extFields[fieldName]) {
        return res.status(404).json({
          code: 404,
          message: 'Extension field not found'
        });
      }

      extFields[fieldName] = fieldValue;

      await db.update(collection, { id }, { ext_fields: extFields });

      res.json({
        code: 200,
        message: 'Extension field updated successfully',
        data: {
          collection,
          id,
          fieldName,
          fieldValue
        }
      });
    } catch (error) {
      console.error('Error updating extension field:', error);
      res.status(500).json({
        code: 500,
        message: 'Internal server error'
      });
    }
  }

  // 删除维度
  async deleteExtField(req, res) {
    try {
      const { collection, id, fieldName } = req.body;

      if (!collection || !id || !fieldName) {
        return res.status(400).json({
          code: 400,
          message: 'Collection, id, and fieldName are required'
        });
      }

      // 查询现有数据
      const data = (await db.read(collection, { id }))[0];
      if (!data) {
        return res.status(404).json({
          code: 404,
          message: 'Data not found'
        });
      }

      // 更新ext_fields
      const extFields = data.ext_fields || {};
      if (!extFields[fieldName]) {
        return res.status(404).json({
          code: 404,
          message: 'Extension field not found'
        });
      }

      delete extFields[fieldName];

      await db.update(collection, { id }, { ext_fields: extFields });

      res.json({
        code: 200,
        message: 'Extension field deleted successfully',
        data: {
          collection,
          id,
          fieldName
        }
      });
    } catch (error) {
      console.error('Error deleting extension field:', error);
      res.status(500).json({
        code: 500,
        message: 'Internal server error'
      });
    }
  }

  // 查询包含扩展字段的数据
  async queryWithExtFields(req, res) {
    try {
      const { collection, query, extFieldsQuery, options } = req.body;

      if (!collection) {
        return res.status(400).json({
          code: 400,
          message: 'Collection is required'
        });
      }

      // 构建查询条件
      const finalQuery = { ...query };
      if (extFieldsQuery) {
        finalQuery.ext_fields = extFieldsQuery;
      }

      const data = await db.read(collection, finalQuery, options || {});

      res.json({
        code: 200,
        message: 'Query successful',
        data: data
      });
    } catch (error) {
      console.error('Error querying with extension fields:', error);
      res.status(500).json({
        code: 500,
        message: 'Internal server error'
      });
    }
  }

  // 获取所有扩展字段的键
  async getExtFieldKeys(req, res) {
    try {
      const { collection } = req.query;

      if (!collection) {
        return res.status(400).json({
          code: 400,
          message: 'Collection is required'
        });
      }

      // 查询所有数据
      const data = await db.read(collection, {});

      // 收集所有扩展字段的键
      const extFieldKeys = new Set();
      data.forEach(item => {
        if (item.ext_fields) {
          Object.keys(item.ext_fields).forEach(key => {
            extFieldKeys.add(key);
          });
        }
      });

      res.json({
        code: 200,
        message: 'Get extension field keys successful',
        data: Array.from(extFieldKeys)
      });
    } catch (error) {
      console.error('Error getting extension field keys:', error);
      res.status(500).json({
        code: 500,
        message: 'Internal server error'
      });
    }
  }
}

module.exports = new ExtFieldController();
