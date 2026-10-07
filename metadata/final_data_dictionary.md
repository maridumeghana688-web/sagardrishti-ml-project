# SAGARDRISHTI final data dictionary

Authoritative ML artifacts are Parquet. No waiting_time dataset exists (reported UNAVAILABLE).

## Environment (gridded monthly, 0.25deg, 2021-2023)
`data/ml/sagardrishti_india_environment.parquet`

| column | description | type | unit | source | transformation | observed/derived | spatial | temporal | range |
|---|---|---|---|---|---|---|---|---|---|
| time | timestamp (month start, UTC) | datetime | - | NOAA/CMEMS file month | month aggregation (mean) | derived | 0.25deg grid | monthly | 2021-01..2023-12 |
| lat | grid cell latitude | float | deg N | NOAA coarsened grid | x6 coarsen mean | derived | 0.25deg | monthly | 0..30 |
| lon | grid cell longitude | float | deg E | NOAA coarsened grid | x6 coarsen mean | derived | 0.25deg | monthly | 65..100 |
| sst_monthly_mean | NOAA SST monthly mean | float | degree_C | nceiPH53sstd1day | valid-range QC [-1.8,45] + time mean + x6 coarsen | observed-derived | 0.25deg | monthly | -1.8..45 |
| cmems_thetao | CMEMS potential temperature (surface, depth-collapsed) | float | deg C | GLOBAL_MULTIYEAR_PHY_001_030 monthly | time+depth mean + x3 coarsen + nearest join | observed-derived | 0.25deg | monthly | ocean only (land NaN) |
| cmems_so | CMEMS salinity (surface, depth-collapsed) | float | psu | same as thetao | same | observed-derived | 0.25deg | monthly | ocean only |
| cmems_uo | CMEMS eastward velocity (surface, depth-collapsed) | float | m/s | same | same | observed-derived | 0.25deg | monthly | ocean only |
| cmems_vo | CMEMS northward velocity (surface, depth-collapsed) | float | m/s | same | same | observed-derived | 0.25deg | monthly | ocean only |
| current_magnitude | current speed sqrt(uo^2+vo^2) | float | m/s | cmems_uo/vo | sqrt(uo^2+vo^2) | derived | 0.25deg | monthly | >=0 |
| in_india_mask | inside India EEZ+150nm mask | bool | - | india_mask.geojson MRGID 8480 | point-in-polygon | derived | 0.25deg | monthly | true/false |
| sst_units | - | - | - | - | - | - | - | - | - |
| cmems_ocean_mask_note | - | - | - | - | - | - | - | - | - |
| provenance_noaa | - | - | - | - | - | - | - | - | - |
| provenance_cmems | - | - | - | - | - | - | - | - | - |
| spatial_join_method | - | - | - | - | - | - | - | - | - |

## Vessel activity (GFW observed, India-masked)
`data/ml/sagardrishti_india_vessel_activity.parquet`

| column | description | type | unit | source | transformation | observed/derived | spatial | temporal | range |
|---|---|---|---|---|---|---|---|---|---|
| lat | grid cell latitude | float | deg N | NOAA coarsened grid | x6 coarsen mean | derived | 0.25deg | monthly | 0..30 |
| lon | grid cell longitude | float | deg E | NOAA coarsened grid | x6 coarsen mean | derived | 0.25deg | monthly | 65..100 |
| time | timestamp (month start, UTC) | datetime | - | NOAA/CMEMS file month | month aggregation (mean) | derived | 0.25deg grid | monthly | 2021-01..2023-12 |
| flag | vessel flag state | string | - | GFW 4Wings group-by FLAG | none (as reported) | observed | LOW res | monthly | - |
| vessel_count | vessels reported for cell-flag-month (was 'vessel ids') | int | count | GFW 4Wings | renamed only | observed | LOW res | monthly | >=1 |
| vessel_presence_hours | vessel presence hours for cell-flag-month | float | hours | GFW 4Wings | none | observed | LOW res | monthly | >=0 |
| time_month | YYYY-MM label | string | - | time | strftime | derived | - | monthly | - |
| lat_cell | 0.25deg lat bin | float | deg | lat | round(lat*4)/4 | derived | 0.25deg | monthly | - |
| lon_cell | 0.25deg lon bin | float | deg | lon | round(lon*4)/4 | derived | 0.25deg | monthly | - |
| source | - | - | - | - | - | - | - | - | - |
| provenance | - | - | - | - | - | - | - | - | - |
| observed_vs_derived | - | - | - | - | - | - | - | - | - |

## India ports reference (WPI)
`data/reference/india_ports.parquet`

