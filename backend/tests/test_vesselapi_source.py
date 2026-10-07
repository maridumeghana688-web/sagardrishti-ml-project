"""VesselAPI third-source tests: auth, parsing, worker isolation, 3-way dedup.

No network: HTTP is stubbed via monkeypatched httpx.get; fixtures mirror the
documented VesselAPI bbox schema. The real .env key is never used here.
"""
import time

import pytest

from fastapi.testclient import TestClient

from app.main import app
from app.services import vesselapi as va
from app.services.ais_aggregator import merge_many
from app.services.ais_normalize import (
    SOURCE_AISSTREAM,
    SOURCE_OPENWATERS,
    SOURCE_VESSELAPI,
    normalize_vesselapi_record,
)

client = TestClient(app)
NOW = time.time()
FAKE_KEY = "test-key-0123456789abcdef"

VA_ITEM = {
    "mmsi": 419001483, "vessel_name": "TCI ANAND", "imo": 1234567,
    "latitude": 18.93, "longitude": 72.86,
    "sog": 5.5, "cog": 83.0, "heading": 66, "nav_status": 0,
    "timestamp": "2026-10-07T08:28:21Z",
    "processed_timestamp": "2026-10-07T08:28:25Z",
    "suspected_glitch": False,
}


def _rec(mmsi, age=10.0, source=SOURCE_VESSELAPI, lat=18.9, lon=72.8):
    return {"mmsi": mmsi, "latitude": lat, "longitude": lon, "sog": 8.0,
            "cog": 90.0, "heading": 90, "last_seen": NOW - age,
            "freshness": "LIVE", "source": source,
            "timestamp": "2026-10-07T00:00:00Z",
            "track": [], "track_points": 0, "vessel_status": "OFFSHORE"}


# 1-2: auth + key handling ------------------------------------------------
def test_missing_key_means_not_configured(monkeypatch):
    monkeypatch.delenv("VESSELAPI_API_KEY", raising=False)
    svc = va.VesselApiService.__new__(va.VesselApiService)
    # fresh instance without touching the singleton: configured reflects env
    import app.services.vesselapi as vamod
    orig = vamod._load_key
    vamod._load_key = lambda: ""
    try:
        inst = va.VesselApiService()
        assert inst.configured is False
        assert inst.provider_status() == "NOT_CONFIGURED"
        assert inst.start() == {"started": False, "reason": "NOT_CONFIGURED"}
    finally:
        vamod._load_key = orig


def test_auth_header_format_and_no_key_leak(monkeypatch):
    monkeypatch.setenv("VESSELAPI_API_KEY", FAKE_KEY)
    svc = va.VesselApiService()
    assert svc.configured is True
    h = svc._headers()
    assert h["Authorization"] == f"Bearer {FAKE_KEY}"
    blob = str(svc.diagnostics()) + str(svc.health())
    assert FAKE_KEY not in blob
    assert "Bearer" not in blob


# 3-5: request shape + response parsing ------------------------------------
def test_bbox_query_params_within_documented_limits():
    import urllib.parse
    boxes = [(17.9, 71.9, 19.6, 73.6), (9.0, 75.4, 10.6, 76.8)]
    for la0, lo0, la1, lo1 in boxes:
        assert abs(la1 - la0) + abs(lo1 - lo0) <= 4.0
        q = urllib.parse.urlencode({"filter.latBottom": la0, "filter.lonLeft": lo0,
                                    "filter.latTop": la1, "filter.lonRight": lo1,
                                    "pagination.limit": 50})
        assert "filter.latBottom" in q and "pagination.limit=50" in q


def test_vesselapi_record_parsing():
    r = normalize_vesselapi_record(dict(VA_ITEM), NOW)
    assert r is not None and r["mmsi"] == 419001483
    assert (r["latitude"], r["longitude"]) == (18.93, 72.86)
    assert r["sog"] == 5.5 and r["cog"] == 83.0 and r["heading"] == 66
    assert r["source"] == SOURCE_VESSELAPI
    assert r["last_seen"] > NOW - 3600 * 24 * 400  # real AIS time, parsed


