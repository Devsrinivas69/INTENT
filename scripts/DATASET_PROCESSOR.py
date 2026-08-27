"""
INTENT Dataset Processor & Normalizer v1.0
Converts heterogeneous dataset annotations (GUI-360, ScreenParse, ShowUI, GroundUI-18K)
into the unified INTENT_DATA_SCHEMA.json standard format.
"""

import sys
import os
import json
import argparse
from typing import Dict, Any, List

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCHEMA_PATH = os.path.join(WORKSPACE_ROOT, 'INTENT_DATA_SCHEMA.json')


def normalize_record(raw: Dict[str, Any], source_dataset: str) -> Dict[str, Any]:
    """
    Map raw record format to INTENT standard schema.
    """
    res = raw.get('resolution', {'width': 1920, 'height': 1080})
    w_screen = res.get('width', 1920)
    h_screen = res.get('height', 1080)

    # Normalize Bbox to physical [x, y, width, height]
    raw_bbox = raw.get('bbox', [0, 0, 50, 50])
    if len(raw_bbox) == 4:
        # Check if normalized [ymin, xmin, ymax, xmax] (values <= 1.0)
        if all(0.0 <= v <= 1.0 for v in raw_bbox):
            ymin, xmin, ymax, xmax = raw_bbox
            phys_x = int(xmin * w_screen)
            phys_y = int(ymin * h_screen)
            phys_w = int((xmax - xmin) * w_screen)
            phys_h = int((ymax - ymin) * h_screen)
            phys_bbox = [phys_x, phys_y, phys_w, phys_h]
        else:
            phys_bbox = [int(v) for v in raw_bbox]
    else:
        phys_bbox = [0, 0, 100, 40]

    click_pt = raw.get('click_point', [
        int(phys_bbox[0] + phys_bbox[2] / 2),
        int(phys_bbox[1] + phys_bbox[3] / 2)
    ])

    return {
        "task": raw.get('task', 'generic_guidance'),
        "step": raw.get('step', 1),
        "application": raw.get('application', 'generic_gui'),
        "application_version": raw.get('application_version', 'Standard Release'),
        "instruction": raw.get('instruction', 'Click highlighted target'),
        "screen_before": raw.get('screen_before', ''),
        "screen_after": raw.get('screen_after', ''),
        "target": raw.get('target', 'Action Control'),
        "target_type": raw.get('target_type', 'button'),
        "parent_region": raw.get('parent_region', 'workspace'),
        "bbox": phys_bbox,
        "click_point": click_pt,
        "verification_condition": raw.get('verification_condition', 'Visual mutation on screen'),
        "verification_method": raw.get('verification_method', 'screen_diff'),
        "source": source_dataset,
        "source_url": raw.get('source_url', 'https://github.com/Devsrinivas69/INTENT'),
        "license": raw.get('license', 'Apache-2.0'),
        "resolution": {"width": w_screen, "height": h_screen},
        "dpi": raw.get('dpi', '100%'),
        "confidence": raw.get('confidence', 0.95),
        "metadata": raw.get('metadata', {})
    }


def process_dataset(input_file: str, output_file: str, source_name: str):
    if not os.path.exists(input_file):
        print(f"[WARN] Input file not found: {input_file}")
        return

    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    items = data if isinstance(data, list) else data.get('samples', [])
    processed = [normalize_record(item, source_name) for item in items]

    os.makedirs(os.path.dirname(os.path.abspath(output_file)), exist_ok=True)
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(processed, f, indent=2)

    print(f"[OK] Processed {len(processed)} samples -> {output_file}")


def main():
    parser = argparse.ArgumentParser(description="INTENT Dataset Normalizer")
    parser.add_argument('--input', type=str, help="Raw input JSON file")
    parser.add_argument('--output', type=str, help="Normalized output JSON file")
    parser.add_argument('--source', type=str, default='GUI-360', help="Source dataset name")
    args = parser.parse_args()

    if args.input and args.output:
        process_dataset(args.input, args.output, args.source)
    else:
        print("[*] Running built-in test normalizer on synthetic fixture...")
        sample_fixture = [{
            "task": "create_chart",
            "step": 2,
            "application": "excel",
            "instruction": "Click the Insert tab in the ribbon",
            "target": "Insert tab",
            "target_type": "tab",
            "bbox": [0.04, 0.06, 0.08, 0.12],  # Normalized [ymin, xmin, ymax, xmax]
            "resolution": {"width": 1920, "height": 1080}
        }]
        norm = normalize_record(sample_fixture[0], "GUI-360")
        print("Normalized Output:\n", json.dumps(norm, indent=2))


if __name__ == '__main__':
    main()