| column | description | type | unit | source | transformation | observed/derived | spatial | temporal | range |
|---|---|---|---|---|---|---|---|---|---|
| port_id | WPI index number | int | - | NGA WPI INDEX_NO | renamed | observed (reference) | point | static | - |
| port_name | port name | string | - | NGA WPI PORT_NAME | stripped | observed (reference) | point | static | - |
| country | ISO country (IN) | string | - | NGA WPI COUNTRY | none | observed (reference) | point | static | IN |
| latitude | port latitude | float | deg | NGA WPI LATITUDE | validated | observed (reference) | point | static | -90..90 |
| longitude | port longitude | float | deg | NGA WPI LONGITUDE | validated | observed (reference) | point | static | -180..180 |
| wpi_index_no | - | - | - | - | - | - | - | - | - |
| wpi_region_no | - | - | - | - | - | - | - | - | - |
| harbor_size | harbour size code L/M/S/V | string | - | WPI | preserved | observed (reference) | point | static | - |
| harbor_type | harbour type code | string | - | WPI | preserved | observed (reference) | point | static | - |
| shelter | shelter grade | string | - | WPI | preserved | observed (reference) | point | static | - |
| chart_ref | - | - | - | - | - | - | - | - | - |
| pub_ref | - | - | - | - | - | - | - | - | - |
| max_vessel | - | - | - | - | - | - | - | - | - |
| tide_range | - | - | - | - | - | - | - | - | - |
| un_locode | - | - | - | - | - | - | - | - | - |
| source | - | - | - | - | - | - | - | - | - |
| source_version | - | - | - | - | - | - | - | - | - |
| provenance | - | - | - | - | - | - | - | - | - |

## Port-vessel association (observed + inferred)
`data/derived/port_vessel_activity.parquet`

| column | description | type | unit | source | transformation | observed/derived | spatial | temporal | range |
|---|---|---|---|---|---|---|---|---|---|
| time | timestamp (month start, UTC) | datetime | - | NOAA/CMEMS file month | month aggregation (mean) | derived | 0.25deg grid | monthly | 2021-01..2023-12 |
| time_month | YYYY-MM label | string | - | time | strftime | derived | - | monthly | - |
| lat | grid cell latitude | float | deg N | NOAA coarsened grid | x6 coarsen mean | derived | 0.25deg | monthly | 0..30 |
| lon | grid cell longitude | float | deg E | NOAA coarsened grid | x6 coarsen mean | derived | 0.25deg | monthly | 65..100 |
| flag | vessel flag state | string | - | GFW 4Wings group-by FLAG | none (as reported) | observed | LOW res | monthly | - |
| vessel_count | vessels reported for cell-flag-month (was 'vessel ids') | int | count | GFW 4Wings | renamed only | observed | LOW res | monthly | >=1 |
| vessel_presence_hours | vessel presence hours for cell-flag-month | float | hours | GFW 4Wings | none | observed | LOW res | monthly | >=0 |
| nearest_port_idx | - | - | - | - | - | - | - | - | - |
| nearest_port_distance_km | haversine distance to nearest port | float | km | vessel cell + WPI | haversine | derived | point | monthly | >=0 |
| associated_port_id | port within 50km, else null | int/null | - | nearest port + radius | 50km geofence | inferred | point | monthly | - |
| associated_port_name | - | - | - | - | - | - | - | - | - |
| association | - | - | - | - | - | - | - | - | - |
| observation | - | - | - | - | - | - | - | - | - |
| port_radius_km | - | - | - | - | - | - | - | - | - |

## Port traffic (derived monthly aggregates)
`data/ml/sagardrishti_port_traffic.parquet`

| column | description | type | unit | source | transformation | observed/derived | spatial | temporal | range |
|---|---|---|---|---|---|---|---|---|---|
| port_id | WPI index number | int | - | NGA WPI INDEX_NO | renamed | observed (reference) | point | static | - |
| port_name | port name | string | - | NGA WPI PORT_NAME | stripped | observed (reference) | point | static | - |
| time_month | YYYY-MM label | string | - | time | strftime | derived | - | monthly | - |
| time | timestamp (month start, UTC) | datetime | - | NOAA/CMEMS file month | month aggregation (mean) | derived | 0.25deg grid | monthly | 2021-01..2023-12 |
| vessel_activity_count | rows (cell-flag units) in port-month | int | count | associated GFW rows | count | derived | port+month | monthly | >=1 |
| vessel_presence_hours | vessel presence hours for cell-flag-month | float | hours | GFW 4Wings | none | observed | LOW res | monthly | >=0 |
| vessel_count_sum | sum of vessel_count in port-month (approx; may double-count across flags/cells) | int | count | GFW vessel_count | sum | derived | port+month | monthly | >=1 |
| mean_distance_km | - | - | - | - | - | - | - | - | - |
| n_flags | - | - | - | - | - | - | - | - | - |
| latitude | port latitude | float | deg | NGA WPI LATITUDE | validated | observed (reference) | point | static | -90..90 |
| longitude | port longitude | float | deg | NGA WPI LONGITUDE | validated | observed (reference) | point | static | -180..180 |
| traffic_index | log1p(hours)*log1p(vessel_count_sum) composite | float | - | traffic components | formula (documented) | derived | port+month | monthly | >=0 |
| traffic_target | primary traffic target = vessel_presence_hours | float | hours | GFW | sum | derived | port+month | monthly | >=0 |
| target_kind | - | - | - | - | - | - | - | - | - |
| provenance | - | - | - | - | - | - | - | - | - |
| vessel_count_note | - | - | - | - | - | - | - | - | - |