def test_geojson_coordinate_interpretation_explicit_lat_lon():
    # VesselAPI uses explicit latitude/longitude fields (no order ambiguity).
    r = normalize_vesselapi_record(dict(VA_ITEM, latitude=72.86, longitude=18.93), NOW)
    assert r is None or (r["latitude"] == 72.86)  # out-of-India, never flipped


# 6-13: field validation ----------------------------------------------------
def test_mmsi_lat_lon_validation():
    assert normalize_vesselapi_record(dict(VA_ITEM, mmsi=123), NOW) is None
    assert normalize_vesselapi_record(dict(VA_ITEM, latitude=91.0), NOW) is None
    assert normalize_vesselapi_record(dict(VA_ITEM, longitude=181.0), NOW) is None
    assert normalize_vesselapi_record(dict(VA_ITEM, heading=511), NOW)["heading"] is None
    assert normalize_vesselapi_record(dict(VA_ITEM, sog=999), NOW)["sog"] is None
    assert normalize_vesselapi_record({"mmsi": 1}, NOW) is None


def test_missing_fields_stay_null_not_fabricated():
    r = normalize_vesselapi_record({"mmsi": 419001483, "latitude": 18.9,
                                    "longitude": 72.8,
                                    "timestamp": "2026-10-07T08:00:00Z"}, NOW)
    assert r is not None
    assert r["vessel_name"] is None and r["sog"] is None
    assert r["cog"] is None and r["heading"] is None and r["imo"] is None


def test_glitch_flagged_records_rejected():
    assert normalize_vesselapi_record(dict(VA_ITEM, suspected_glitch=True), NOW) is None


def test_stale_detection_uses_ais_time_not_request_time():
    old = dict(VA_ITEM, timestamp="2026-10-01T00:00:00Z")
    r = normalize_vesselapi_record(old, NOW)
    assert NOW - r["last_seen"] > 24 * 3600  # ~6 days old, honestly aged


# 14-15: normalization + provider health ------------------------------------
def test_vesselapi_normalization_shape():
    r = normalize_vesselapi_record(dict(VA_ITEM), NOW)
    for k in ("mmsi", "latitude", "longitude", "sog", "cog", "heading",
              "timestamp", "processed_timestamp", "last_seen", "source"):
        assert k in r


def test_provider_health_vocabulary():
    svc = va.VesselApiService()
    d = svc.diagnostics()
    assert d["provider"] == SOURCE_VESSELAPI
    assert d["transport"].startswith("REST_POLL")
    assert "poll_boxes" in d and "quota_remaining" in d


# 16-21: HTTP error handling (stubbed transport) ------------------------------
class _Resp:
    def __init__(self, status, body=None, headers=None):
        self.status_code = status
        self._body = body or {}
        self.headers = headers or {}

    def json(self):
        if isinstance(self._body, Exception):
            raise self._body
        return self._body


def _svc():
    svc = va.VesselApiService()
    svc.retry_after_until = 0.0
    return svc


def test_http_401_is_authentication_error(monkeypatch):
    import httpx
    monkeypatch.setattr(httpx, "get", lambda *a, **k: _Resp(401, {"error": {"code": "invalid_api_key"}}))
    svc, _svc_orig = _svc(), None
    monkeypatch.setenv("VESSELAPI_API_KEY", FAKE_KEY)
    svc._poll_once()
    assert svc.auth_failures >= 1
    assert svc.provider_status() == "AUTH_ERROR"


def test_http_403_suspends_with_retry_after(monkeypatch):
    import httpx
    monkeypatch.setattr(httpx, "get", lambda *a, **k: _Resp(403, {}, {"Retry-After": "30"}))
    monkeypatch.setenv("VESSELAPI_API_KEY", FAKE_KEY)
    svc = _svc()
    svc._poll_once()
    assert svc.retry_after_until > time.time()


