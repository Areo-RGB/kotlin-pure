import subprocess
import os
import sys
import platform

def run_command(command, cwd=None):
    """Runs a shell command and returns the output."""
    print(f"Running: {command}")
    try:
        result = subprocess.run(
            command,
            cwd=cwd,
            shell=True,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        print(f"Error executing command: {command}")
        print(e.stdout)
        print(e.stderr)
        sys.exit(1)

def get_connected_devices():
    """Returns a list of connected ADB device IDs."""
    output = run_command("adb devices")
    devices = []
    for line in output.splitlines()[1:]:
        if line.strip() and "\t" in line:
            device_id, state = line.split("\t")
            if state == "device":
                devices.append(device_id)
    return devices

def main():
    # 1. Determine project root and gradlew path
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    
    is_windows = platform.system() == "Windows"
    gradlew = "gradlew.bat" if is_windows else "./gradlew"
    gradlew_path = os.path.join(project_root, gradlew)

    print(f"Project Root: {project_root}")
    
    # 2. Build the APK
    print("\n--- Building APK ---")
    run_command(f"{gradlew_path} assembleDebug", cwd=project_root)
    
    apk_path = os.path.join(project_root, "app", "build", "outputs", "apk", "debug", "app-debug.apk")
    if not os.path.exists(apk_path):
        print(f"Error: APK not found at {apk_path}")
        sys.exit(1)
        
    print(f"APK built successfully: {apk_path}")

    # 3. Detect Devices
    print("\n--- Detecting Devices ---")
    devices = get_connected_devices()
    if not devices:
        print("No devices connected.")
        sys.exit(0)
        
    print(f"Found {len(devices)} devices: {', '.join(devices)}")

    # 4. Deploy and Sync
    print("\n--- Deploying & Syncing ---")
    
    # Remove any existing reverse port forwarding to avoid conflicts with the on-device server
    print("--- Cleaning up Port Forwarding ---")
    try:
        subprocess.run(["adb", "reverse", "--remove-all"], check=True)
        print("Reverse port forwarding removed.")
    except subprocess.CalledProcessError:
        print("Warning: Failed to remove reverse port forwarding.")

    for device_id in devices:
        print(f"\nProcessing device: {device_id}")
        
        # Install APK
        print(f"Installing APK...")
        run_command(f"adb -s {device_id} install -r \"{apk_path}\"")

    print("\n--- Deployment Complete ---")

if __name__ == "__main__":
    main()
