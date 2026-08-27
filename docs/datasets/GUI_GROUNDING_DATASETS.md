# General GUI Grounding Datasets Benchmark

This document summarizes the general desktop and web GUI grounding benchmarks analyzed for the INTENT engine.

---

## Benchmark Comparison Matrix

| Dataset | Modality | Target Annotations | Bbox Format | Trajectories | Primary Utility in INTENT |
|---|---|---|---|---|---|
| **GUI-360** | Windows Desktop | Accessibility + Bbox + OCR | Physical `[x,y,w,h]` | Yes (Multi-step) | Native Excel workflow grounding & UIA node alignment |
| **ScreenParse** | Web + Desktop | Dense parsing masks | Absolute `[x,y,w,h]` | No (Static) | Full screen inventory segmentation & candidate generation |
| **ShowUI-Web** | Web Applications | Point clicks + Bbox | Normalized `[ymin, xmin, ymax, xmax]` | Yes (Web agent) | Canva web editor toolbar and modal grounding |
| **GroundUI-18K** | Multimodal GUI | NL Instruction $\to$ Bbox | Normalized `[ymin, xmin, ymax, xmax]` | Yes | Zero-shot intent query evaluation |
| **GUI-Primitives** | Synthetic Spatial | Spatial relations | Normalized `[ymin, xmin, ymax, xmax]` | No | Spatial constraint verification (above, below, inside) |
| **Windows UI Synth** | Windows 10/11 | Synthetic Fluent UI controls | Physical `[x,y,w,h]` | No | Native Windows control detection pre-training |
| **UI RefExp** | Cross-platform | Text referring expressions | Normalized `[ymin, xmin, ymax, xmax]` | No | Synonym and referring expression disambiguation |

---

## Integration into INTENT's 5-Tier Detection Hierarchy

```
Tier 2  DOM Bridge      ← Grounded via Canva Extension & ShowUI-Web DOM patterns
Tier 1  UIA             ← Grounded via GUI-360 & Windows UI Automation tree
Tier 3  WinRT OCR       ← Grounded via UI RefExp text referring expressions & WinRT OCR
Tier 4  OpenCV          ← Grounded via ScreenParse bounding contour & visual isolation
Tier 5  Gemini Vision   ← Semantic Disambiguation via GroundUI-18K multimodal prompting
```
