from __future__ import annotations

import sys
from pathlib import Path

from docx import Document
from docx.enum.text import WD_UNDERLINE


NBSP = "\u202f"  # narrow no-break space: compact padding without line breaks


def main(source: Path, destination: Path) -> None:
    document = Document(source)
    paragraph = next(
        p for p in document.paragraphs if "兹证明" in p.text and "实习期限" in p.text
    )

    # The original used visible underscore glyphs with underline formatting.
    # Replace the glyphs with non-breaking spaces so every field becomes one
    # continuous line, while retaining the document's original fonts/layout.
    for run in paragraph.runs:
        if run.underline and run.text and set(run.text) == {"_"}:
            run.text = NBSP * len(run.text)
            run.underline = WD_UNDERLINE.SINGLE

    # A closing parenthesis was accidentally included in an underlined run.
    for run in paragraph.runs:
        if run.text == "）":
            run.underline = False

    # Give every filled field balanced line space on both sides. Existing
    # underlined spacer runs count as padding; isolated fields receive padding
    # directly so their text is visually centered on the line.
    runs = paragraph.runs
    for index, run in enumerate(runs):
        if not run.underline or not run.text.strip(NBSP):
            continue

        previous_is_underlined = index > 0 and bool(runs[index - 1].underline)
        next_is_underlined = index + 1 < len(runs) and bool(runs[index + 1].underline)

        if not previous_is_underlined:
            run.text = NBSP + run.text
        if not next_is_underlined:
            run.text = run.text + NBSP
        run.underline = WD_UNDERLINE.SINGLE

    destination.parent.mkdir(parents=True, exist_ok=True)
    document.save(destination)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: normalize_underlined_fields.py SOURCE.docx OUTPUT.docx")
    main(Path(sys.argv[1]), Path(sys.argv[2]))
