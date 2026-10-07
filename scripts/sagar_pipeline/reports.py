"""Report writers: quality JSON/HTML, data dictionary, source manifest."""
import json
import os


def _dump(path, obj):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, default=str)
    return path


def write_quality_report(qc: dict, dest: str, html: bool = False) -> str:
    if not html:
        return _dump(dest, qc)
    rows = []
    for name, res in qc.get("tables", {}).items():
        for c in res.get("checks", []):
            color = {"PASS": "#2E7D5B", "FAIL": "#C0392B", "WARN": "#B26A24"}.get(c["status"], "#555")
            rows.append(
                f"<tr><td>{name}</td><td>{c['check']}</td>"
                f"<td style='color:{color};font-weight:bold'>{c['status']}</td>"
                f"<td>{c.get('detail','')}</td></tr>"
            )
    doc = ("<html><head><meta charset='utf-8'><title>SAGARDRISHTI data quality report</title>"
           "<style>body{font-family:sans-serif;margin:2rem}table{border-collapse:collapse}"
           "td,th{border:1px solid #ccc;padding:6px 10px;font-size:13px}</style></head><body>"
           "<h1>SAGARDRISHTI — India data quality report</h1>"
           "<table><tr><th>table</th><th>check</th><th>status</th><th>detail</th></tr>"
           + "".join(rows) + "</table></body></html>")
    with open(dest, "w", encoding="utf-8") as f:
        f.write(doc)
    return dest


def write_data_dictionary(ml: dict, dest: str) -> str:
    lines = ["# SAGARDRISHTI India ML datasets — data dictionary", ""]
    for name, spec in ml.get("datasets", {}).items():
        lines += [f"## {name}", "", f"- rows: {spec.get('rows')}", f"- path: `{spec.get('path')}`",
                  f"- provenance: `{spec.get('provenance')}`", ""]
    os.makedirs(os.path.dirname(os.path.abspath(dest)), exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    return dest


def write_manifest(ml: dict, dest: str) -> str:
    manifest = {"datasets": ml.get("datasets", {})}
    return _dump(dest, manifest)
