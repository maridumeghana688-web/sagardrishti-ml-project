"""MapLibre migration + Port Intelligence data-quality tests.

Proves (no network for backend asserts; node for pure JS engine asserts):
- MapLibre GL JS is the renderer; CARTO/Leaflet are gone; no map API key
- OSM-based basemap (OpenFreeMap) with required attribution
- all 7 operational layers + toggles preserved
- 44 WPI ports with backend-consistent intelligence records
- traffic/congestion/GFW values come from real backend data
- NOAA historical, CMEMS monthly, honest empty states
- vessel engine: real heading/COG, bounded interpolation, frozen stale,
  observed-only trails, multi-source provenance, no provider calls from UI
"""
import json
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
ROOT = Path(__file__).resolve().parents[2]
FSRC = ROOT / "frontend" / "src"


def _read_src(rel: str) -> str:
    return (FSRC / rel).read_text(encoding="utf-8")


def _all_frontend_text() -> str:
    return "".join(
        p.read_text(encoding="utf-8", errors="replace")
        for p in FSRC.rglob("*")
        if p.suffix in (".js", ".jsx")
    )


def _node_eval(expr: str) -> object:
    """Evaluate a JS expression with vesselEngine imported (pure ESM, no deps)."""
    engine_url = (FSRC / "map" / "vesselEngine.js").as_uri()
    script = f"import('{engine_url}').then(async (E) => {{ const r = await ({expr}); console.log(JSON.stringify(r)); }})"
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        capture_output=True, text=True, timeout=60,
    )
    assert proc.returncode == 0, f"node failed: {proc.stderr[:300]}"
    return json.loads(proc.stdout.strip().splitlines()[-1])


# ── 1-5: MapLibre renderer, no CARTO, no key ────────────────────────────
def test_maplibre_is_renderer():
    pkg = json.loads((ROOT / "frontend" / "package.json").read_text())
    assert "maplibre-gl" in pkg["dependencies"]


def test_leaflet_and_react_leaflet_removed():
    pkg = json.loads((ROOT / "frontend" / "package.json").read_text())
    assert "leaflet" not in pkg["dependencies"]
    assert "react-leaflet" not in pkg["dependencies"]
    assert "leaflet" not in _read_src("components/maritime/IndiaMapGL.jsx").lower()


def test_no_carto_dependency_or_key():
    blob = _all_frontend_text()
    assert "cartocdn" not in blob.lower()
    assert "carto.com/attributions" not in blob
    assert "VITE_CARTO_API_KEY" not in blob
    assert "VITE_CARTO_API_KEY" not in (ROOT / ".env.example").read_text()
    html = (ROOT / "frontend" / "index.html").read_text()
    assert "CARTO" not in html


def test_osm_basemap_with_attribution():
    style_src = _read_src("map/mapStyle.js")
    assert "tiles.openfreemap.org" in style_src
    assert "openstreetmap.org/copyright" in style_src
    assert "OpenFreeMap" in style_src
    comp = _read_src("components/maritime/IndiaMapGL.jsx")
    assert "openstreetmap" in comp.lower() or "attributionControl" in comp


def test_no_hardcoded_map_api_key():
    blob = _all_frontend_text()
    for token in ("VITE_OPENWATERS_API_KEY", "VITE_AISSTREAM_API_KEY", "VITE_VESSELAPI_API_KEY"):
        assert token not in blob


# ── 6-7: layers + toggles ───────────────────────────────────────────────
def test_all_operational_layers_and_toggles():
    comp = _read_src("components/maritime/IndiaMapGL.jsx")
    for layer in ("ports", "vessels", "trails", "risk", "density", "associations", "flow"):
        assert f"'{layer}'" in comp or f'"{layer}"' in comp, layer
    for layer_id in ("sd-vessels", "sd-trails", "sd-assocs", "sd-density", "sd-radius"):
        assert layer_id in comp, layer_id


# ── 8-12: 44 ports, backend-consistent intelligence ─────────────────────
def test_44_ports_represented():
    body = client.get("/api/v1/ports").json()
    assert body["count"] == 44
    assert len(body["ports"]) == 44


