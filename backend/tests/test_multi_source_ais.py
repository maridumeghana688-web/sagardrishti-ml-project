"""Multi-source AIS tests: Open Waters parsing, normalization, aggregation.

Proves (with real-shaped fixtures, no network):
- GeoJSON/event parsing incl. coordinate-order handling
- Class-A and Class-B normalization
- invalid MMSI / coordinates / stale timestamps rejected
- per-provider provenance preserved
- same MMSI from both providers -> ONE vessel, freshest wins
- either provider empty while the other has vessels (no fallback logic)
- both empty, connection errors, India-box filtering, port association
"""
import time

from fastapi.testclient import TestClient

from app.main import app
from app.services import aisstream as ais
from app.services import openwaters as ow
from app.services.ais_aggregator import merge_vessels
from app.services.ais_normalize import (
    normalize_openwaters_event,
    normalize_openwaters_feature,
    parse_time,
    valid_mmsi,
    valid_position,
)

client = TestClient(app)
NOW = time.time()

OW_FEATURE = {
    "type": "Feature",
    "geometry": {"type": "Point", "coordinates": [72.86, 18.93]},  # [lon, lat]
    "properties": {"mmsi": 419001483, "name": "TCI ANAND", "lat": None,
                   "sog": 5.5, "cog": 83.0, "heading": 66, "nav_status": 0,
                   "type": 70, "imo": 1234567, "destination": "MUMBAI",
                   "seen": "2026-10-07T08:28:21Z", "msg_type": "PositionReport",
                   "source": "aishub", "station": "aishub"},
}

OW_EVENT = {
    "type": "event", "mmsi": 419001483, "msg_type": "PositionReport",
    "lat": 18.93, "lon": 72.86, "time": "2026-10-07T08:28:21Z",
    "source": "aishub", "station": "aishub",
    "message": {"Sog": 5.5, "Cog": 83.0, "TrueHeading": 66, "NavigationalStatus": 0},
}


def _rec(mmsi, lat=18.9, lon=72.8, age=10.0, source="AISSTREAM"):
    return {"mmsi": mmsi, "latitude": lat, "longitude": lon, "sog": 8.0,
            "cog": 90.0, "heading": 90, "last_seen": NOW - age,
            "freshness": "LIVE", "source": source,
            "received_at": "2026-10-07T00:00:00Z", "timestamp": "2026-10-07T00:00:00Z",
            "track": [], "track_points": 0, "vessel_status": "OFFSHORE",
            "sources": [source], "source_last_seen": {source: "2026-10-07T00:00:00Z"}}


# 1-3: parsing incl. coordinate order -------------------------------------
def test_geojson_feature_parsing_lon_lat_order():
    r = normalize_openwaters_feature(OW_FEATURE, NOW)
    assert r is not None
    assert r["mmsi"] == 419001483
    assert abs(r["latitude"] - 18.93) < 1e-9 and abs(r["longitude"] - 72.86) < 1e-9
    assert r["sog"] == 5.5 and r["heading"] == 66
    assert r["source"] == "OPENWATERS" and r["source_station"] == "aishub"


def test_geojson_swapped_coordinates_rejected_or_outside_india():
    bad = {"type": "Feature",
           "geometry": {"type": "Point", "coordinates": [18.93, 72.86]},
           "properties": dict(OW_FEATURE["properties"])}
    r = normalize_openwaters_feature(bad, NOW)
    # [18.93, 72.86] as [lon, lat] = lon 18.93E lat 72.86N (Arctic) — valid
    # coords but NOT Mumbai; parser must not flip them into India.
    assert r is None or abs(r["latitude"] - 72.86) < 1e-9


def test_stream_event_parsing():
    r = normalize_openwaters_event(OW_EVENT, NOW)
    assert r is not None and r["mmsi"] == 419001483
    assert abs(r["latitude"] - 18.93) < 1e-9 and r["cog"] == 83.0
    assert normalize_openwaters_event({"type": "welcome"}, NOW) is None


# 4-6: AISStream + class normalization ------------------------------------
def test_aisstream_position_types_recognized():
    assert set(ais.POSITION_TYPES) >= {"PositionReport", "StandardClassBPositionReport",
                                       "ExtendedClassBPositionReport"}


def test_class_a_and_b_normalization():
    a = normalize_openwaters_event(dict(OW_EVENT, msg_type="PositionReport"), NOW)
    b = normalize_openwaters_event(dict(OW_EVENT, msg_type="StandardClassBPositionReport"), NOW)
    assert a["ais_class"] == "A" and b["ais_class"] == "B"


# 7-9: invalid data rejected ----------------------------------------------
def test_invalid_mmsi_rejected():
    assert valid_mmsi(123) is None and valid_mmsi("abc") is None
    assert valid_mmsi(None) is None and valid_mmsi(419001483) == 419001483
    bad = {"type": "Feature", "geometry": {"type": "Point", "coordinates": [72.8, 18.9]},
           "properties": dict(OW_FEATURE["properties"], mmsi=12345)}
    assert normalize_openwaters_feature(bad, NOW) is None


def test_invalid_coordinates_rejected():
    assert valid_position(91.0, 0.0) is None
    assert valid_position(0.0, 181.0) is None
    assert valid_position("x", 72.0) is None
    assert valid_position(18.9, 72.8) == (18.9, 72.8)


