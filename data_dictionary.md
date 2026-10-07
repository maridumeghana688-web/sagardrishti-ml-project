# SAGARDRISHTI ML outputs

{
  "vessel_activity": {
    "status": "TARGET NOT DERIVABLE (GFW stage did not complete)"
  },
  "environment": {
    "rows": 604800,
    "bbox_count": 604800,
    "mask_count": 234936,
    "mask_fraction_of_bbox": 0.3885,
    "time_range": [
      "2021-01",
      "2023-12"
    ],
    "spatial_resolution": "0.25deg monthly means (NOAA coarsened x6 from 0.0417deg daily; CMEMS x3 from 0.083deg)",
    "missing_fraction_noaa_sst": 0.2851,
    "valid_range_qc": "dropped sst outside [-1.8, 45]C contract before averaging",
    "caveat": "L3C unmasked: residual cloud cold-bias possible; quality flags not served; CMEMS thetao is the primary complementary temperature feature",
    "cmems": {
      "status": "SKIPPED (Copernicus stage did not complete)"
    },
    "leakage": "PASS (monthly means of contemporaneous obs only)"
  }
}