def test_port_maps_to_dataset_and_prediction_rows():
    """WPI id → daily dataset row → GFW activity → both predictions, 5 ports."""
    import pandas as pd
    master = pd.read_parquet(ROOT / "data" / "ml" / "daily" / "sagardrishti_daily_master_training_final.parquet")
    ports = client.get("/api/v1/ports").json()["ports"]
    for p in [ports[0], ports[10], ports[20], ports[30], ports[43]]:
        pred = client.get(f"/api/v1/predictions/{p['id']}").json()
        assert pred["port"]["id"] == p["id"]
        assert pred["port"]["name"] == p["name"]
        assert isinstance(pred["prediction"]["traffic"], float)
        assert isinstance(pred["prediction"]["congestion"], float)
        rows = master[master["port_id"].astype(int) == int(p["id"])]
        assert len(rows) > 0, f"no daily rows for {p}"
        env = client.get(f"/api/v1/environment/{p['id']}?days=5").json()
        assert env["port_id"] == p["id"] and len(env["points"]) > 0
        ana = client.get(f"/api/v1/analytics/{p['id']}").json()
        assert ana["port_id"] == p["id"] and len(ana["history"]) > 0


def test_all_44_ports_have_predictions():
    ports = client.get("/api/v1/ports").json()["ports"]
    missing = []
    for p in ports:
        r = client.get(f"/api/v1/predictions/{p['id']}")
        if r.status_code != 200:
            missing.append(p["id"])
    assert missing == []


def test_traffic_congestion_from_backend_models():
    import pandas as pd
    disk = pd.read_parquet(ROOT / "data" / "predictions" / "daily_predictions.parquet")
    latest = str(disk["target_date"].max())
    body = client.get(f"/api/v1/predictions?date={latest}").json()
    assert body["count"] == 44
    row = disk[(disk["port_id"].astype(int) == int(body["predictions"][0]["port"]["id"]))
               & (disk["target_date"] == latest)]
    assert abs(float(row.iloc[0]["traffic_prediction"]) - body["predictions"][0]["prediction"]["traffic"]) < 1e-9
    assert abs(float(row.iloc[0]["congestion_prediction"]) - body["predictions"][0]["prediction"]["congestion"]) < 1e-9


def test_gfw_activity_from_actual_data():
    import pandas as pd
    master = pd.read_parquet(ROOT / "data" / "ml" / "daily" / "sagardrishti_daily_master_training_final.parquet")
    ports = client.get("/api/v1/ports").json()["ports"]
    p = ports[0]
    disk_val = master[master["port_id"].astype(int) == int(p["id"])].sort_values("date").iloc[-1]
    body = client.get(f"/api/v1/vessel-activity/{p['id']}?days=120").json()
    assert body["port_id"] == p["id"]
    assert body["points"][-1]["presence_hours"] == round(float(disk_val["presence_hours"] or 0), 1)


# ── 13-16: NOAA / CMEMS / honest states / port panel ─────────────────────
def test_noaa_remains_historical():
    body = client.get("/api/v1/sources/status").json()
    assert body["sources"]["noaa"] == "HISTORICAL"
    assert "2023" in body["sources"]["noaa_latest"]
    env_page = _read_src("pages/views/EnvironmentView.jsx")
    assert "HISTORICAL" in env_page


def test_cmems_remains_monthly():
    body = client.get("/api/v1/environment/48840?days=5").json()
    assert "monthly" in body["note"].lower()
    panel = _read_src("components/maritime/PortPanel.jsx")
    assert "CMEMS" in panel and "NOAA" in panel


def test_no_fabricated_environmental_values():
    body = client.get("/api/v1/environment/48840?days=30").json()
    for pt in body["points"]:
        for k in ("sst", "salinity", "current_magnitude"):
            assert pt[k] is None or isinstance(pt[k], (int, float)), (k, pt[k])


def test_port_panel_env_cards_removed_intel_cards_present():
    panel = _read_src("components/maritime/PortPanel.jsx")
    assert "SEA SURFACE TEMP" not in panel
    assert "CURRENT MAGNITUDE" not in panel
    assert "SALINITY" not in panel
    for card in ("LIVE MARITIME SITUATION", "VESSEL ACTIVITY", "NEXT-DAY TRAFFIC", "NEXT-DAY CONGESTION"):
        assert card in panel, card
    assert "NO RECENT GFW READING" in panel
    assert "NO RECENT AIS READING" in panel


# ── 17-24: AIS integrity in the new renderer ─────────────────────────────
def test_no_provider_calls_from_frontend():
    blob = _all_frontend_text()
    assert "ais.openwaters.io" not in blob
    assert "stream.aisstream.io" not in blob
    assert "api.vesselapi.com" not in blob


def test_vessel_heading_uses_ais_heading_cog():
    assert _node_eval("E.headingOf({heading: 66, cog: 83}, null)") == {"hdg": 66, "oriented": True}
    assert _node_eval("E.headingOf({heading: null, cog: 83}, null)") == {"hdg": 83, "oriented": True}
    assert _node_eval("E.headingOf({heading: null, cog: null}, 41)") == {"hdg": 41, "oriented": False}
    assert _node_eval("E.headingOf({heading: null, cog: null}, null)") == {"hdg": 0, "oriented": False}