## Port congestion (derived index)
`data/ml/sagardrishti_port_congestion.parquet`

| column | description | type | unit | source | transformation | observed/derived | spatial | temporal | range |
|---|---|---|---|---|---|---|---|---|---|
| port_id | WPI index number | int | - | NGA WPI INDEX_NO | renamed | observed (reference) | point | static | - |
| port_name | port name | string | - | NGA WPI PORT_NAME | stripped | observed (reference) | point | static | - |
| time | timestamp (month start, UTC) | datetime | - | NOAA/CMEMS file month | month aggregation (mean) | derived | 0.25deg grid | monthly | 2021-01..2023-12 |
| latitude | port latitude | float | deg | NGA WPI LATITUDE | validated | observed (reference) | point | static | -90..90 |
| longitude | port longitude | float | deg | NGA WPI LONGITUDE | validated | observed (reference) | point | static | -180..180 |
| vessel_presence_hours | vessel presence hours for cell-flag-month | float | hours | GFW 4Wings | none | observed | LOW res | monthly | >=0 |
| vessel_count_sum | sum of vessel_count in port-month (approx; may double-count across flags/cells) | int | count | GFW vessel_count | sum | derived | port+month | monthly | >=1 |
| vessel_activity_count | rows (cell-flag units) in port-month | int | count | associated GFW rows | count | derived | port+month | monthly | >=1 |
| norm_vessel_presence_hours | - | - | - | - | - | - | - | - | - |
| norm_vessel_count_sum | - | - | - | - | - | - | - | - | - |
| norm_vessel_activity_count | - | - | - | - | - | - | - | - | - |
| congestion_index | 0.5*norm(hours)+0.3*norm(count)+0.2*norm(activity), min-max over port-months | float | - | traffic aggregates | formula (documented) | derived | port+month | monthly | 0..1 |
| congestion_formula | - | - | - | - | - | - | - | - | - |
| congestion_spatial | - | - | - | - | - | - | - | - | - |
| congestion_temporal | - | - | - | - | - | - | - | - | - |
| congestion_kind | - | - | - | - | - | - | - | - | - |
| provenance | - | - | - | - | - | - | - | - | - |

## Master training table (port-month grain)
`data/ml/sagardrishti_master_training.parquet`

