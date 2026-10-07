"""Shared AIS provider abstraction for SAGARDRISHTI multi-source aggregation.

Both first-class sources (AISStream, Open Waters) normalize into the same
record shape here. No provider-specific format may reach the API/frontend.

Coordinate-order warning (verified live 2026-10-07):
- Open Waters HTTP GeoJSON geometry.coordinates = [lon, lat] (standard).
- Open Waters HTTP bbox param            = lat,lon,lat,lon (non-standard).
- Open Waters stream events              = explicit lat / lon fields.
Mixing these up places vessels on the wrong continent; both orders are
handled explicitly below and covered by tests.
"""
from __future__ import annotations

from datetime import datetime, timezone

SOURCE_AISSTREAM = "AISSTREAM"
SOURCE_OPENWATERS = "OPENWATERS"
SOURCE_VESSELAPI = "VESSELAPI"

# Message types normalized into vessel positions (AISStream + Open Waters names).
POSITION_MESSAGE_TYPES = {
    "PositionReport",
    "StandardClassBPositionReport",
    "ExtendedClassBPositionReport",
    # Open Waters msg_type variants observed / documented:
    "ClassA",
    "ClassB",
    "ClassBCS",
    "ClassBCSStatic",
}


def valid_mmsi(mmsi) -> int | None:
    """Return the MMSI as int, or None when invalid. Never raises."""
    try:
        m = int(mmsi)
    except (TypeError, ValueError):
        return None
    if 100000000 <= m <= 999999999:
        return m
    return None


def valid_position(lat, lon) -> tuple[float, float] | None:
    """Return (lat, lon) floats, or None when out of range / non-numeric."""
    try:
        la, lo = float(lat), float(lon)
    except (TypeError, ValueError):
        return None
    if not (-90.0 <= la <= 90.0 and -180.0 <= lo <= 180.0):
        return None
    # AIS "not available" sentinels used by some encoders.
    if la == 91.0 or lo == 181.0:
        return None
    return (la, lo)


