"""接线探针：复现 `recipeParserController.callPythonParser` 的 spawn 契约，
对比「当前路径（backend_impl/python，缺文件）」与「真实路径（_code/python）」的可运行性。

证据用途：/api/recipe-parser/parse 目前必然 500，原因是路径写错，而不是能力缺失。
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
MISSING_DIR = REPO / "backend_impl/python"
REAL_DIR = REPO / "_code/python"

TEMPLATE = """
import sys, json
sys.path.insert(0, r'{dir}')
from recipe_processor import RecipeProcessor
input_data = json.loads(sys.stdin.read())
processor = RecipeProcessor(input_data['materials'])
print(json.dumps(processor.process(input_data['content']), ensure_ascii=False))
"""

SAMPLES = [
    "骨料 棕刚玉 5-3mm 30%\n细粉 97黑碳化硅 325目 20%\n结合剂 CA71水泥 10%\n微粉 95硅灰 40%",
    "骨料，棕刚玉，8-15mm，40%\n*体积密度: 3.05 g/cm3\n*常温耐压: 45 MPa",
]


def probe(directory: Path, content: str):
    script = TEMPLATE.replace("{dir}", str(directory).replace("\\", "/"))
    proc = subprocess.run([sys.executable, "-c", script],
                          input=json.dumps({"content": content, "materials": []}, ensure_ascii=False),
                          capture_output=True, text=True, timeout=120)
    return proc


def main():
    report = {"current_path": str(MISSING_DIR), "real_path": str(REAL_DIR), "cases": []}
    for content in SAMPLES:
        entry = {"content": content}
        proc = probe(MISSING_DIR, content)
        entry["current"] = {"returncode": proc.returncode,
                            "stderr_tail": proc.stderr.strip().splitlines()[-1] if proc.stderr.strip() else "",
                            "stdout": proc.stdout.strip()[:200]}
        proc = probe(REAL_DIR, content)
        entry["fixed"] = {"returncode": proc.returncode,
                          "stderr_tail": proc.stderr.strip().splitlines()[-1] if proc.stderr.strip() else ""}
        if proc.returncode == 0 and proc.stdout.strip():
            try:
                payload = json.loads(proc.stdout.strip().splitlines()[-1])
                entry["fixed"]["keys"] = sorted(payload.keys())
                entry["fixed"]["embedding_shape"] = payload.get("embedding_shape")
                components = payload.get("components") or []
                entry["fixed"]["component_count"] = len(components)
                entry["fixed"]["component_sample"] = components[0] if components else None
                entry["fixed"]["has_particle_size"] = any(
                    any("粒径" in str(key) or "size" in str(key).lower() for key in (item or {}))
                    for item in components
                )
                entry["fixed"]["has_base_id"] = any(
                    any("base" in str(key).lower() or "material_id" in str(key).lower() for key in (item or {}))
                    for item in components
                )
            except json.JSONDecodeError as exc:  # noqa: PERF203
                entry["fixed"]["parse_error"] = str(exc)
        report["cases"].append(entry)

    out = Path(__file__).resolve().parents[1] / "out" / "wiring_probe.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    for entry in report["cases"]:
        print("文本:", entry["content"].replace("\n", " | ")[:70])
        print("  当前路径 rc=%s %s" % (entry["current"]["returncode"], entry["current"]["stderr_tail"][:110]))
        print("  真实路径 rc=%s %s" % (entry["fixed"]["returncode"], entry["fixed"].get("keys", entry["fixed"]["stderr_tail"][:110])))
        if "component_sample" in entry["fixed"]:
            print("  组件样例:", json.dumps(entry["fixed"]["component_sample"], ensure_ascii=False)[:220])
            print("  含粒径字段:", entry["fixed"]["has_particle_size"], "| 含 base/material_id:", entry["fixed"]["has_base_id"],
                  "| embedding_shape:", entry["fixed"]["embedding_shape"])
    print(f"-> {out}")


if __name__ == "__main__":
    main()
