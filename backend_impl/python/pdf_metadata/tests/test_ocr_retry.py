from __future__ import annotations

import unittest
from unittest.mock import patch

from mistral_document_ai_experiment import process_ocr


class FakeResponse:
    def __init__(self, status_code, payload=None, retry_after=None):
        self.status_code = status_code
        self._payload = payload or {}
        self.headers = {}
        if retry_after is not None:
            self.headers["retry-after"] = retry_after

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self._payload


class FakeClient:
    def __init__(self, responses):
        self.responses = iter(responses)

    def post(self, *_args, **_kwargs):
        return next(self.responses)


class OcrRetryTests(unittest.TestCase):
    def test_respects_provider_retry_after_longer_than_thirty_seconds(self):
        client = FakeClient([
            FakeResponse(429, retry_after="60"),
            FakeResponse(200, payload={"pages": []}),
        ])

        with patch("mistral_document_ai_experiment.time.sleep") as sleep:
            result = process_ocr(
                client,
                model="mistral-ocr-latest",
                pdf_data_url="data:application/pdf;base64,JVBERi0=",
                page_indexes=[0],
                extract_metadata=True,
            )

        sleep.assert_called_once_with(60.0)
        self.assertEqual(result, {"pages": []})


if __name__ == "__main__":
    unittest.main()
