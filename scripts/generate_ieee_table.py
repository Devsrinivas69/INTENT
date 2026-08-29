"""
Aggregates multiple DPI test JSON files and generates
IEEE paper Table II in both text and LaTeX format.

Usage:
  python scripts/generate_ieee_table.py scripts/dpi_test_*.json
"""

import sys
import json
import glob


def load_results(patterns):
    results = []
    for pattern in patterns:
        for path in glob.glob(pattern):
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    results.append(data)
            except Exception as e:
                print(f"[WARN] Could not load {path}: {e}")
    return sorted(results, key=lambda r: r.get('dpi_percent', 100))


def generate_latex_table(results):
    """Generate LaTeX table for IEEE paper."""
    apps = set()
    for r in results:
        apps.update(r.get('summary', {}).keys())
    apps = sorted(apps)

    dpis = sorted(set(r.get('dpi_percent', 100) for r in results))

    lines = []
    lines.append(r"\begin{table}[h]")
    lines.append(r"\centering")
    lines.append(r"\caption{Target Detection Accuracy Across DPI Scaling Settings}")
    lines.append(r"\label{tab:dpi_accuracy}")

    col_spec = "l" + "c" * len(dpis)
    lines.append(r"\begin{tabular}{" + col_spec + "}")
    lines.append(r"\hline")
    lines.append(r"\textbf{Application} & " +
                 " & ".join(f"\\textbf{{{d}\\%}}" for d in dpis) +
                 r" \\")
    lines.append(r"\hline")

    for app in apps:
        row_vals = []
        for dpi in dpis:
            matching = [
                r.get('summary', {}).get(app, {}).get('detection_rate_pct')
                for r in results
                if r.get('dpi_percent') == dpi and app in r.get('summary', {})
            ]
            rate = max(matching) if matching else None
            row_vals.append(f"{rate:.1f}\\%" if rate is not None else "N/A")
        lines.append(f"{app.capitalize()} & " + " & ".join(row_vals) + r" \\")

    lines.append(r"\hline")
    lines.append(r"\end{tabular}")
    lines.append(r"\end{table}")
    return "\n".join(lines)


def print_ascii_table(results):
    apps = sorted(set(app for r in results for app in r.get('summary', {}).keys()))
    dpis = sorted(set(r.get('dpi_percent', 100) for r in results))

    header = f"{'Application':<16}" + "".join(f"{str(d)+'%':>10}" for d in dpis)
    print("=" * len(header))
    print(header)
    print("-" * len(header))

    for app in apps:
        row = f"{app.capitalize():<16}"
        for dpi in dpis:
            matching = [
                r.get('summary', {}).get(app, {}).get('detection_rate_pct')
                for r in results
                if r.get('dpi_percent') == dpi and app in r.get('summary', {})
            ]
            rate = max(matching) if matching else None
            row += f"{str(rate)+'%' if rate is not None else 'N/A':>10}"
        print(row)
    print("=" * len(header))


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

    if len(sys.argv) < 2:
        print("Usage: python generate_ieee_table.py <json_files...>")
        sys.exit(1)

    results = load_results(sys.argv[1:])
    if not results:
        print("No result files found.")
        sys.exit(1)

    print("\n=== IEEE Paper -- Table II (Text) ===\n")
    print_ascii_table(results)

    print("\n=== IEEE Paper -- Table II (LaTeX) ===\n")
    print(generate_latex_table(results))


if __name__ == '__main__':
    main()
