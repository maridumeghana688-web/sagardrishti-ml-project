"""Preflight report assembly. Live probes run separately; this module records
their outcomes (with method + timestamp) and renders reports/preflight_report.json/.html.
Secrets never appear here — only PASS/FAIL and non-sensitive metadata.
"""
import json
import os

REPORT_FIELDS = ["kaggle", "gfw", "noaa", "copernicus", "wpi", "storage"]


def write_reports(results: dict, out_dir: str) -> dict:
    os.makedirs(out_dir, exist_ok=True)
    payload = {"preflight": results}
    paths = {}
    jp = os.path.join(out_dir, "preflight_report.json")
    with open(jp, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    paths["json"] = jp
    rows = []
    for section in REPORT_FIELDS:
        sec = results.get(section, {})
        status = str(sec.get("status", "UNKNOWN"))
        color = {"PASS": "#2E7D5B", "FAIL": "#C0392B", "CONDITIONAL": "#B26A24",
                 "PRESENT": "#2E7D5B", "MISSING": "#B26A24"}.get(status, "#555")
        detail = "".join(f"<br><b>{k}:</b> {v}" for k, v in sec.items() if k != "status")
        rows.append(f"<tr><td>{section}</td><td style='color:{color};font-weight:bold'>{status}</td>"
                    f"<td style='font-size:13px'>{detail}</td></tr>")
    html = ("<html><head><meta charset='utf-8'><title>SAGARDRISHTI preflight report</title>"
            "<style>body{font-family:sans-serif;margin:2rem}table{border-collapse:collapse}"
            "td,th{border:1px solid #ccc;padding:6px 10px;vertical-align:top}</style></head><body>"
            "<h1>SAGARDRISHTI — preflight verification (no bulk download)</h1>"
            "<table><tr><th>source</th><th>status</th><th>evidence</th></tr>"
            + "".join(rows) + "</table></body></html>")
    hp = os.path.join(out_dir, "preflight_report.html")
    with open(hp, "w", encoding="utf-8") as f:
        f.write(html)
    paths["html"] = hp
    return paths
