# INTENT Offline Semantic RAG Architecture

This document describes the local, zero-cost Retrieval-Augmented Generation (RAG) system powering INTENT's semantic UI understanding and control disambiguation.

---

## 1. Architectural Philosophy: Zero API Cost & Full Offline Execution

INTENT's grounding pipeline must never depend on a paid cloud vector database or external embedding API for core operation.

The local RAG system uses:
- **Local Embedding Model**: `BAAI/bge-small-en-v1.5` (384-dim, fast CPU inference) or `all-MiniLM-L6-v2` via `sentence-transformers` / ONNX runtime.
- **Local Vector Index**: In-memory cosine similarity indexing with NumPy or FAISS (`IndexFlatIP`).
- **Semantic Corpus**:
  - `knowledge/canva/ui_ontology.json`
  - `knowledge/excel/ui_ontology.json`
  - `knowledge/canva/aliases.json`
  - `knowledge/excel/aliases.json`
  - `knowledge/excel/shortcuts.json`
  - Workflow state definitions and transition conditions

---

## 2. RAG Query Interfaces

The RAG engine exposes three core local Python & TypeScript queries:

### Query 1: Control Identification by User Intent
```python
find_control_by_intent(intent: str, app: str, current_state: str) -> list[ControlMatch]
```
Given *"I want to cut out the background of this photo"*, retrieves `canva_bg_remover` and `canva_edit_photo` with confidence scores and parent regions.

### Query 2: Visual Candidate Disambiguation
```python
disambiguate_candidates(target_semantic_name: str, detected_ocr_candidates: list) -> BestCandidate
```
When multiple buttons are detected on screen (e.g. `Edit`, `Edit photo`, `Magic Edit`), ranks candidates based on embedding similarity against registered ontology aliases and contextual spatial bounds.

### Query 3: State Mutation & Verification Condition Retrieval
```python
get_verification_rules(app: str, workflow_id: str, current_level: int) -> VerificationRule
```
Returns the exact visual and OCR conditions required before advancing to the next step.

---

## 3. Data Flow Diagram

```
User Voice / Text Request
          ↓
[Local BGE Embedding]
          ↓
[FAISS / Cosine Index Search]
          ↓
Matched Control Definition (Canonical, Aliases, Region, Action)
          ↓
Live Screen Capture & Parsing (UIA + OCR + DOM Bridge + OpenCV)
          ↓
Candidate Scoring & Spatial Verification
          ↓
Intent Cursor Anchor Locked
```
