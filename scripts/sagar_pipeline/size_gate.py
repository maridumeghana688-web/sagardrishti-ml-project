"""Data-size gate: estimate BEFORE every large download; stop if over budget."""
from .config import STORAGE_BUDGET_GB
from .errors import StageStop


def print_estimate(*, source, dataset, variables, time_range, spatial_range,
                   est_compressed_gb, est_extracted_gb, est_processed_gb, est_ml_gb):
    print("SOURCE:           ", source)
    print("DATASET:          ", dataset)
    print("VARIABLES:        ", variables)
    print("TIME RANGE:       ", time_range)
    print("SPATIAL RANGE:    ", spatial_range)
    print(f"ESTIMATED SIZE:   compressed={est_compressed_gb:.2f}GB "
          f"extracted={est_extracted_gb:.2f}GB processed={est_processed_gb:.2f}GB "
          f"ml={est_ml_gb:.2f}GB (budget={STORAGE_BUDGET_GB:.1f}GB)")


def gate(*, source, dataset, est_final_gb, budget_gb: float = STORAGE_BUDGET_GB) -> None:
    """Raise StageStop if the estimate exceeds budget. Never silently proceed."""
    if est_final_gb > budget_gb:
        raise StageStop(
            source=source,
            error=f"Estimated {est_final_gb:.2f}GB exceeds {budget_gb:.1f}GB storage budget for {dataset}.",
            cause="Too many variables, too long a period, too fine a resolution, or too wide an area.",
            required_action=("Reduce variables, temporal range, or resolution, or tighten "
                            "the spatial subset — then re-run the size estimate."),
        )


def estimate_tabular_gb(n_rows: int, n_cols: int, bytes_per_value: float = 8.0,
                        parquet_ratio: float = 0.35) -> float:
    """Rough parquet size for a numeric table (conservative for strings)."""
    return n_rows * n_cols * bytes_per_value * parquet_ratio / 1e9


def estimate_grid_gb(n_lat: int, n_lon: int, n_time: int, n_vars: int,
                     bytes_per_value: float = 4.0, compress_ratio: float = 0.5) -> float:
    """Rough NetCDF/Zarr size for a float32 gridded product."""
    return n_lat * n_lon * n_time * n_vars * bytes_per_value * compress_ratio / 1e9