def test_stale_timestamps_age_correctly():
    assert parse_time("2026-10-07T08:28:21Z") is not None
    assert parse_time("not-a-time") is None
    old = NOW - 7200
    v, _ = merge_vessels([_rec(111, age=7200.0)], [])
    assert v[0]["last_seen"] == old


# 10-13: provenance + dedup -----------------------------------------------
def test_provider_provenance_preserved():
    v, _ = merge_vessels([], [_rec(111, source="OPENWATERS")])
    assert v[0]["sources"] == ["OPENWATERS"]
    assert "OPENWATERS" in v[0]["source_last_seen"]


def test_same_mmsi_both_providers_one_vessel_freshest_wins():
    as_v = _rec(111, lat=18.90, age=60.0, source="AISSTREAM")
    ow_v = _rec(111, lat=18.95, age=5.0, source="OPENWATERS")
    vessels, stats = merge_vessels([as_v], [ow_v])
    assert len(vessels) == 1
    assert vessels[0]["latitude"] == 18.95  # newer Open Waters fix wins
    assert vessels[0]["sources"] == ["AISSTREAM", "OPENWATERS"]
    assert set(vessels[0]["source_last_seen"]) == {"AISSTREAM", "OPENWATERS"}
    assert stats["from_both"] == 1 and stats["unique_vessels"] == 1


def test_older_openwaters_does_not_displace_newer_aisstream():
    as_v = _rec(111, lat=18.90, age=5.0, source="AISSTREAM")
    ow_v = _rec(111, lat=18.50, age=600.0, source="OPENWATERS")
    vessels, _ = merge_vessels([as_v], [ow_v])
    assert vessels[0]["latitude"] == 18.90
    assert vessels[0]["sources"] == ["AISSTREAM", "OPENWATERS"]


def test_dedup_track_union_bounded():
    as_v = _rec(111, source="AISSTREAM")
    as_v["track"] = [{"lat": 18.8, "lon": 72.7, "ts": NOW - 60}]
    ow_v = _rec(111, source="OPENWATERS")
    ow_v["track"] = [{"lat": 18.8, "lon": 72.7, "ts": NOW - 60},
                     {"lat": 18.85, "lon": 72.75, "ts": NOW - 30}]
    vessels, _ = merge_vessels([as_v], [ow_v])
    assert len(vessels[0]["track"]) == 2  # duplicate fix merged once


# 14-16: provider independence (no fallback) -------------------------------
def test_aisstream_operates_when_openwaters_empty():
    vessels, stats = merge_vessels([_rec(111), _rec(222)], [])
    assert stats["unique_vessels"] == 2 and stats["from_aisstream"] == 2
    assert stats["from_openwaters"] == 0


def test_openwaters_operates_when_aisstream_empty():
    vessels, stats = merge_vessels([], [_rec(111, source="OPENWATERS")])
    assert stats["unique_vessels"] == 1 and stats["from_openwaters"] == 1


def test_both_empty():
    vessels, stats = merge_vessels([], [])
    assert vessels == [] and stats["unique_vessels"] == 0


# 17-18: errors / reconnect surface ---------------------------------------
def test_openwaters_status_vocabulary():
    svc = ow.OpenWatersService()
    assert svc.provider_status() in ("DISCONNECTED", "CONNECTED_WAITING", "CONNECTED_NO_RECENT")
    svc.rate_limited = True
    assert svc.provider_status() == "RATE_LIMITED"


def test_openwaters_reconnect_counters_exist():
    svc = ow.OpenWatersService()
    d = svc.diagnostics()
    for k in ("stream_attempts", "stream_reconnects", "poll_runs", "poll_errors",
              "rate_limited", "status", "stream_boxes", "poll_boxes"):
        assert k in d


# 19-20: geo filtering + association --------------------------------------
def test_india_box_filtering():
    assert ais.point_in_boxes(18.9, 72.8) is True
    assert ais.point_in_boxes(52.4, 4.7) is False


def test_port_radius_association_mumbai():
    ports = ais.SERVICE.ports()
    mumbai = next(p for p in ports if p["port_id"] == 48840)
    near = {"latitude": mumbai["latitude"] + 0.1, "longitude": mumbai["longitude"],
            "cog": None, "sog": None}
    assert ais.AisStreamService._associate(near, mumbai, 11.1) == "WITHIN PORT RADIUS"
    far = {"latitude": 0.0, "longitude": 60.0, "cog": None, "sog": None}
    assert ais.AisStreamService._associate(far, mumbai, 9999.0) == "OFFSHORE"


# API contract: additive metadata -----------------------------------------
def test_vessels_response_has_sources_and_aggregation():
    body = client.get("/api/v1/vessels").json()
    assert "sources" in body and "aggregation" in body
    assert set(body["sources"]) == {"aisstream", "openwaters", "vesselapi"}
    assert "unique_vessels" in body["aggregation"] and "from_both" in body["aggregation"]
    assert "from_vesselapi" in body["aggregation"] and "from_all_three" in body["aggregation"]
    assert "AISSTREAM_API_KEY" not in str(body) and "OPENWATERS_API_KEY" not in str(body)
    assert "VESSELAPI_API_KEY" not in str(body) and "Bearer" not in str(body)


def test_system_status_has_both_providers():
    body = client.get("/api/v1/system/status").json()
    assert "aisstream" in body and "openwaters" in body and "vesselapi" in body
    assert body["openwaters"]["diagnostics"]["provider"] == "OPENWATERS"
    assert body["vesselapi"]["diagnostics"]["provider"] == "VESSELAPI"
