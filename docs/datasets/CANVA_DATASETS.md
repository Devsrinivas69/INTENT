# Canva Grounding Datasets & Internal Annotation Protocol

This document details the multi-source dataset and telemetry pipeline for the **Canva Web & Desktop** editor.

---

## 1. Public Grounding Corpora Applicable to Canva

| Dataset Name | Source / Platform | Relevance | Primary Feature Extracted |
|---|---|---|---|
| **ShowUI-Web** | Hugging Face (`showlab/ShowUI-web`) | 9.0 / 10 | Interactive web canvas, toolbar pills, and floating action button grounding |
| **GroundUI-18K** | Hugging Face (`agent-studio/GroundUI-18K`) | 8.5 / 10 | Natural language instruction $\to$ Web button bounding box |
| **Mind2Web** | Hugging Face (`osunlp/Mind2Web`) | 8.0 / 10 | Multi-step web application task trajectories |
| **VisualWebArena** | GitHub / WebArena Bench | 8.0 / 10 | Rich web creative application interaction patterns |
| **ScreenParse** | Hugging Face (`docling-project/screenparse`) | 7.5 / 10 | Left navigation bar, flyout tool cards, icon extraction |

---

## 2. Real-Time Telemetry: INTENT DOM Bridge

Because public datasets cannot capture Canva's continuous A/B testing and design updates in real time, INTENT deploys the **Canva DOM Bridge** (`browser_extension/`):

- **Real-Time Accuracy**: Extracts exact `getBoundingClientRect()` physical pixel coordinates from the live Chrome/Edge DOM tree.
- **Semantic Mapping**: Reads `aria-label`, `data-testid`, `role="button"`, and button text nodes.
- **DPI Scaling**: Multiplies DOM CSS coordinates by `window.devicePixelRatio` for exact hardware desktop pixel alignment.
- **Offline WebSocket**: Streamed locally to INTENT via `ws://127.0.0.1:18923` (zero cloud dependencies, read-only).

---

## 3. INTENT Internal Canva Annotation Dataset (`INTENT-GUI-CANVA`)

We maintain a dedicated evaluation and verification split for Canva workflows:

### Workflow 1: Remove Background
1. `STATE_0_INIT`: Canvas open with photograph $\to$ Target: `canva_canvas_image` (OpenCV contour / purple box).
2. `STATE_1_IMAGE_SELECTED`: Purple selection active $\to$ Target: `canva_edit_photo` (Top toolbar, $y \ge 110$).
3. `STATE_2_MAGIC_STUDIO_OPEN`: Magic Studio drawer open $\to$ Target: `canva_bg_remover` (Left panel card with crown).
4. `STATE_3_REMOVAL_APPLIED`: Subject cutout $\to$ Verification: `canvas_pixel_diff` ($>8\%$ visual delta).

### Workflow 2: Add Animation to Element
1. `STATE_0_INIT`: Canvas open $\to$ Target: `canva_canvas_image` / text header.
2. `STATE_1_OBJECT_SELECTED`: Context toolbar visible $\to$ Target: `canva_animate_button`.
3. `STATE_2_ANIMATION_PANEL_OPEN`: Left styles tab open $\to$ Target: `canva_animation_style_fade` / `canva_animation_style_pan`.
4. `STATE_3_ANIMATION_APPLIED`: Style pill selected $\to$ Verification: `animation_panel_ocr`.
