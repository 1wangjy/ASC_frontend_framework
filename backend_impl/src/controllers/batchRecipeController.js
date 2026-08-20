const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const database = require('../config/database');
const idGenerator = require('../utils/idGenerator');

const PRIVATE_DATA_DIR = path.resolve(__dirname, '../../private_data');
const PARSE_SCRIPT = path.resolve(__dirname, '../../python/parse_recipe.py');

class BatchRecipeController {

  /**
   * 调用 parse_recipe.py 解析单个 txt 文件
   * 返回 JSON 格式的解析结果
   */
  parseTxtFile(filePath) {
    return new Promise((resolve, reject) => {
      const pythonCmd = process.env.PYTHON_CMD || 'python3';
      const tempScript = `
import sys, json
sys.path.insert(0, '${path.dirname(PARSE_SCRIPT)}')
from parse_recipe import RecipeParser

parser = RecipeParser()
filepath = sys.argv[1]
recipe = parser.parse_file(filepath)

result = {
  "batch_id": recipe.batch_id,
  "batch_file": recipe.batch_file,
  "materials": [
    {"name": m.name, "size_range": str(m.size_range) if m.size_range else None, "content": m.content, "raw_line": m.raw_line}
    for m in recipe.materials
  ],
  "properties": [
    {"name": p.name, "condition": p.condition, "value": p.value, "original_name": p.original_name}
    for p in recipe.properties
  ],
  "water_addition": {"content": recipe.water_addition.content} if recipe.water_addition else None,
  "glue_addition": {"content": recipe.glue_addition.content} if recipe.glue_addition else None,
  "remarks": recipe.remarks
}
print(json.dumps(result, ensure_ascii=False))
`;
      const proc = spawn(pythonCmd, ['-c', tempScript, filePath]);
      let stdout = '', stderr = '';
      proc.stdout.on('data', d => stdout += d.toString());
      proc.stderr.on('data', d => stderr += d.toString());
      proc.on('close', code => {
        if (code !== 0) return reject(new Error(`Python failed (${code}): ${stderr}`));
        try { resolve(JSON.parse(stdout.trim())); }
        catch (e) { reject(new Error(`JSON parse error: ${stdout.slice(0, 200)}`)); }
      });
    });
  }

  /**
   * 将单个解析结果写入数据库
   * 创建 mr_formula 记录 + tp_test_properties 记录
   */
  async saveToDb(parsed) {
    const now = new Date().toISOString();

    // 构建 component_list: [["名称","MC_ID","{}",百分比], ...]
    const componentList = parsed.materials.map(m => [
      m.name, '', '{}', m.content
    ]);

    // 生成 MR ID
    const mrId = idGenerator.generateMrId();
    const fileName = parsed.batch_file.replace('.txt', '');
    const formulaName = `配方-${fileName}`;

    // 插入 mr_formula
    await database.execute(
      `INSERT OR IGNORE INTO mr_formula
        (mr_id, formula_name, formula_type, batch_no, component_list, tp_ids, fe_ids, ru_ids, creator, create_time, update_time, is_delete)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        mrId, formulaName, '烧成带配方',
        parsed.batch_id,
        JSON.stringify(componentList), '[]', '[]', '[]',
        'batch-import', now, now, 0
      ]
    );

    // 处理测试数据 → tp_test_properties
    let tpId = null;
    if (parsed.properties && parsed.properties.length > 0) {
      tpId = idGenerator.generateTpId();
      const customResults = parsed.properties.map(p => ({
        name: p.original_name || p.name,
        value: p.value,
        unit: p.condition || ''
      }));

      await database.execute(
        `INSERT INTO tp_test_properties
          (tp_id, mp_id, test_params, test_results, mr_ids, test_condition, create_time, update_time, is_delete)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tpId, '',
          JSON.stringify({}),
          JSON.stringify({ fixed: [], custom: customResults }),
          JSON.stringify([mrId]),
          `Batch${parsed.batch_id}`,
          now, now, 0
        ]
      );

