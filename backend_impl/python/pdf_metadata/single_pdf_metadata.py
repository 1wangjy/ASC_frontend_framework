#!/usr/bin/env python3
"""Extract form-ready metadata from one PDF and emit exactly one JSON result.

This is the small integration entry point intended for a parent process such as
the Node 3001 backend. It reuses the existing Mistral OCR, page-selection and
evidence-validation logic without creating CSV, raw-response or batch files.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
from pathlib import Path
import sys
from typing import Any, Sequence

import httpx
from pypdf import PdfReader

from batch_mistral_metadata import (
    DEFAULT_METADATA_PAGES,
    average_page_confidence,
    build_review_notes,
    metadata_page_count,
    pdf_subset_bytes,
    remap_evidence_pages,
    source_page_indexes,
)
from mistral_document_ai_experiment import (
    build_field_evidence,
    correct_cover_title,
    drop_unverified_optional_claims,
    load_env_file,
    markdown_with_inline_tables,
    normalize_metadata,
    parse_annotation,
    process_ocr,
)


DEFAULT_ENV_FILE = Path(__file__).resolve().with_name(".env")
DEFAULT_MODEL = "mistral-ocr-latest"
DEFAULT_TIMEOUT_SECONDS = 300.0

ENTRY_TYPE_MAP = {
    "journal_article": "journal",
    "conference_paper": "conference",
    "patent": "patent",
    "book": "book",
}


def positive_float(value: str) -> float:
    parsed = float(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be greater than zero")
    return parsed


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Extract literature metadata from one PDF with Mistral Document AI "
            "and write one UTF-8 JSON object to stdout."
        )
    )
    parser.add_argument("pdf", type=Path, help="Path to one PDF file.")
    parser.add_argument(
        "--metadata-pages",
        type=metadata_page_count,
        default=DEFAULT_METADATA_PAGES,
        help="Maximum selected metadata pages (1-8, default: 8).",
    )
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument(
        "--timeout",
        type=positive_float,
        default=DEFAULT_TIMEOUT_SECONDS,
        help="Mistral request timeout in seconds (default: 300).",
    )
    parser.add_argument(
        "--env-file",
        type=Path,
        default=DEFAULT_ENV_FILE,
        help=(
            "Optional file containing MISTRAL_API_KEY. An existing environment "
            "variable takes precedence."
        ),
    )
    return parser.parse_args(argv)


def to_entry_type(document_type: str | None) -> str | None:
    """Map the extractor vocabulary to the current 3001 literature contract."""
    return ENTRY_TYPE_MAP.get(str(document_type or "").strip())


def to_literature_payload(form: dict[str, Any]) -> dict[str, Any]:
    """Return only fields currently accepted by the 3001 literature table."""
    authors = form.get("authors") or []
    return {
        "title": form.get("title"),
        "authors": ", ".join(str(author).strip() for author in authors if str(author).strip()),
        "journal": form.get("venue_or_publisher"),
        "year": form.get("year"),
        "pages": form.get("pages"),
        "doi": form.get("doi"),
        "abstract": form.get("abstract"),
        "note": form.get("note"),
        # Unknown is intentionally null so the caller does not overwrite a user
        # selection with an unsupported SQLite entry_type value.
        "entry_type": to_entry_type(form.get("document_type")),
    }


def extract_single_pdf(
    pdf_path: Path,
    *,
    api_key: str,
    model: str = DEFAULT_MODEL,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
    metadata_pages: int = DEFAULT_METADATA_PAGES,
) -> dict[str, Any]:
    """Extract one PDF without writing any derived files to disk."""
    pdf_path = pdf_path.expanduser().resolve()
    if not pdf_path.is_file():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")
    if pdf_path.suffix.lower() != ".pdf":
        raise ValueError(f"Not a PDF file: {pdf_path}")
    if not api_key:
        raise ValueError("MISTRAL_API_KEY is not set")
    if not 1 <= int(metadata_pages) <= 8:
        raise ValueError("metadata_pages must be between 1 and 8")
    if float(timeout) <= 0:
        raise ValueError("timeout must be greater than zero")

    reader = PdfReader(pdf_path)
    total_pages = len(reader.pages)
    if total_pages == 0:
        raise ValueError("PDF has no pages")

    selected_source_indexes = source_page_indexes(reader, int(metadata_pages))
    selected_pdf = pdf_subset_bytes(reader, selected_source_indexes)
    data_url = "data:application/pdf;base64," + base64.b64encode(selected_pdf).decode(
        "ascii"
    )

    with httpx.Client(
        headers={"Authorization": f"Bearer {api_key}"}, timeout=float(timeout)
    ) as client:
        response = process_ocr(
            client,
            model=model,
            pdf_data_url=data_url,
            page_indexes=list(range(len(selected_source_indexes))),
            extract_metadata=True,
        )

    response_pages = response.get("pages") or []
    if len(response_pages) != len(selected_source_indexes):
        raise RuntimeError(
            f"Expected {len(selected_source_indexes)} OCR pages, "
            f"got {len(response_pages)}"
        )
    if "document_annotation" not in response:
        raise RuntimeError("Mistral response did not include document_annotation")

    page_markdown = {
        index: markdown_with_inline_tables(page).strip()
        for index, page in enumerate(response_pages)
    }
    annotation = parse_annotation(response["document_annotation"])
    form, abstract_pages = normalize_metadata(
        annotation,
        page_markdown,
        metadata_page_count=len(selected_source_indexes),
    )

    evidence = build_field_evidence(form, page_markdown, abstract_pages)
    evidence_adjustments = drop_unverified_optional_claims(form, evidence)
    if evidence_adjustments:
        evidence = build_field_evidence(form, page_markdown, abstract_pages)

    corrections = correct_cover_title(
        page_markdown,
        form.get("title"),
        evidence["title"]["pages"],
    )
    if corrections:
        evidence = build_field_evidence(form, page_markdown, abstract_pages)

    evidence = remap_evidence_pages(evidence, selected_source_indexes)
    review_notes = build_review_notes(form, evidence)

    return {
        "success": True,
        "metadata": to_literature_payload(form),
        "source": {
            "file": pdf_path.name,
            "total_pages": total_pages,
            "metadata_pages_processed": len(selected_source_indexes),
            "metadata_source_pages": [index + 1 for index in selected_source_indexes],
            "model": model,
        },
        "review": {
            "status": "verified" if not review_notes else "review_needed",
            "notes": review_notes,
            "source_document_type": form.get("document_type"),
            "average_page_confidence": average_page_confidence(response_pages),
            "field_evidence": evidence,
            "evidence_adjustments": evidence_adjustments,
            "corrections": corrections,
        },
    }


def emit_json(value: dict[str, Any]) -> None:
    """Write UTF-8 directly so Windows console code pages cannot corrupt JSON."""
    payload = json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n"
    sys.stdout.buffer.write(payload.encode("utf-8"))
    sys.stdout.buffer.flush()


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    load_env_file(args.env_file)
    api_key = os.environ.get("MISTRAL_API_KEY", "").strip()

    try:
        result = extract_single_pdf(
            args.pdf,
            api_key=api_key,
            model=args.model,
            timeout=args.timeout,
            metadata_pages=args.metadata_pages,
        )
    except Exception as exc:
        emit_json(
            {
                "success": False,
                "error": {
                    "type": type(exc).__name__,
                    "message": str(exc),
                },
            }
        )
        print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
        return 1

    emit_json(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
