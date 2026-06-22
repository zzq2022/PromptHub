import sys
from datetime import datetime
from pathlib import Path

class Tee:
    def __init__(self, original_stream, log_file_path: Path):
        self.original_stream = original_stream
        self.log_file_path = log_file_path

    def write(self, data):
        self.original_stream.write(data)
        self.original_stream.flush()
        if data:
            try:
                with open(self.log_file_path, "a", encoding="utf-8") as f:
                    f.write(data)
            except Exception:
                pass

    def flush(self):
        self.original_stream.flush()

    def __getattr__(self, attr):
        return getattr(self.original_stream, attr)


def setup_gateway_logging(workspace: Path):
    """Sets up the Tee logger for the gateway, using a date-based log filename."""
    logs_dir = workspace / "logs"
    logs_dir.mkdir(exist_ok=True)
    
    # Generate date-based filename: run_gateway_YYYY-MM-DD.log
    date_str = datetime.now().strftime("%Y-%m-%d")
    log_file = logs_dir / f"run_gateway_{date_str}.log"

    sys.stdout = Tee(sys.stdout, log_file)
    sys.stderr = Tee(sys.stderr, log_file)
    print(f"[📝 Logging] Logs are being captured and appended to: {log_file}")
