#!/usr/bin/env python3
"""
ADB Logger - Captures Android device logs via adb logcat to file.

Usage:
    python scripts/adb_logger.py [options]

Examples:
    python scripts/adb_logger.py --device pixel7
    python scripts/adb_logger.py -o logs/app.log -d pixel7 --max-size 50 --max-files 5
    python scripts/adb_logger.py --filter "MyApp:D *:S" --clear
    python scripts/adb_logger.py --clean  # Delete all old logs first
"""

import subprocess
import sys
import argparse
import signal
import shutil
from datetime import datetime
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional, List
from enum import Enum


# ============================================================================
# Constants
# ============================================================================

DEFAULT_OUTPUT = "logs/adb_logcat.log"
DEFAULT_DEVICE = "pixel7"
DEFAULT_MAX_FILES = 5
ADB_TIMEOUT = 10
FLUSH_INTERVAL = 100
PIXEL_7_IDENTIFIERS = frozenset({"pixel 7", "panther", "cheetah", "pixel 7 pro"})


class LogcatBuffer(Enum):
    MAIN = "main"
    SYSTEM = "system"
    CRASH = "crash"
    EVENTS = "events"
    ALL = "all"


class LogcatFormat(Enum):
    BRIEF = "brief"
    TIME = "time"
    THREADTIME = "threadtime"
    LONG = "long"


# ============================================================================
# Data Classes
# ============================================================================

@dataclass
class DeviceInfo:
    serial: str
    model: str = "Unknown"
    manufacturer: str = "Unknown"
    android_version: str = "Unknown"

    @property
    def display_name(self) -> str:
        parts = [self.manufacturer, self.model]
        return " ".join(p for p in parts if p and p != "Unknown") or "Unknown Device"

    def is_pixel_7(self) -> bool:
        return any(x in self.model.lower() for x in PIXEL_7_IDENTIFIERS)


@dataclass
class LoggerStats:
    start_time: datetime = field(default_factory=datetime.now)
    line_count: int = 0
    rotations: int = 0
    files_deleted: int = 0

    @property
    def duration_seconds(self) -> float:
        return (datetime.now() - self.start_time).total_seconds()


# ============================================================================
# ADB Utilities
# ============================================================================

def run_adb(args: List[str], device: Optional[str] = None, timeout: int = ADB_TIMEOUT) -> subprocess.CompletedProcess:
    cmd = ["adb"]
    if device:
        cmd.extend(["-s", device])
    cmd.extend(args)
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def check_adb_available() -> bool:
    if shutil.which("adb") is None:
        return False
    try:
        return subprocess.run(["adb", "version"], capture_output=True, timeout=5).returncode == 0
    except (subprocess.SubprocessError, FileNotFoundError):
        return False


def get_connected_devices() -> List[str]:
    try:
        result = run_adb(["devices"], timeout=5)
        if result.returncode != 0:
            return []
        devices = []
        for line in result.stdout.strip().split("\n")[1:]:
            if "\tdevice" in line:
                serial = line.split("\t")[0].strip()
                if serial:
                    devices.append(serial)
        return devices
    except subprocess.SubprocessError:
        return []


def get_device_info(serial: str) -> DeviceInfo:
    info = DeviceInfo(serial=serial)
    try:
        result = run_adb(["shell", "getprop"], device=serial)
        if result.returncode != 0:
            return info

        props = {
            "ro.product.model": "model",
            "ro.product.manufacturer": "manufacturer",
            "ro.build.version.release": "android_version",
        }

        for line in result.stdout.split("\n"):
            if "]: [" not in line:
                continue
            for key, attr in props.items():
                if f"[{key}]" in line:
                    try:
                        value = line.split("]: [", 1)[1].rstrip("]")
                        if value:
                            setattr(info, attr, value)
                    except (IndexError, ValueError):
                        pass
                    break
        return info
    except subprocess.SubprocessError:
        return info


