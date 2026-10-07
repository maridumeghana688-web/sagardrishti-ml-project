"""Local OpenCode workflow for the SAGARDRISHTI Kaggle pipeline.

Commands (secrets ALWAYS from environment — never printed, never committed):
  verify   authenticate + print safe status only
  push     create/update the pipeline notebook on Kaggle (code only, no data)
  run      push, then poll execution status
  status   poll execution status of the pushed kernel
  fetch    download kernel output; extract ONLY small reports (*.json/*.md/*.html),
           list large artifacts by name+size (large data stays in Kaggle)

Requires KAGGLE_USERNAME + KAGGLE_KEY in the environment (loaded from .env).
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
import zipfile

NOTEBOOK_SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                            "notebooks", "sagardrishti_india_pipeline.ipynb")
SLUG = "sagardrishti-india-data-pipeline"  # actual Kaggle slug (derived from title on push)
# Private credential dataset attached as kernel input (owner resolved at push).
SECRETS_DATASET_SLUG = "sagardrishti-private-secrets"


def _load_dotenv():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(root, ".env")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())


def _api():
    from kaggle.api.kaggle_api_extended import KaggleApi
    api = KaggleApi()
    api.authenticate()
    return api


def cmd_verify(_args):
    api = _api()
    print("Kaggle authentication: SUCCESS")
    print("Kaggle username:", api.config_values.get("username"))
    return 0


def _kernel_id(api):
    return f"{api.config_values.get('username')}/{SLUG}"


def cmd_push(_args):
    api = _api()
    if not os.path.exists(NOTEBOOK_SRC):
        print("ERROR: notebook not found:", NOTEBOOK_SRC)
        return 2
    workdir = tempfile.mkdtemp(prefix="kaggle_push_")
    import shutil
    nb_name = "sagardrishti-india-pipeline.ipynb"
    shutil.copyfile(NOTEBOOK_SRC, os.path.join(workdir, nb_name))
    meta = {
        "id": _kernel_id(api),
        "title": "SAGARDRISHTI India data pipeline",
        "code_file": nb_name,
        "language": "python",
        "kernel_type": "notebook",
        "is_private": "false",
        "enable_gpu": "false",
        "enable_tpu": "false",
        "enable_internet": "true",
        "dataset_sources": [
            f"{api.config_values.get('username')}/{SECRETS_DATASET_SLUG}"
        ],
        "competition_sources": [],
        "kernel_sources": [],
        "model_sources": [],
    }
    with open(os.path.join(workdir, "kernel-metadata.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    # Prefer the API; fall back to the CLI (same credentials, nothing printed).
    pushed = False
    if hasattr(api, "kernels_push"):
        try:
            api.kernels_push(workdir)
            pushed = True
        except Exception as exc:  # noqa: BLE001 — fall back to CLI
            print("API push failed, falling back to CLI:", str(exc)[:200])
    if not pushed:
        env = dict(os.environ)
        r = subprocess.run(["kaggle", "kernels", "push", "-p", workdir],
                           capture_output=True, text=True, env=env)
        print((r.stdout or "")[-1500:])
        if r.returncode != 0:
            print("STDERR:", (r.stderr or "")[-1500:])
            return r.returncode
    print("Pushed kernel:", _kernel_id(api))
    print("URL: https://www.kaggle.com/code/" + _kernel_id(api).replace("/", "/"))
    return 0


def _poll_status(api, kernel, timeout_s=1800, interval_s=30):
    import datetime
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            st = api.kernels_status(kernel)
            state = str(st.get("status", st)) if isinstance(st, dict) else str(st)
        except Exception as exc:  # noqa: BLE001
            state = f"status-query failed: {exc}"
        print(f"[{datetime.datetime.now(datetime.timezone.utc):%H:%M:%SZ}] status: {state}")
        low = state.lower()
        if "complete" in low and "incomplete" not in low:
            return 0
        if any(k in low for k in ("error", "failed", "cancelled")):
            return 3
        time.sleep(interval_s)
    print("Timed out waiting; re-run `status` later.")
    return 4


def cmd_run(args):
    api = _api()
    rc = cmd_push(args)
    if rc != 0:
        return rc
    print("NOTE: execution requires Kaggle Secrets (GFW_API_TOKEN, "
          "COPERNICUS_USERNAME, COPERNICUS_PASSWORD); stages STOP cleanly without them.")
    return _poll_status(api, _kernel_id(api), timeout_s=args.timeout, interval_s=30)


def cmd_status(args):
    api = _api()
    return _poll_status(api, _kernel_id(api), timeout_s=args.timeout, interval_s=20)


def cmd_fetch(args):
    api = _api()
    out_zip = os.path.join(args.out, "kaggle_output.zip")
    os.makedirs(args.out, exist_ok=True)
    kernel = _kernel_id(api)
    if hasattr(api, "kernels_output"):
        api.kernels_output(kernel, args.out)
    else:
        env = dict(os.environ)
        r = subprocess.run(["kaggle", "kernels", "output", kernel, "-p", args.out],
                           capture_output=True, text=True, env=env)
        print((r.stdout or "")[-1000:])
        if r.returncode != 0:
            print("STDERR:", (r.stderr or "")[-1000:])
            return r.returncode
    if os.path.exists(out_zip):
        with zipfile.ZipFile(out_zip) as z:
            for info in z.infolist():
                print(f"artifact: {info.filename}  ({info.file_size/1e6:.1f} MB)")
                if info.filename.endswith((".json", ".md", ".html")) and info.file_size < 20_000_000:
                    z.extract(info, args.out)
                    print("  extracted report:", info.filename)
    print("Large data artifacts remain in Kaggle by design.")
    return 0


def main(argv=None):
    _load_dotenv()
    ap = argparse.ArgumentParser(description="SAGARDRISHTI Kaggle pipeline automation")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("verify")
    sub.add_parser("push")
    p = sub.add_parser("run")
    p.add_argument("--timeout", type=int, default=1800)
    p = sub.add_parser("status")
    p.add_argument("--timeout", type=int, default=600)
    p = sub.add_parser("fetch")
    p.add_argument("--out", default="data/kaggle_output")
    args = ap.parse_args(argv)
    return {"verify": cmd_verify, "push": cmd_push, "run": cmd_run,
            "status": cmd_status, "fetch": cmd_fetch}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
