# Single-PDF metadata extractor

This directory contains the portable, single-file integration extracted from
`pdf-academic-extractor-main`. It is called only by the Node 3001 backend after
a PDF has been stored successfully in GridFS.

Runtime dependencies are listed in `requirements.txt`. Configure
`MISTRAL_API_KEY` and `PYTHON_CMD` in `backend_impl/.env`. The wrapper writes one
JSON object to stdout and does not create batch CSV, OCR dumps, or result files.

The imported implementation keeps its original MIT license in `LICENSE`.
