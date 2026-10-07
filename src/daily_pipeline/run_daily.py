"""Entry point: python -m src.daily_pipeline.run_daily [--date YYYY-MM-DD]. Idempotent."""
import sys
from src.daily_pipeline import run_daily

if __name__ == "__main__":
    date = sys.argv[sys.argv.index("--date") + 1] if "--date" in sys.argv else None
    run_daily(date)