def parse_time(value) -> float | None:
    """Parse an ISO-8601 timestamp (or epoch) to epoch seconds. None if bad."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        v = float(value)
        # Heuristic: milliseconds vs seconds.
        if v > 1e12:
            v /= 1000.0
        return v if v > 0 else None
    try:
        s = str(value).strip()
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        return datetime.fromisoformat(s).timestamp()
    except (ValueError, TypeError):
        return None


def _num(value, lo: float, hi: float):
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return v if lo <= v <= hi else None


def normalize_openwaters_feature(feature: dict, now: float) -> dict | None:
    """Normalize one GeoJSON Feature from GET /v1/vessels. None if invalid."""
    if not isinstance(feature, dict):
        return None
    props = feature.get("properties") or {}
    geom = feature.get("geometry") or {}
    coords = geom.get("coordinates") or []
    if len(coords) < 2:
        return None
    # GeoJSON order: [lon, lat].
    pos = valid_position(coords[1], coords[0])
    if pos is None:
        return None
    lat, lon = pos
    mmsi = valid_mmsi(props.get("mmsi"))
    if mmsi is None:
        return None
    seen_ts = parse_time(props.get("seen"))
    msg_type = str(props.get("msg_type") or "PositionReport")
    heading = _num(props.get("heading"), 0, 360)
    if heading is not None and heading == 511:
        heading = None  # AIS "heading unavailable" sentinel.
    cog = _num(props.get("cog"), 0, 360)
    sog = _num(props.get("sog"), 0, 102.2)
    return {
        "mmsi": mmsi,
        "vessel_name": (props.get("name") or "").strip() or None,
        "latitude": lat,
        "longitude": lon,
        "sog": sog,
        "cog": cog,
        "heading": heading,
        "nav_status": props.get("nav_status"),
        "ship_type": props.get("type"),
        "imo": props.get("imo"),
        "callsign": props.get("callsign"),
        "flag": props.get("flag"),
        "destination": (props.get("destination") or "").strip() or None,
        "timestamp": props.get("seen"),
        "last_seen": seen_ts if seen_ts is not None else now,
        "seen_provided": seen_ts is not None,
        "message_type": msg_type,
        "ais_class": "B" if "ClassB" in msg_type or "CS" in str(props.get("kind") or "") else ("A" if "Position" in msg_type or "ClassA" in msg_type else None),
        "source": SOURCE_OPENWATERS,
        "source_station": props.get("station"),
        "upstream_source": props.get("source"),
    }


def normalize_vesselapi_record(item: dict, now: float) -> dict | None:
    """Normalize one VesselAPI bbox vessel (explicit latitude/longitude).

    Uses the AIS observation `timestamp` for freshness — never request time.
    `processed_timestamp` is preserved separately (API processing time).
    Records flagged suspected_glitch are rejected. Missing fields stay null.
    """
    if not isinstance(item, dict):
        return None
    if item.get("suspected_glitch") is True:
        return None
    pos = valid_position(item.get("latitude"), item.get("longitude"))
    if pos is None:
        return None
    lat, lon = pos
    mmsi = valid_mmsi(item.get("mmsi"))
    if mmsi is None:
        return None
    seen_ts = parse_time(item.get("timestamp"))
    heading = _num(item.get("heading"), 0, 360)
    if heading is not None and heading == 511:
        heading = None  # AIS "heading unavailable" sentinel.
    return {
        "mmsi": mmsi,
        "vessel_name": (item.get("vessel_name") or "").strip() or None,
        "latitude": lat,
        "longitude": lon,
        "sog": _num(item.get("sog"), 0, 102.2),
        "cog": _num(item.get("cog"), 0, 360),
        "heading": heading,
        "nav_status": item.get("nav_status"),
        "ship_type": None,
        "imo": item.get("imo"),
        "callsign": None,
        "flag": None,
        "destination": None,
        "timestamp": item.get("timestamp"),
        "processed_timestamp": item.get("processed_timestamp"),
        "last_seen": seen_ts if seen_ts is not None else now,
        "seen_provided": seen_ts is not None,
        "message_type": "PositionReport",
        "ais_class": None,
        "source": SOURCE_VESSELAPI,
        "source_station": None,
        "upstream_source": "vesselapi",
    }


def normalize_openwaters_event(event: dict, now: float) -> dict | None:
    """Normalize one v1/stream event frame (type == 'event'). None if invalid."""
    if not isinstance(event, dict) or event.get("type") != "event":
        return None
    # Stream events carry explicit lat / lon fields (correct order).
    pos = valid_position(event.get("lat"), event.get("lon"))
    if pos is None:
        # Fall back to the decoded NMEA message body when present.
        body = event.get("message") or {}
        pos = valid_position(body.get("Latitude"), body.get("Longitude"))
    if pos is None:
        return None
    lat, lon = pos
    mmsi = valid_mmsi(event.get("mmsi"))
    if mmsi is None:
        return None
    body = event.get("message") or {}
    msg_type = str(event.get("msg_type") or "PositionReport")
    seen_ts = parse_time(event.get("time")) or now
    heading = _num(body.get("TrueHeading"), 0, 360)
    if heading is not None and heading == 511:
        heading = None
    return {
        "mmsi": mmsi,
        "vessel_name": None,  # stream position frames carry no static data
        "latitude": lat,
        "longitude": lon,
        "sog": _num(body.get("Sog"), 0, 102.2),
        "cog": _num(body.get("Cog"), 0, 360),
        "heading": heading,
        "nav_status": body.get("NavigationalStatus"),
        "ship_type": None,
        "imo": None,
        "callsign": None,
        "flag": None,
        "destination": None,
        "timestamp": event.get("time"),
        "last_seen": seen_ts,
        "seen_provided": event.get("time") is not None,
        "message_type": msg_type,
        "ais_class": "B" if "ClassB" in msg_type else ("A" if "Position" in msg_type or "ClassA" in msg_type else None),
        "source": SOURCE_OPENWATERS,
        "source_station": event.get("station"),
        "upstream_source": event.get("source"),
    }
