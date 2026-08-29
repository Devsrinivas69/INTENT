import sys
import json
import os


def update_manifest_with_extension_id(extension_id: str):
    manifest_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__),
                     '..', 'python_helper', 'com.intent.native_host.json')
    )
    if not os.path.exists(manifest_path):
        print("[INTENT] Manifest not found. Run install_native_host.py first.")
        return False
    
    with open(manifest_path, 'r') as f:
        manifest = json.load(f)
    
    origin = f"chrome-extension://{extension_id}/"
    if origin not in manifest.get('allowed_origins', []):
        manifest['allowed_origins'] = [origin]
        with open(manifest_path, 'w') as f:
            json.dump(manifest, f, indent=2)
        print(f"[INTENT] Extension ID updated: {extension_id}")
    else:
        print(f"[INTENT] Extension ID already present: {extension_id}")
    return True


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python update_extension_id.py <extension_id>")
        sys.exit(1)
    success = update_manifest_with_extension_id(sys.argv[1].strip())
    sys.exit(0 if success else 1)
