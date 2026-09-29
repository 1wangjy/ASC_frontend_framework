/**
 * 变体 one-hot 词表服务：把每个模型变体的 `material_id__<id>_frac` 取值落到 material_vocab，
 * 并给出「给定原料集合在某变体下的覆盖率」报告（未覆盖 = one-hot 全 0）。
 *
 * 词表只能由 Python 侧解包 joblib 得到（scripts/dump_vocab.py，需模型 venv），
 * 因此 refresh 走一次子进程；日常查询走 sqlite。
 */
const { execFile } = require('child_process');
const path = require('path');
const svc = require('./materialBaseService');

const REPO = path.resolve(__dirname, '../../..');
const DUMP_SCRIPT = path.join(REPO, 'backend_impl/scripts/dump_vocab.py');
const VENV_PYTHON = process.env.MODEL_VENV_PYTHON
  || path.join(REPO, 'backend_impl/python/model_predict/.venv/bin/python');

function all(handle, sql, params = []) {
  return new Promise((resolve, reject) => handle.all(sql, params, (e, rows) => (e ? reject(e) : resolve(rows || []))));
}
function run(handle, sql, params = []) {
  return new Promise((resolve, reject) => handle.run(sql, params, (e) => (e ? reject(e) : resolve())));
}

/** 调 Python 解出各变体的 one-hot 词表。 */
function dumpVocab(only) {
  return new Promise((resolve, reject) => {
    execFile(VENV_PYTHON, [DUMP_SCRIPT, ...(only ? [only] : [])], { maxBuffer: 32 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) return reject(new Error(`dump_vocab failed: ${stderr || error.message}`));
        try {
          resolve(JSON.parse(stdout).variants || {});
        } catch (parseError) {
          reject(new Error(`dump_vocab returned non-JSON: ${parseError.message}`));
        }
      });
  });
}

/** 刷新 material_vocab（按 variant 覆盖写入）。 */
async function refreshVocab({ variants } = {}) {
  const handle = await svc.ensureReady();
  // 脚本一次只接受一个变体参数；多变体时整体 dump 再过滤（脚本内部 10s 左右）
  const single = variants && variants.length === 1 ? variants[0] : undefined;
  const dumped = await dumpVocab(single);
  const selected = variants && variants.length ? Object.fromEntries(Object.entries(dumped).filter(([v]) => variants.includes(v))) : dumped;
  let written = 0;
  for (const [variant, ids] of Object.entries(selected)) {
    await run(handle, 'DELETE FROM material_vocab WHERE variant = ?', [variant]);
    for (const id of ids) {
      await run(handle, 'INSERT OR REPLACE INTO material_vocab (variant, material_id, updated_at) VALUES (?,?,CURRENT_TIMESTAMP)', [variant, String(id)]);
      written += 1;
    }
  }
  return { variants: Object.keys(selected), written };
}

async function listVocab() {
  const handle = await svc.ensureReady();
  const rows = await all(handle, 'SELECT variant, COUNT(*) AS n FROM material_vocab GROUP BY variant ORDER BY n DESC, variant');
  return rows.map((r) => ({ variant: r.variant, size: Number(r.n) }));
}

async function vocabIds(variant) {
  const handle = await svc.ensureReady();
  const rows = await all(handle, 'SELECT material_id FROM material_vocab WHERE variant = ?', [variant]);
  return rows.map((r) => String(r.material_id));
}

/** 给定 material_id 集合在某变体下的覆盖情况。 */
async function coverageFor(variant, materialIds = []) {
  const ids = [...new Set(materialIds.filter((v) => v !== null && v !== undefined && String(v) !== '').map(String))];
  const vocab = new Set(await vocabIds(variant));
  const known = ids.filter((id) => vocab.has(id));
  const unknown = ids.filter((id) => !vocab.has(id));
  return {
    variant,
    vocabSize: vocab.size,
    total: ids.length,
    known,
    unknown,
    hitRate: ids.length ? Number((known.length / ids.length).toFixed(4)) : null,
  };
}

/**
 * 覆盖报告：给出所选变体的覆盖情况，并在其它变体覆盖更好时给出建议。
 * @returns {{variant: string, coverage: object, perVariant: object[], recommendedVariant: string|null}}
 */
async function coverageReport({ variant, materialIds = [] } = {}) {
  const variants = (await listVocab()).map((v) => v.variant);
  if (!variants.length) return { variant: variant || null, coverage: null, perVariant: [], recommendedVariant: null, vocabMissing: true };
  const target = variant && variants.includes(variant) ? variant : variants[0];
  const perVariant = [];
  for (const v of variants) perVariant.push(await coverageFor(v, materialIds));
  perVariant.sort((a, b) => (b.hitRate ?? -1) - (a.hitRate ?? -1) || b.vocabSize - a.vocabSize);
  const coverage = perVariant.find((c) => c.variant === target) || perVariant[0];
  const best = perVariant[0];
  const recommendedVariant = best && coverage && (best.unknown.length < coverage.unknown.length) ? best.variant : null;
  return { variant: coverage.variant, coverage, perVariant, recommendedVariant, vocabMissing: false };
}

module.exports = { refreshVocab, listVocab, vocabIds, coverageFor, coverageReport, DUMP_SCRIPT, VENV_PYTHON };
