# Microsoft Excel Grounding Datasets & UI Automation Protocol

This document details the multi-source dataset and telemetry pipeline for **Microsoft Excel** desktop on Windows.

---

## 1. Public Grounding Corpora Applicable to Excel

| Dataset Name | Source / Platform | Relevance | Primary Feature Extracted |
|---|---|---|---|
| **GUI-360** | Hugging Face (`vyokky/GUI-360`) | 10 / 10 | Microsoft Office / Excel Windows task trajectories, accessibility trees, and click bounding boxes |
| **Windows UI Synth** | Hugging Face (`IndextDataLab/windows-ui-synth`) | 8.5 / 10 | Windows 10/11 Fluent UI ribbon tabs, groups, command buttons, dialog windows |
| **GroundUI-18K** | Hugging Face (`agent-studio/GroundUI-18K`) | 8.0 / 10 | Natural language command $\to$ spreadsheet cell range / ribbon button bounding box |
| **ScreenParse** | Hugging Face (`docling-project/screenparse`) | 8.0 / 10 | Dense spreadsheet grid layout, column headers, row numbers, formula bar |
| **UI RefExp** | Hugging Face (`ivelin/ui_refexp`) | 7.5 / 10 | Referring expressions for ribbon controls (e.g. 'Recommended Charts in the Insert tab') |

---

## 2. Real-Time Telemetry: Windows UI Automation (UIA) & WinRT OCR

For native Excel desktop automation on Windows, INTENT leverages direct OS telemetry:

- **Accessibility Tree (`uiautomation` / `pywin32`)**: Queries exact `BoundingRectangle` for ribbon tabs (`UIA_TabItemControlTypeId`), buttons (`UIA_ButtonControlTypeId`), and cell groups.
- **Hardware-Accelerated WinRT OCR**: Instant offline text localization across ribbon galleries and formula bar.
- **DPI Aware Coordinate Mapping**: Converts physical desktop hardware pixels to Electron overlay CSS space using active display scaling factors.

---

## 3. INTENT Internal Excel Annotation Dataset (`INTENT-GUI-EXCEL`)

### Workflow: Create Chart from Data
1. `STATE_0_INIT`: Excel workbook open with data table $\to$ Target: `excel_cell_range` (`UIA_DataItemControlTypeId`).
2. `STATE_1_RANGE_SELECTED`: Cells highlighted $\to$ Target: `excel_insert_tab` (Top ribbon tab row, `UIA_TabItemControlTypeId`).
3. `STATE_2_INSERT_RIBBON_ACTIVE`: Insert tab active $\to$ Target: `excel_recommended_charts` / `excel_column_bar_chart` (Charts group).
4. `STATE_3_CHART_INSERTED`: Chart rendered on sheet $\to$ Verification: `excel_chart_object` (`UIA_PaneControlTypeId`) + 'Chart Design' contextual ribbon tab.