def resolve_device(device_spec: Optional[str]) -> Optional[str]:
    devices = get_connected_devices()
    if not devices:
        return None

    if not device_spec:
        return devices[0] if len(devices) == 1 else None

    if device_spec.lower() == "pixel7":
        for serial in devices:
            info = get_device_info(serial)
            if info.is_pixel_7():
                print(f"Found Pixel 7: {serial} ({info.display_name})")
                return serial
        return None

    return device_spec if device_spec in devices else None


def list_devices() -> None:
    devices = get_connected_devices()
    if not devices:
        print("No devices connected.")
        return

    print(f"\nConnected devices ({len(devices)}):")
    print("=" * 60)
    for serial in devices:
        info = get_device_info(serial)
        tag = " [Pixel 7]" if info.is_pixel_7() else ""
        print(f"{serial}{tag}\n  {info.display_name} (Android {info.android_version})\n")


# ============================================================================
# Log File Management
# ============================================================================

def get_rotated_logs(base_path: Path) -> List[Path]:
    """Get all rotated log files sorted by modification time (oldest first)."""
    pattern = f"{base_path.stem}.*{base_path.suffix}"
    logs = list(base_path.parent.glob(pattern))
    return sorted(logs, key=lambda p: p.stat().st_mtime)


def delete_old_logs(base_path: Path, max_files: int) -> int:
    """Delete oldest rotated logs to keep only max_files. Returns count deleted."""
    rotated = get_rotated_logs(base_path)
    deleted = 0

    # Keep max_files - 1 rotated files (plus current file = max_files total)
    while len(rotated) >= max_files:
        oldest = rotated.pop(0)
        try:
            oldest.unlink()
            deleted += 1
            print(f"Deleted old log: {oldest.name}")
        except OSError as e:
            print(f"Warning: Could not delete {oldest}: e", file=sys.stderr)

    return deleted


def clean_all_logs(base_path: Path) -> int:
    """Delete all rotated log files. Returns count deleted."""
    rotated = get_rotated_logs(base_path)
    deleted = 0

    for log_file in rotated:
        try:
            log_file.unlink()
            deleted += 1
        except OSError:
            pass

    # Also delete main log if exists
    if base_path.exists():
        try:
            base_path.unlink()
            deleted += 1
        except OSError:
            pass

    return deleted


def rotate_log(base_path: Path, max_files: int) -> Optional[Path]:
    """Rotate log file and clean up old files. Returns new backup path."""
    if not base_path.exists():
        return None

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_name = f"{base_path.stem}.{timestamp}{base_path.suffix}"
    backup_path = base_path.parent / backup_name

    try:
        base_path.rename(backup_path)
        delete_old_logs(base_path, max_files)
        return backup_path
    except OSError as e:
        print(f"Warning: Rotation failed: {e}", file=sys.stderr)
        return None


# ============================================================================
# ADB Logger
# ============================================================================