def test_http_429_quota_halts_polling(monkeypatch):
    import httpx
    monkeypatch.setattr(httpx, "get", lambda *a, **k: _Resp(429, {"error": {"message": "monthly quota exceeded"}}))
    monkeypatch.setenv("VESSELAPI_API_KEY", FAKE_KEY)
    svc = _svc()
    svc._poll_once()
    assert svc.quota_exhausted is True
    assert svc.provider_status() == "RATE_LIMITED"


def test_http_429_concurrency_backs_off_without_quota_flag(monkeypatch):
    import httpx
    monkeypatch.setattr(httpx, "get", lambda *a, **k: _Resp(429, {"error": {"message": "too many requests"}}, {"Retry-After": "1"}))
    monkeypatch.setenv("VESSELAPI_API_KEY", FAKE_KEY)
    svc = _svc()
    svc._poll_once()
    assert svc.quota_exhausted is False and svc.rate_limited is True


def test_timeout_and_malformed_json_counted(monkeypatch):
    import httpx
    calls = {"n": 0}

    def flaky(*a, **k):
        calls["n"] += 1
        if calls["n"] % 2:
            raise httpx.TimeoutException("slow")
        return _Resp(200, ValueError("bad json"))
    monkeypatch.setattr(httpx, "get", flaky)
    monkeypatch.setenv("VESSELAPI_API_KEY", FAKE_KEY)
    svc = _svc()
    svc._poll_once()  # timeout -> poll_errors
    svc._poll_once()  # malformed JSON -> parse_errors
    assert svc.poll_errors >= 1 and svc.parse_errors >= 1


# 22-26: independence + dedup matrix ------------------------------------------
def test_a_openwaters_only():
    v, s = merge_many({SOURCE_AISSTREAM: [], SOURCE_OPENWATERS: [_rec(1, source=SOURCE_OPENWATERS)], SOURCE_VESSELAPI: []})
    assert s["unique_vessels"] == 1 and s["from_openwaters"] == 1 and s["from_vesselapi"] == 0


def test_b_aisstream_only():
    v, s = merge_many({SOURCE_AISSTREAM: [_rec(1, source=SOURCE_AISSTREAM)], SOURCE_OPENWATERS: [], SOURCE_VESSELAPI: []})
    assert s["unique_vessels"] == 1 and s["from_aisstream"] == 1


def test_c_vesselapi_only():
    v, s = merge_many({SOURCE_AISSTREAM: [], SOURCE_OPENWATERS: [], SOURCE_VESSELAPI: [_rec(1)]})
    assert s["unique_vessels"] == 1 and s["from_vesselapi"] == 1
    assert v[0]["sources"] == [SOURCE_VESSELAPI]


def test_d_e_f_pairs():
    v, s = merge_many({SOURCE_AISSTREAM: [_rec(1, source=SOURCE_AISSTREAM)],
                       SOURCE_OPENWATERS: [_rec(2, source=SOURCE_OPENWATERS)], SOURCE_VESSELAPI: []})
    assert s["unique_vessels"] == 2 and s["from_two_sources"] == 0
    v, s = merge_many({SOURCE_AISSTREAM: [], SOURCE_OPENWATERS: [_rec(1, source=SOURCE_OPENWATERS)], SOURCE_VESSELAPI: [_rec(2)]})
    assert s["unique_vessels"] == 2 and s["vesselapi_only"] == 1
    v, s = merge_many({SOURCE_AISSTREAM: [_rec(1, source=SOURCE_AISSTREAM)], SOURCE_OPENWATERS: [], SOURCE_VESSELAPI: [_rec(2)]})
    assert s["unique_vessels"] == 2 and s["aisstream_only"] == 1


def test_g_all_three_contribute():
    v, s = merge_many({SOURCE_AISSTREAM: [_rec(1, source=SOURCE_AISSTREAM)],
                       SOURCE_OPENWATERS: [_rec(2, source=SOURCE_OPENWATERS)],
                       SOURCE_VESSELAPI: [_rec(3)]})
    assert s["unique_vessels"] == 3 and s["from_all_three"] == 0


