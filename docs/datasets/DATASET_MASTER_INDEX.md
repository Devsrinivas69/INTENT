# INTENT Dataset Master Index

This document catalogs and profiles all external datasets, benchmarks, and grounding corpora investigated for the INTENT multi-layer desktop guidance system.

---

## Source Hierarchy Protocol

To prevent corrupted or hallucinatory UI grounding:

1. **LEVEL 1**: Official Vendor Documentation (Microsoft Learn, Canva Help Center)
2. **LEVEL 2**: Educational / Interactive Guides & Live DOM Telemetry
3. **LEVEL 3**: Verified Research Grounding Datasets (GUI-360, ScreenParse, ShowUI, GroundUI)
4. **LEVEL 4**: Kaggle Datasets & Community Task Trajectories
5. **LEVEL 5**: Open-Source GitHub Projects & Agent Trajectories
6. **LEVEL 6**: Community Blogs & Video Tutorials
7. **LEVEL 7**: Synthetic Multi-Resolution Data Augmentation

---

## 1. GUI-360 (Microsoft Office & Excel Desktop Grounding)

- **NAME**: GUI-360
- **URL**: https://huggingface.co/datasets/vyokky/GUI-360 / https://huggingface.co/datasets/cua-lite/GUI-360
- **PLATFORM**: Hugging Face
- **SIZE**: ~45 GB (Multi-modal screenshot + trajectory archive)
- **SAMPLES**: 14,000+ cross-application task steps
- **LICENSE**: Apache-2.0 / CC-BY-4.0
- **CANVA RELEVANCE**: 2 / 10 (Primarily desktop native apps)
- **EXCEL RELEVANCE**: 10 / 10 (Highest priority for Microsoft Excel desktop tasks)
- **UI GROUNDING RELEVANCE**: 10 / 10
- **SCREENSHOTS**: Yes (High-resolution Windows desktop frames)
- **BOUNDING BOXES**: Yes (Normalized & absolute UI bounding boxes)
- **ACTIONS**: Yes (Click, Drag, Hotkey, Select, Type)
- **OCR**: Yes (Pre-extracted text tokens and layout bounds)
- **ACCESSIBILITY**: Yes (Windows UI Automation tree nodes aligned to clicks)
- **TASK TRAJECTORIES**: Yes (Complete start-to-finish multi-step workflows)
- **VERSION**: v1.2 (2024)
- **DOWNLOAD METHOD**: Python `huggingface_hub` selective stream (filter `app == 'excel'`)
- **RECOMMENDED USE**: Core grounding and state machine validation for Excel workflows.
- **RISKS**: Full dataset is large; must use selective downloading for Excel-only subsets.
- **SCORE**: **9.4 / 10**

---

## 2. ScreenParse (Dense Screen Parsing & UI Inventories)

- **NAME**: ScreenParse
- **URL**: https://huggingface.co/datasets/docling-project/screenparse
- **PLATFORM**: Hugging Face
- **SIZE**: ~18 GB
- **SAMPLES**: 85,000+ annotated screens
- **LICENSE**: MIT
- **CANVA RELEVANCE**: 7 / 10 (General web UI structure and controls)
- **EXCEL RELEVANCE**: 8 / 10 (Dense toolbars, tables, and button grids)
- **UI GROUNDING RELEVANCE**: 10 / 10
- **SCREENSHOTS**: Yes (Web & Desktop application viewports)
- **BOUNDING BOXES**: Yes (Complete non-overlapping polygon & rectangle masks)
- **ACTIONS**: No (Static parsing only)
- **OCR**: Yes (Integrated multi-engine text labels)
- **ACCESSIBILITY**: No
- **TASK TRAJECTORIES**: No
- **VERSION**: v2.0
- **DOWNLOAD METHOD**: Hugging Face `datasets` load with streaming
- **RECOMMENDED USE**: General UI inventory parsing, toolbar segmentation, and candidate extraction.
- **RISKS**: Lacks temporal action state transitions.
- **SCORE**: **8.8 / 10**

---

## 3. ShowUI-Web (Web Element Visual Grounding)

- **NAME**: ShowUI-Web / ShowUI-Desktop
- **URL**: https://huggingface.co/datasets/showlab/ShowUI-web
- **PLATFORM**: Hugging Face
- **SIZE**: ~22 GB
- **SAMPLES**: 120,000+ interactive web UI pairs
- **LICENSE**: Apache-2.0
- **CANVA RELEVANCE**: 9 / 10 (Directly matches modern web application paradigms like Canva)
- **EXCEL RELEVANCE**: 5 / 10 (Applies to Excel Online; less relevant for native Win32)
- **UI GROUNDING RELEVANCE**: 9.5 / 10
- **SCREENSHOTS**: Yes (Web application screens)
- **BOUNDING BOXES**: Yes (Precise click centers & bounding boxes)
- **ACTIONS**: Yes (Click point predictions)
- **OCR**: Yes
- **ACCESSIBILITY**: Yes (DOM element nodes)
- **TASK TRAJECTORIES**: Yes (Multi-turn web navigation)
- **VERSION**: v1.0 (2024)
- **DOWNLOAD METHOD**: Hugging Face `datasets`
- **RECOMMENDED USE**: Canva web editor toolbar and modal grounding.
- **RISKS**: Contains generic websites; requires filtering for rich web apps (Canva, Figma, Docs).
- **SCORE**: **8.9 / 10**