class ADBLogger:
    def __init__(
        self,
        output_file: str,
        device_serial: Optional[str] = None,
        filter_spec: Optional[str] = None,
        clear_buffer: bool = False,
        buffer: LogcatBuffer = LogcatBuffer.MAIN,
        log_format: LogcatFormat = LogcatFormat.THREADTIME,
        max_size_mb: Optional[float] = None,
        max_files: int = DEFAULT_MAX_FILES,
        show_output: bool = False,
    ):
        self.output_file = Path(output_file)
        self.device_serial = device_serial
        self.filter_spec = filter_spec
        self.clear_buffer = clear_buffer
        self.buffer = buffer
        self.log_format = log_format
        self.max_size_mb = max_size_mb
        self.max_files = max_files
        self.show_output = show_output

        self._process: Optional[subprocess.Popen] = None
        self._running = False
        self._stats = LoggerStats()
        self._device_info: Optional[DeviceInfo] = None

    @property
    def stats(self) -> LoggerStats:
        return self._stats

    def _should_rotate(self) -> bool:
        if self.max_size_mb is None or not self.output_file.exists():
            return False
        size_mb = self.output_file.stat().st_size / (1024 * 1024)
        return size_mb >= self.max_size_mb

    def _build_command(self) -> List[str]:
        cmd = ["adb"]
        if self.device_serial:
            cmd.extend(["-s", self.device_serial])

        cmd.extend([
            "logcat",
            "-v", self.log_format.value,
            "-b", self.buffer.value,
        ])

        if self.filter_spec:
            cmd.extend(self.filter_spec.split())

        return cmd

    def _write_header(self, file) -> None:
        lines = [
            f"\n{'=' * 80}",
            f"Session Started: {self._stats.start_time:%Y-%m-%d %H:%M:%S}",
        ]
        if self._device_info:
            lines.append(f"Device: {self._device_info.display_name} ({self._device_info.serial})")
        if self.filter_spec:
            lines.append(f"Filter: {self.filter_spec}")
        lines.append(f"{'=' * 80}\n")
        file.write("\n".join(lines))
        file.flush()

    def _write_footer(self, file) -> None:
        duration = self._stats.duration_seconds
        lines = [
            f"\n{'=' * 80}",
            f"Session Ended: {datetime.now():%Y-%m-%d %H:%M:%S}",
            f"Duration: {duration:.1f}s | Lines: {self._stats.line_count:,} | "
            f"Rotations: {self._stats.rotations} | Deleted: {self._stats.files_deleted}",
            f"{'=' * 80}\n",
        ]
        file.write("\n".join(lines))

    def _print_banner(self) -> None:
        print(f"\n{'=' * 60}")
        print("ADB Logger Started")
        print(f"{'=' * 60}")
        print(f"Time:   {self._stats.start_time:%Y-%m-%d %H:%M:%S}")
        if self._device_info:
            print(f"Device: {self._device_info.display_name} ({self._device_info.serial})")
        print(f"Output: {self.output_file}")
        if self.filter_spec:
            print(f"Filter: {self.filter_spec}")
        if self.max_size_mb:
            print(f"Rotate: {self.max_size_mb} MB (keep {self.max_files} files)")
        print(f"{'=' * 60}")
        print("\nPress Ctrl+C to stop...\n")

    def _print_summary(self) -> None:
        s = self._stats
        print(f"\n{'=' * 60}")
        print("ADB Logger Stopped")
        print(f"{'=' * 60}")
        print(f"Duration: {s.duration_seconds:.1f}s | Lines: {s.line_count:,}")
        if s.rotations > 0 or s.files_deleted > 0:
            print(f"Rotations: {s.rotations} | Files deleted: {s.files_deleted}")
        print(f"Output: {self.output_file}")
        print(f"{'=' * 60}\n")

    def start(self) -> None:
        self.output_file.parent.mkdir(parents=True, exist_ok=True)
        self._stats = LoggerStats()

        if self.device_serial:
            self._device_info = get_device_info(self.device_serial)

        self._print_banner()

        if self.clear_buffer:
            print("Clearing logcat buffer...")
            run_adb(["logcat", "-c"], device=self.device_serial, timeout=5)

        # Initial rotation check
        if self._should_rotate():
            if rotate_log(self.output_file, self.max_files):
                self._stats.rotations += 1

        cmd = self._build_command()

        try:
            with open(self.output_file, "a", encoding="utf-8", buffering=1) as log_file:
                self._write_header(log_file)

                self._process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    bufsize=1,
                )
                self._running = True

                for line in self._process.stdout:
                    if not self._running:
                        break

                    log_file.write(line)
                    self._stats.line_count += 1

                    if self.show_output:
                        print(line, end="")

                    if self._stats.line_count % FLUSH_INTERVAL == 0:
                        log_file.flush()
                        print(f"\rLogged {self._stats.line_count:,} lines...", end="", flush=True)

                        # Check rotation
                        if self._should_rotate():
                            self._write_footer(log_file)
                            log_file.flush()

                            if rotate_log(self.output_file, self.max_files):
                                self._stats.rotations += 1
                                # Reopen file handled by context manager on next iteration
                                log_file.truncate(0)
                                log_file.seek(0)
                                self._write_header(log_file)

                self._write_footer(log_file)

        except KeyboardInterrupt:
            print("\n\nStopping...")
        finally:
            self.stop()

    def stop(self) -> None:
        if not self._running:
            return

        self._running = False

        if self._process:
            try:
                self._process.terminate()
                self._process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self._process.kill()
            except Exception:
                pass
            self._process = None

        self._print_summary()