| column | description | type | unit | source | transformation | observed/derived | spatial | temporal | range |
|---|---|---|---|---|---|---|---|---|---|
| port_id | WPI index number | int | - | NGA WPI INDEX_NO | renamed | observed (reference) | point | static | - |
| port_name | port name | string | - | NGA WPI PORT_NAME | stripped | observed (reference) | point | static | - |
| time_month | YYYY-MM label | string | - | time | strftime | derived | - | monthly | - |
| time | timestamp (month start, UTC) | datetime | - | NOAA/CMEMS file month | month aggregation (mean) | derived | 0.25deg grid | monthly | 2021-01..2023-12 |
| vessel_activity_count | rows (cell-flag units) in port-month | int | count | associated GFW rows | count | derived | port+month | monthly | >=1 |
| vessel_presence_hours | vessel presence hours for cell-flag-month | float | hours | GFW 4Wings | none | observed | LOW res | monthly | >=0 |
| vessel_count_sum | sum of vessel_count in port-month (approx; may double-count across flags/cells) | int | count | GFW vessel_count | sum | derived | port+month | monthly | >=1 |
| mean_distance_km | - | - | - | - | - | - | - | - | - |
| n_flags | - | - | - | - | - | - | - | - | - |
| latitude | port latitude | float | deg | NGA WPI LATITUDE | validated | observed (reference) | point | static | -90..90 |
| longitude | port longitude | float | deg | NGA WPI LONGITUDE | validated | observed (reference) | point | static | -180..180 |
| traffic_index | log1p(hours)*log1p(vessel_count_sum) composite | float | - | traffic components | formula (documented) | derived | port+month | monthly | >=0 |
| traffic_target | primary traffic target = vessel_presence_hours | float | hours | GFW | sum | derived | port+month | monthly | >=0 |
| target_kind | - | - | - | - | - | - | - | - | - |
| provenance | - | - | - | - | - | - | - | - | - |
| vessel_count_note | - | - | - | - | - | - | - | - | - |
| congestion_index | 0.5*norm(hours)+0.3*norm(count)+0.2*norm(activity), min-max over port-months | float | - | traffic aggregates | formula (documented) | derived | port+month | monthly | 0..1 |
| port_lat | - | - | - | - | - | - | - | - | - |
| port_lon | - | - | - | - | - | - | - | - | - |
| sst_monthly_mean | NOAA SST monthly mean | float | degree_C | nceiPH53sstd1day | valid-range QC [-1.8,45] + time mean + x6 coarsen | observed-derived | 0.25deg | monthly | -1.8..45 |
| cmems_thetao | CMEMS potential temperature (surface, depth-collapsed) | float | deg C | GLOBAL_MULTIYEAR_PHY_001_030 monthly | time+depth mean + x3 coarsen + nearest join | observed-derived | 0.25deg | monthly | ocean only (land NaN) |
| cmems_so | CMEMS salinity (surface, depth-collapsed) | float | psu | same as thetao | same | observed-derived | 0.25deg | monthly | ocean only |
| cmems_uo | CMEMS eastward velocity (surface, depth-collapsed) | float | m/s | same | same | observed-derived | 0.25deg | monthly | ocean only |
| cmems_vo | CMEMS northward velocity (surface, depth-collapsed) | float | m/s | same | same | observed-derived | 0.25deg | monthly | ocean only |
| current_magnitude | current speed sqrt(uo^2+vo^2) | float | m/s | cmems_uo/vo | sqrt(uo^2+vo^2) | derived | 0.25deg | monthly | >=0 |
| in_india_mask | inside India EEZ+150nm mask | bool | - | india_mask.geojson MRGID 8480 | point-in-polygon | derived | 0.25deg | monthly | true/false |
| env_grid_lat | - | - | - | - | - | - | - | - | - |
| env_grid_lon | - | - | - | - | - | - | - | - | - |
| port_harbor_size | - | - | - | - | - | - | - | - | - |
| port_harbor_type | - | - | - | - | - | - | - | - | - |
| port_shelter | - | - | - | - | - | - | - | - | - |
| port_max_vessel | - | - | - | - | - | - | - | - | - |
| port_tide_range | - | - | - | - | - | - | - | - | - |
| leakage_note | - | - | - | - | - | - | - | - | - |

## Anti-fabrication notes
- WPI is a port REFERENCE, not traffic measurements.
- Port associations are INFERRED 50km proximity, not official port calls.
- traffic/congestion are DERIVED aggregates with documented formulas; components retained.
- waiting_time is UNAVAILABLE (see reports/target_availability_report.json).
- CMEMS NaN = land in GLORYS reanalysis (native coarsened non-null 0.5942).
- Temporal leakage: all joins same-month only.

## Port waiting time (genuine monthly means, Paradip 2023)
`data/ml/sagardrishti_port_waiting_time.parquet`

| column | description | type | unit | source | transformation | observed/derived | spatial | temporal | range |
|---|---|---|---|---|---|---|---|---|---|
| port_id | WPI index (49535 PARADIP) | int | - | WPI + PPA report match | exact name match | observed (reference) | point | static | 49535 |
| port_name | PARADIP | string | - | WPI | none | observed | point | static | - |
| unlocode | NA (absent from WPI snapshot schema; not invented) | null | - | - | none | unavailable | - | - | - |
| month | YYYY-MM | string | - | PDF FOR-THE-MONTH header |strftime | derived | port | monthly | 2023-04..2023-12 |
| vessel_count | vessels sailed that month (TOTAL) | int | count | PDF table | none | observed | port | monthly | >=1 |
| valid_waiting_events | vessels whose waiting contributed to mean (= sailed) | int | count | PDF table | documented equivalence | observed | port | monthly | >=1 |
| waiting_time_mean_hours | monthly mean pre-berthing waiting (TOTAL) | float | hours | PDF table | none | observed (authority-averaged) | port | monthly | 0.91..1.33 |
| waiting_time_median_hours | NA (means-only publication; not fabricated) | null | hours | - | none | unavailable | - | - | - |
| waiting_time_p25_hours | NA (same reason) | null | hours | - | none | unavailable | - | - | - |
| waiting_time_p75_hours | NA (same reason) | null | hours | - | none | unavailable | - | - | - |
| waiting_time_max_hours | NA (same reason) | null | hours | - | none | unavailable | - | - | - |
| source/method/coverage_start/coverage_end/provenance/by_type_detail | traceability fields | string | - | pipeline | none | derived | - | - | - |

## Master update
`waiting_time_mean_hours` (float, hours, TARGET, sparse 8/1548) + `waiting_target_provenance` (string). X_features = all non-waiting columns. Jun-2023 value retained verbatim with carryover flag.
