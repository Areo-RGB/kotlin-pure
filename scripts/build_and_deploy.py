#!/usr/bin/env python3
"""
Build and Deploy Script for NFC Android App
============================================
This script:
1. Builds the web app (vite build)
2. Copies build output to Capacitor www folder
3. Syncs Capacitor
4. Builds Android APK (debug)
5. Finds all connected ADB devices
6. Installs APK on all connected devices
"""

import subprocess
import os
import sys
import shutil
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

# Configuration
WEB_APP_DIR = Path("/home/nwender/nfc")
ANDROID_APP_DIR = Path("/home/nwender/android-app")
ANDROID_PROJECT_DIR = ANDROID_APP_DIR / "android"
WWW_DIR = ANDROID_APP_DIR / "www"
DIST_DIR = WEB_APP_DIR / "dist"
APK_PATH = ANDROID_PROJECT_DIR / "app" / "build" / "outputs" / "apk" / "debug" / "app-debug.apk"

# Colors for terminal output
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def print_step(step: int, message: str):
    print(f"\n{Colors.BOLD}{Colors.BLUE}[Step {step}]{Colors.ENDC} {Colors.CYAN}{message}{Colors.ENDC}")

def print_success(message: str):
    print(f"{Colors.GREEN}✓ {message}{Colors.ENDC}")

def print_error(message: str):
    print(f"{Colors.RED}✗ {message}{Colors.ENDC}")

def print_warning(message: str):
    print(f"{Colors.YELLOW}⚠ {message}{Colors.ENDC}")

def print_info(message: str):
    print(f"  {Colors.CYAN}→{Colors.ENDC} {message}")

def run_command(cmd: list, cwd: Path = None, capture_output: bool = False) -> subprocess.CompletedProcess:
    """Run a command and handle errors."""
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=capture_output,
            text=True,
            check=True
        )
        return result
    except subprocess.CalledProcessError as e:
        print_error(f"Command failed: {' '.join(cmd)}")
        if e.stdout:
            print(f"stdout: {e.stdout}")
        if e.stderr:
            print(f"stderr: {e.stderr}")
        raise

def get_connected_devices() -> list:
    """Get list of connected ADB devices."""
    result = subprocess.run(
        ["adb", "devices", "-l"],
        capture_output=True,
        text=True
    )

    devices = []
    lines = result.stdout.strip().split('\n')[1:]  # Skip header

    for line in lines:
        if line.strip() and 'device' in line and 'offline' not in line:
            parts = line.split()
            if len(parts) >= 1:
                device_id = parts[0]
                # Extract device model if available
                model = "Unknown"
                for part in parts:
                    if part.startswith("model:"):
                        model = part.split(":")[1]
                        break
                devices.append({"id": device_id, "model": model})

    return devices

def install_on_device(device: dict, apk_path: Path) -> tuple:
    """Install APK on a specific device. Returns (device_id, success, message)."""
    device_id = device["id"]
    device_model = device["model"]

    try:
        result = subprocess.run(
            ["adb", "-s", device_id, "install", "-r", str(apk_path)],
            capture_output=True,
            text=True,
            timeout=120  # 2 minute timeout
        )

        if result.returncode == 0 and "Success" in result.stdout:
            return (device_id, True, f"{device_model} ({device_id})")
        else:
            error_msg = result.stderr or result.stdout
            return (device_id, False, f"{device_model}: {error_msg.strip()}")

    except subprocess.TimeoutExpired:
        return (device_id, False, f"{device_model}: Installation timed out")
    except Exception as e:
        return (device_id, False, f"{device_model}: {str(e)}")

def build_web_app():
    """Build the Vite web app."""
    print_step(1, "Building web app (vite build)")

    # Check if pnpm is available, otherwise use npm
    package_manager = "pnpm" if shutil.which("pnpm") else "npm"
    print_info(f"Using {package_manager}")

    run_command([package_manager, "run", "build"], cwd=WEB_APP_DIR)

    if not DIST_DIR.exists():
        raise Exception(f"Build output not found at {DIST_DIR}")

    print_success("Web app built successfully")

def copy_to_www():
    """Copy build output to Capacitor www folder."""
    print_step(2, "Copying build to Capacitor www folder")

    # Clean www folder
    if WWW_DIR.exists():
        shutil.rmtree(WWW_DIR)

    # Copy dist to www
    shutil.copytree(DIST_DIR, WWW_DIR)

    print_success(f"Copied {DIST_DIR} → {WWW_DIR}")

def sync_capacitor():
    """Run Capacitor sync."""
    print_step(3, "Syncing Capacitor")

    run_command(["npx", "cap", "sync", "android"], cwd=ANDROID_APP_DIR)

    print_success("Capacitor synced")

def build_android():
    """Build Android APK (debug)."""
    print_step(4, "Building Android APK (debug)")

    gradlew = ANDROID_PROJECT_DIR / "gradlew"

    # Make gradlew executable
    os.chmod(gradlew, 0o755)

    run_command(["./gradlew", "assembleDebug"], cwd=ANDROID_PROJECT_DIR)

    if not APK_PATH.exists():
        raise Exception(f"APK not found at {APK_PATH}")

    # Get APK size
    apk_size = APK_PATH.stat().st_size / (1024 * 1024)  # MB
    print_success(f"APK built: {APK_PATH.name} ({apk_size:.1f} MB)")

def deploy_to_devices():
    """Find connected devices and install APK on all of them."""
    print_step(5, "Deploying to connected devices")

    devices = get_connected_devices()

    if not devices:
        print_warning("No devices connected. Connect devices via USB or WiFi ADB.")
        print_info("To connect via WiFi: adb connect <device-ip>:5555")
        return

    print_info(f"Found {len(devices)} device(s)")
    for device in devices:
        print_info(f"  • {device['model']} ({device['id']})")

    # Install on all devices in parallel
    print_info("Installing APK on all devices...")

    successful = []
    failed = []

    with ThreadPoolExecutor(max_workers=len(devices)) as executor:
        futures = {
            executor.submit(install_on_device, device, APK_PATH): device
            for device in devices
        }

        for future in as_completed(futures):
            device_id, success, message = future.result()
            if success:
                successful.append(message)
            else:
                failed.append(message)

    # Print results
    print()
    for msg in successful:
        print_success(f"Installed on {msg}")

    for msg in failed:
        print_error(f"Failed on {msg}")

    print()
    print_info(f"Results: {len(successful)} successful, {len(failed)} failed")

def main():
    print(f"\n{Colors.BOLD}{Colors.HEADER}╔══════════════════════════════════════════╗{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.HEADER}║     NFC App Build & Deploy Script        ║{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.HEADER}╚══════════════════════════════════════════╝{Colors.ENDC}")

    try:
        # Check prerequisites
        if not WEB_APP_DIR.exists():
            print_error(f"Web app directory not found: {WEB_APP_DIR}")
            sys.exit(1)

        if not ANDROID_APP_DIR.exists():
            print_error(f"Android app directory not found: {ANDROID_APP_DIR}")
            sys.exit(1)

        # Run build steps
        build_web_app()
        copy_to_www()
        sync_capacitor()
        build_android()
        deploy_to_devices()

        print(f"\n{Colors.BOLD}{Colors.GREEN}✓ Build and deploy completed!{Colors.ENDC}\n")

    except KeyboardInterrupt:
        print_warning("\nBuild cancelled by user")
        sys.exit(1)
    except Exception as e:
        print_error(f"\nBuild failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