# ============================================================================
# Signal Handling
# ============================================================================

_logger: Optional[ADBLogger] = None


def _signal_handler(signum: int, frame) -> None:
    print(f"\nReceived signal {signum}...")
    if _logger:
        _logger.stop()
    sys.exit(0)


# ============================================================================
# CLI
# ============================================================================

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Capture Android logs via adb logcat",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --device pixel7
  %(prog)s -o logs/app.log --max-size 50 --max-files 3
  %(prog)s --filter "MyApp:D *:S" --clear
  %(prog)s --clean --device pixel7

Filter: tag:priority (V=Verbose, D=Debug, I=Info, W=Warn, E=Error, S=Silent)
  Example: "MyApp:D ActivityManager:I *:S"
        """,
    )

    parser.add_argument("-o", "--output", default=DEFAULT_OUTPUT, help=f"Output file (default: {DEFAULT_OUTPUT})")
    parser.add_argument("-d", "--device", default=DEFAULT_DEVICE, help='Device serial or "pixel7"')
    parser.add_argument("-f", "--filter", help='Logcat filter (e.g., "MyApp:D *:S")')
    parser.add_argument("-c", "--clear", action="store_true", help="Clear buffer before starting")
    parser.add_argument("-b", "--buffer", choices=[b.value for b in LogcatBuffer], default="main", help="Buffer")
    parser.add_argument("--format", choices=[f.value for f in LogcatFormat], default="threadtime", help="Format")
    parser.add_argument("--max-size", type=float, metavar="MB", help="Rotate log at this size (MB)")
    parser.add_argument("--max-files", type=int, default=DEFAULT_MAX_FILES, help=f"Max rotated files (default: {DEFAULT_MAX_FILES})")
    parser.add_argument("-s", "--show", action="store_true", help="Also print to console")
    parser.add_argument("-l", "--list-devices", action="store_true", help="List devices and exit")
    parser.add_argument("--clean", action="store_true", help="Delete all old logs before starting")

    args = parser.parse_args()

    if not check_adb_available():
        print("Error: adb not found. Install Android SDK Platform-Tools.", file=sys.stderr)
        return 1

    if args.list_devices:
        list_devices()
        return 0

    output_path = Path(args.output)

    # Clean old logs if requested
    if args.clean:
        deleted = clean_all_logs(output_path)
        print(f"Cleaned {deleted} log file(s).")

    device_serial = resolve_device(args.device)
    if not device_serial:
        devices = get_connected_devices()
        if not devices:
            print("Error: No devices connected.", file=sys.stderr)
        else:
            print(f"Error: Device '{args.device}' not found.", file=sys.stderr)
            print("Connected:", ", ".join(devices), file=sys.stderr)
        return 1

    global _logger
    _logger = ADBLogger(
        output_file=args.output,
        device_serial=device_serial,
        filter_spec=args.filter,
        clear_buffer=args.clear,
        buffer=LogcatBuffer(args.buffer),
        log_format=LogcatFormat(args.format),
        max_size_mb=args.max_size,
        max_files=args.max_files,
        show_output=args.show,
    )

    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    try:
        _logger.start()
        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
