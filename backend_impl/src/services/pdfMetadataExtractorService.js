const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');

const DEFAULT_TIMEOUT_MS = 600000;
const DEFAULT_PROVIDER_TIMEOUT_SECONDS = 300;
const MAX_PROCESS_OUTPUT_BYTES = 1024 * 1024;

function extractorError(message, code = 'PDF_METADATA_EXTRACTION_FAILED') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function parsePositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function runExtractor({
  command,
  scriptPath,
  pdfPath,
  timeoutMs,
  providerTimeoutSeconds,
}) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      command,
      [scriptPath, pdfPath, '--timeout', String(providerTimeoutSeconds)],
      {
        env: process.env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer;

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };

    const appendOutput = (current, chunk) => {
      const next = current + chunk.toString('utf8');
      if (Buffer.byteLength(next, 'utf8') > MAX_PROCESS_OUTPUT_BYTES) {
        child.kill();
        throw extractorError('元数据提取器输出过大');
      }
      return next;
    };

    child.stdout.on('data', (chunk) => {
      try {
        stdout = appendOutput(stdout, chunk);
      } catch (error) {
        finish(() => reject(error));
      }
    });

    child.stderr.on('data', (chunk) => {
      try {
        stderr = appendOutput(stderr, chunk);
      } catch (error) {
        finish(() => reject(error));
      }
    });

    child.once('error', (error) => {
      finish(() => reject(extractorError(`无法启动元数据提取器: ${error.message}`, 'PDF_METADATA_START_FAILED')));
    });

    child.once('close', (exitCode) => {
      finish(() => {
        let payload;
        try {
          payload = JSON.parse(stdout.trim());
        } catch {
          reject(extractorError(stderr.trim() || '元数据提取器未返回有效 JSON'));
          return;
        }

        if (exitCode !== 0 || payload?.success !== true) {
          reject(extractorError(
            payload?.error?.message || stderr.trim() || `元数据提取器退出码: ${exitCode}`,
          ));
          return;
        }

        resolve(payload);
      });
    });

    timer = setTimeout(() => {
      child.kill();
      finish(() => reject(extractorError('元数据提取超时', 'PDF_METADATA_TIMEOUT')));
    }, timeoutMs);
  });
}

async function extractPdfMetadata({
  pdfStream,
  filename = 'document.pdf',
  command = process.env.PYTHON_CMD || 'python',
  scriptPath = process.env.PDF_METADATA_SCRIPT_PATH
    || path.join(__dirname, '../../python/pdf_metadata/single_pdf_metadata.py'),
  timeoutMs = parsePositiveNumber(process.env.PDF_METADATA_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
  providerTimeoutSeconds = parsePositiveNumber(
    process.env.PDF_METADATA_PROVIDER_TIMEOUT_SECONDS,
    DEFAULT_PROVIDER_TIMEOUT_SECONDS,
  ),
}) {
  if (!pdfStream || typeof pdfStream.pipe !== 'function') {
    throw extractorError('缺少可读取的 PDF 数据流');
  }

  const resolvedScriptPath = path.resolve(scriptPath);
  if (!fs.existsSync(resolvedScriptPath)) {
    pdfStream.destroy?.();
    throw extractorError(
      `未找到 PDF 元数据提取脚本: ${resolvedScriptPath}`,
      'PDF_METADATA_NOT_CONFIGURED',
    );
  }

  const temporaryDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'asc-pdf-metadata-'));
  const temporaryPdfPath = path.join(temporaryDirectory, 'document.pdf');

  try {
    await pipeline(pdfStream, fs.createWriteStream(temporaryPdfPath));
    return await runExtractor({
      command,
      scriptPath: resolvedScriptPath,
      pdfPath: temporaryPdfPath,
      timeoutMs,
      providerTimeoutSeconds,
    });
  } finally {
    await fs.promises.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

module.exports = {
  extractPdfMetadata,
};