def test_interpolation_bounded_between_real_fixes():
    mid = _node_eval("E.interpolatePos({lat: 10, lon: 70, ts: 1000}, {lat: 11, lon: 71, ts: 1100}, 1050)")
    assert abs(mid["lat"] - 10.5) < 1e-9 and abs(mid["lon"] - 70.5) < 1e-9 and mid["done"] is False
    end = _node_eval("E.interpolatePos({lat: 10, lon: 70, ts: 1000}, {lat: 11, lon: 71, ts: 1100}, 9999)")
    assert end == {"lat": 11, "lon": 71, "done": True}
    # no extrapolation backwards either
    start = _node_eval("E.interpolatePos({lat: 10, lon: 70, ts: 1000}, {lat: 11, lon: 71, ts: 1100}, 0)")
    assert start["lat"] == 10 and start["lon"] == 70


def test_stale_vessels_freeze_and_wake_rules():
    assert _node_eval("E.statusOf({last_seen: 1000000}, 1000030)") == "LIVE"
    assert _node_eval("E.statusOf({last_seen: 1000000}, 1000100)") == "RECENT"
    assert _node_eval("E.statusOf({last_seen: 1000000}, 1001000)") == "STALE"
    assert _node_eval("E.wakeVisible({sog: 8, last_seen: 1000000}, 1000010)") is True
    assert _node_eval("E.wakeVisible({sog: 0, last_seen: 1000000}, 1000010)") is False
    assert _node_eval("E.wakeVisible({sog: 8, last_seen: 1000000}, 1001000)") is False


def test_trail_uses_actual_history_only():
    segs = _node_eval(
        "E.trailSegments([{lat: 10, lon: 70}, {lat: 10.1, lon: 70.1}], 10.2, 70.2).length"
    )
    assert segs == 2  # 3 fixes (2 observed + current) → 2 segments
    assert _node_eval("E.trailSegments([], 10.2, 70.2).length") == 0


def test_multi_source_provenance_in_features():
    feats = _node_eval(
        "E.featureizeVessels([{v: {mmsi: 7, sources: ['OPENWATERS','VESSELAPI'], sog: 5}, lat: 10, lon: 70, hdg: 90, status: 'LIVE', selected: false, nowS: 0}]).features[0].properties"
    )
    assert feats["mmsi"] == 7 and feats["srcs"] == "OPENWATERS+VESSELAPI" and feats["hdg"] == 90


def test_ship_variant_only_from_backend_codes():
    assert _node_eval("E.shipVariant({ship_type: 70})") == "cargo"
    assert _node_eval("E.shipVariant({ship_type: 80})") == "tanker"
    assert _node_eval("E.shipVariant({ship_type: 60})") == "passenger"
    assert _node_eval("E.shipVariant({ship_type: 30})") == "fishing"
    assert _node_eval("E.shipVariant({ship_type: 52})") == "tug"
    assert _node_eval("E.shipVariant({ship_type: null})") == "hull"
    assert _node_eval("E.shipVariant({})") == "hull"


def test_ais_remains_aggregated_three_sources():
    body = client.get("/api/v1/vessels").json()
    assert set(body["sources"]) == {"aisstream", "openwaters", "vesselapi"}
    assert "unique_vessels" in body["aggregation"]


def test_navy_style_transform_is_data_safe():
    """toNavyStyle recolors known layers, passes unknown layers through."""
    out = _node_eval(
        "import(STYLE_URL).then((M) => {"
        " const base = { version: 8, sources: {}, layers: ["
        "  { id: 'background', type: 'background', paint: { 'background-color': '#fff' } },"
        "  { id: 'water', type: 'fill', 'source-layer': 'water', paint: { 'fill-color': '#aad' } },"
        "  { id: 'mystery', type: 'fill', paint: { 'fill-color': '#123456' } },"
        " ]};"
        " const s = M.toNavyStyle(base);"
        " const byId = Object.fromEntries(s.layers.map((l) => [l.id, l]));"
        " return { bg: byId.background.paint['background-color'],"
        "  water: byId.water.paint['fill-color'],"
        "  mystery: byId.mystery.paint['fill-color'],"
        "  count: s.layers.length }; })".replace(
            "STYLE_URL", "'" + (FSRC / "map" / "mapStyle.js").as_uri() + "'"
        )
    )
    assert out["bg"] == "#04101c"
    assert out["water"] == "#0d2a41"
    assert out["mystery"] == "#0a1a29"  # generic land fallback, never dropped
    assert out["count"] == 3