      // 更新 mr_formula 的 tp_ids
      await database.execute(
        'UPDATE mr_formula SET tp_ids = ?, update_time = ? WHERE mr_id = ?',
        [JSON.stringify([tpId]), now, mrId]
      );
    }

    return { mrId, tpId, fileName };
  }

  /**
   * HTTP API: 批量导入所有 txt 文件
   */
  async importBatch(req, res) {
    const results = { total: 0, success: 0, failed: 0, errors: [] };

    try {
      const files = fs.readdirSync(PRIVATE_DATA_DIR)
        .filter(f => f.startsWith('batch') && f.endsWith('.txt') && !f.includes('tmp'))
        .map(f => path.join(PRIVATE_DATA_DIR, f))
        .sort();

      results.total = files.length;
      console.log(`[batch-import] Found ${files.length} txt files in private_data/`);

      for (let i = 0; i < files.length; i++) {
        const filePath = files[i];
        const fileName = path.basename(filePath);

        try {
          // 检查是否已导入（按 formula_name 去重）
          const existing = await database.query(
            "SELECT mr_id FROM mr_formula WHERE formula_name = ? AND is_delete = 0",
            [`配方-${fileName.replace('.txt', '')}`]
          );
          if (existing.length > 0) {
            results.success++;
            continue;
          }

          const parsed = await this.parseTxtFile(filePath);
          await this.saveToDb(parsed);
          results.success++;

          if ((i + 1) % 20 === 0 || i === files.length - 1) {
            console.log(`[batch-import] Progress: ${i + 1}/${files.length} (${results.success} success, ${results.failed} failed)`);
          }
        } catch (err) {
          results.failed++;
          results.errors.push({ file: fileName, error: err.message });
          console.error(`[batch-import] FAIL ${fileName}: ${err.message}`);
        }
      }

      const message = `导入完成: ${results.success}/${results.total} 成功` +
        (results.failed > 0 ? `, ${results.failed} 失败` : '');

      res.json({ code: 200, message, data: results });

    } catch (error) {
      console.error('[batch-import] Fatal error:', error);
      res.status(500).json({ code: 500, message: '批量导入失败', error: error.message });
    }
  }

  /**
   * CLI 模式：不带 req/res，直接执行并打印结果
   */
  async runCli() {
    console.log('='.repeat(60));
    console.log('ASC Platform - 批量配方导入');
    console.log('='.repeat(60));

    const results = { total: 0, success: 0, failed: 0, errors: [] };

    try {
      const files = fs.readdirSync(PRIVATE_DATA_DIR)
        .filter(f => f.startsWith('batch') && f.endsWith('.txt') && !f.includes('tmp'))
        .map(f => path.join(PRIVATE_DATA_DIR, f))
        .sort();

      results.total = files.length;
      console.log(`\nFound ${files.length} txt files in private_data/\n`);

      for (let i = 0; i < files.length; i++) {
        const filePath = files[i];
        const fileName = path.basename(filePath);

        try {
          const existing = await database.query(
            "SELECT mr_id FROM mr_formula WHERE formula_name = ? AND is_delete = 0",
            [`配方-${fileName.replace('.txt', '')}`]
          );
          if (existing.length > 0) {
            results.success++;
            continue;
          }

          const parsed = await this.parseTxtFile(filePath);
          await this.saveToDb(parsed);
          results.success++;

          if ((i + 1) % 20 === 0 || i === files.length - 1) {
            console.log(`  Progress: ${i + 1}/${files.length} (${results.success} success, ${results.failed} failed)`);
          }
        } catch (err) {
          results.failed++;
          results.errors.push({ file: fileName, error: err.message });
          console.error(`  FAIL ${fileName}: ${err.message}`);
        }
      }

      console.log('\n' + '='.repeat(60));
      console.log(`导入完成: ${results.success}/${results.total} 成功, ${results.failed} 失败`);
      if (results.errors.length > 0) {
        console.log(`\n失败文件 (${results.errors.length}):`);
        results.errors.slice(0, 10).forEach(e => console.log(`  - ${e.file}: ${e.error}`));
        if (results.errors.length > 10) console.log(`  ... 还有 ${results.errors.length - 10} 个`);
      }
      console.log('='.repeat(60));

    } catch (error) {
      console.error('Fatal error:', error);
      process.exit(1);
    } finally {
      database.close();
    }
  }
}

module.exports = new BatchRecipeController();