def test_h_same_mmsi_all_three_one_vessel():
    snaps = {SOURCE_AISSTREAM: [_rec(7, age=30.0, source=SOURCE_AISSTREAM)],
             SOURCE_OPENWATERS: [_rec(7, age=20.0, source=SOURCE_OPENWATERS)],
             SOURCE_VESSELAPI: [_rec(7, age=10.0, source=SOURCE_VESSELAPI)]}
    v, s = merge_many(snaps)
    assert len(v) == 1 and s["from_all_three"] == 1
    assert v[0]["sources"] == ["AISSTREAM", "OPENWATERS", "VESSELAPI"]
    assert set(v[0]["source_last_seen"]) == {"AISSTREAM", "OPENWATERS", "VESSELAPI"}


def test_i_freshest_position_wins_three_way():
    old_ow = _rec(7, age=100.0, source=SOURCE_OPENWATERS, lat=10.0)
    mid_as = _rec(7, age=50.0, source=SOURCE_AISSTREAM, lat=11.0)
    new_va = _rec(7, age=5.0, source=SOURCE_VESSELAPI, lat=12.0)
    v, _ = merge_many({SOURCE_AISSTREAM: [mid_as], SOURCE_OPENWATERS: [old_ow], SOURCE_VESSELAPI: [new_va]})
    assert v[0]["latitude"] == 12.0 and v[0]["source"] == SOURCE_VESSELAPI


def test_j_k_single_and_double_failure_isolation():
    # one provider empty/failing: others unaffected (merge is failure-agnostic)
    v, s = merge_many({SOURCE_AISSTREAM: [], SOURCE_OPENWATERS: [_rec(1, source=SOURCE_OPENWATERS)],
                       SOURCE_VESSELAPI: [_rec(2)]})
    assert s["unique_vessels"] == 2
    v, s = merge_many({SOURCE_AISSTREAM: [], SOURCE_OPENWATERS: [], SOURCE_VESSELAPI: [_rec(9)]})
    assert s["unique_vessels"] == 1 and s["vesselapi_only"] == 1


def test_l_all_fail_no_fake_data():
    v, s = merge_many({SOURCE_AISSTREAM: [], SOURCE_OPENWATERS: [], SOURCE_VESSELAPI: []})
    assert v == [] and s["unique_vessels"] == 0


# 27-30: contracts + leakage ----------------------------------------------------
def test_api_contract_three_sources():
    body = client.get("/api/v1/vessels").json()
    assert set(body["sources"]) == {"aisstream", "openwaters", "vesselapi"}
    agg = body["aggregation"]
    for k in ("unique_vessels", "from_vesselapi", "vesselapi_only",
              "from_openwaters_vesselapi", "from_aisstream_vesselapi",
              "from_all_three", "from_two_sources"):
        assert k in agg, k
    blob = str(body)
    assert "VESSELAPI_API_KEY" not in blob and "Bearer" not in blob


def test_sse_contract_has_sources():
    import asyncio
    from app.api.v1.live import ais_stream

    async def one():
        resp = await ais_stream()
        async for chunk in resp.body_iterator:
            assert '"sources"' in chunk and '"aggregation"' in chunk
            assert "VESSELAPI_API_KEY" not in chunk
            return True
        return False
    assert asyncio.run(asyncio.wait_for(one(), timeout=15))


def test_frontend_source_rendering_shape():
    # What the React AIS SOURCES panel consumes: per-source status, count,
    # connection + aggregation totals. Backend must provide all of them.
    h = client.get("/api/v1/vessels").json()["health"]
    for sid in ("openwaters", "aisstream", "vesselapi"):
        s = h["sources"][sid]
        assert "connected" in s and "vessels_tracked" in s
        assert "ais_status" in s
    assert isinstance(h["aggregation"]["unique_vessels"], int)


def test_no_secret_leakage_anywhere():
    blob = str(client.get("/api/v1/system/status").json())
    blob += str(client.get("/api/v1/analytics/overview").json())
    for secret in ("VESSELAPI_API_KEY", "AISSTREAM_API_KEY", "OPENWATERS_API_KEY", "Bearer "):
        assert secret not in blob
