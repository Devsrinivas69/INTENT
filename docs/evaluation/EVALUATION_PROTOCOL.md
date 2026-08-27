# INTENT Guidance Accuracy & Grounding Evaluation Protocol

This document establishes the rigorous benchmarking protocol, mathematical metrics, and test matrix used to evaluate INTENT's UI-grounding accuracy.

---

## 1. Core Mathematical Metrics

### 1. Click Success Rate (CSR) — Primary Metric
A click is deemed successful if and only if the generated Intent Cursor anchor $(x_{\text{cursor}}, y_{\text{cursor}})$ falls strictly inside the ground-truth physical bounding box $B^* = [x^*, y^*, w^*, h^*]$:

$$\text{CSR} = \frac{1}{N} \sum_{i=1}^{N} \mathbb{I}\left( x_i^* \le x_{\text{cursor}, i} \le x_i^* + w_i^* \ \land \ y_i^* \le y_{\text{cursor}, i} \le y_i^* + h_i^* \right)$$

Target Production Standard: **$\ge 95.0\%$** across Canva and Excel tasks.

---

### 2. Bounding Box Intersection over Union (IoU)
Measures alignment between the detected UI control bounding box $B_{\text{pred}}$ and the true UI element box $B^*$:

$$\text{IoU}(B_{\text{pred}}, B^*) = \frac{\text{Area}(B_{\text{pred}} \cap B^*)}{\text{Area}(B_{\text{pred}} \cup B^*)}$$

- **Threshold for Success**: $\text{IoU} \ge 0.50$
- **Corroboration Threshold (Multi-Source Agreement)**: $\text{IoU} \ge 0.30$

---

### 3. State Verification Accuracy (SVA)
Evaluates whether the state transition engine correctly recognizes completion without false auto-advances:

$$\text{SVA} = \frac{TP + TN}{TP + TN + FP + FN}$$

- $TP$: Step finished $\to$ Verified as complete.
- $TN$: User did not act $\to$ Remains at `WAITING FOR USER`.
- $FP$: False completion without action (**Strictly 0% tolerance**).

---

## 2. Multi-Resolution & DPI Test Matrix

INTENT is evaluated across 5 screen resolutions and 4 Windows DPI scaling profiles:

| Resolution | Aspect Ratio | Tested DPI Scalings | Primary Use Case |
|---|---|---|---|
| **1920 × 1080** | 16:9 | 100%, 125%, 150% | Standard Desktop / Primary Monitor |
| **2560 × 1440** | 16:9 | 100%, 125%, 150% | High-DPI Desktop Monitors |
| **1366 × 768** | 16:9 | 100% | Laptop Compact Screens |
| **1280 × 720** | 16:9 | 100% | Low-resolution Embedded / Projector |
| **Dual Monitor (-1920, 0)** | 32:9 (Multi-mon) | Mixed 100% / 125% | Secondary Left/Right Workspaces |

---

## 3. Automated Benchmark Execution

To run the automated guidance evaluation test suite:

```powershell
python -X utf8 scripts/test_guidance.py
```

To run the automated system health and forbidden pattern audit:

```powershell
python -X utf8 scripts/audit_intent.py
```