---

## 4. GroundUI-18K (Instruction-to-Bbox Grounding)

- **NAME**: GroundUI-18K
- **URL**: https://huggingface.co/datasets/agent-studio/GroundUI-18K
- **PLATFORM**: Hugging Face
- **SIZE**: ~8.5 GB
- **SAMPLES**: 18,000 instruction-screenshot-bbox tuples
- **LICENSE**: CC-BY-4.0
- **CANVA RELEVANCE**: 8 / 10
- **EXCEL RELEVANCE**: 8 / 10
- **UI GROUNDING RELEVANCE**: 10 / 10
- **SCREENSHOTS**: Yes
- **BOUNDING BOXES**: Yes (`[ymin, xmin, ymax, xmax]` normalized)
- **ACTIONS**: Yes (Click intention)
- **OCR**: Yes
- **ACCESSIBILITY**: Partial
- **TASK TRAJECTORIES**: Yes
- **VERSION**: v1.0
- **DOWNLOAD METHOD**: Direct Hugging Face download
- **RECOMMENDED USE**: Semantic query $\to$ bounding box evaluation benchmark.
- **RISKS**: Clean dataset; minimal risks.
- **SCORE**: **9.2 / 10**

---

## 5. GUI-Primitives (Spatial Reasoning & Relational Grounding)

- **NAME**: GUI-Primitives
- **URL**: https://huggingface.co/datasets/kagnlp/gui-primitives
- **PLATFORM**: Hugging Face
- **SIZE**: ~3.2 GB
- **SAMPLES**: 42,000 spatial relation triplets
- **LICENSE**: MIT
- **CANVA RELEVANCE**: 8 / 10 (Essential for 'above canvas', 'left sidebar', 'below toolbar')
- **EXCEL RELEVANCE**: 8 / 10 (Essential for 'inside Charts group', 'next to Home tab')
- **UI GROUNDING RELEVANCE**: 9 / 10
- **SCREENSHOTS**: Yes
- **BOUNDING BOXES**: Yes
- **ACTIONS**: Spatial verification tests
- **OCR**: Yes
- **ACCESSIBILITY**: No
- **TASK TRAJECTORIES**: No
- **VERSION**: v1.0
- **DOWNLOAD METHOD**: Hugging Face `datasets`
- **RECOMMENDED USE**: Spatial filter engine validation (e.g. rejecting targets outside `y >= win_y + 70`).
- **RISKS**: None.
- **SCORE**: **8.7 / 10**

---

## 6. Windows UI Synthetic (IndextDataLab/windows-ui-synth)

- **NAME**: Windows UI Synthetic
- **URL**: https://huggingface.co/datasets/IndextDataLab/windows-ui-synth
- **PLATFORM**: Hugging Face
- **SIZE**: ~4.1 GB
- **SAMPLES**: 25,000 synthetic Windows 10/11 desktop layouts
- **LICENSE**: Apache-2.0
- **CANVA RELEVANCE**: 3 / 10
- **EXCEL RELEVANCE**: 8.5 / 10 (Fluent UI ribbon controls, tabs, dialogs)
- **UI GROUNDING RELEVANCE**: 8 / 10
- **SCREENSHOTS**: Yes (1920x1080 synthetic desktop renders)
- **BOUNDING BOXES**: Yes (Pixel-exact bounding boxes)
- **ACTIONS**: No
- **OCR**: Yes
- **ACCESSIBILITY**: Yes (Synthetic UIA tags)
- **TASK TRAJECTORIES**: No
- **VERSION**: v1.0
- **DOWNLOAD METHOD**: Hugging Face `datasets`
- **RECOMMENDED USE**: Pre-training and validating Windows native UI object detectors.
- **RISKS**: Synthetic data distribution difference.
- **SCORE**: **7.9 / 10**

---

## 7. UI RefExp (Referring Expressions for UI Elements)

- **NAME**: UI RefExp
- **URL**: https://huggingface.co/datasets/ivelin/ui_refexp
- **PLATFORM**: Hugging Face
- **SIZE**: ~2.8 GB
- **SAMPLES**: 15,000 referring expression queries
- **LICENSE**: CC-BY-SA-4.0
- **CANVA RELEVANCE**: 7 / 10
- **EXCEL RELEVANCE**: 7 / 10
- **UI GROUNDING RELEVANCE**: 8.5 / 10
- **SCREENSHOTS**: Yes
- **BOUNDING BOXES**: Yes
- **ACTIONS**: Text-query grounding
- **OCR**: Yes
- **ACCESSIBILITY**: No
- **TASK TRAJECTORIES**: No
- **VERSION**: v1.0
- **DOWNLOAD METHOD**: Hugging Face `datasets`
- **RECOMMENDED USE**: RAG semantic query synonym matching and expression disambiguation.
- **RISKS**: None.
- **SCORE**: **8.2 / 10**
