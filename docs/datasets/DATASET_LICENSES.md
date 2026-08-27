# Dataset Licensing & Governance Register

Every dataset incorporated into the INTENT system is governed by strict open-source and commercial compliance rules.

---

## Licensing Matrix

| Dataset | Origin / Repository | Stated License | Commercial Use | Redistribution | Recommended Distribution Mode |
|---|---|---|---|---|---|
| **GUI-360** | `vyokky/GUI-360` | Apache-2.0 / CC-BY-4.0 | ✅ Permitted with attribution | ✅ Permitted | Selective subset ingestion; attribute authors |
| **ScreenParse** | `docling-project/screenparse` | MIT | ✅ Permitted | ✅ Permitted | Full local cache ingestion |
| **ShowUI-Web** | `showlab/ShowUI-web` | Apache-2.0 | ✅ Permitted with attribution | ✅ Permitted | Ingest web grounding subset |
| **GroundUI-18K** | `agent-studio/GroundUI-18K` | CC-BY-4.0 | ✅ Permitted with attribution | ✅ Permitted | Ingest benchmark subset |
| **GUI-Primitives** | `kagnlp/gui-primitives` | MIT | ✅ Permitted | ✅ Permitted | Ingest spatial validation rules |
| **Windows UI Synth** | `IndextDataLab/windows-ui-synth` | Apache-2.0 | ✅ Permitted with attribution | ✅ Permitted | Ingest desktop control templates |
| **UI RefExp** | `ivelin/ui_refexp` | CC-BY-SA-4.0 | ✅ Permitted (ShareAlike) | ✅ Permitted | Research & evaluation benchmark |
| **INTENT Telemetry** | Local DOM & UIA Captures | Proprietary / CC-BY-4.0 | ✅ Internal / Permitted | ✅ Permitted | Primary ground-truth authority |

---

## Governance Rules

1. **Research vs Production**: Datasets marked `RESEARCH_ONLY` are isolated in `tests/fixtures` and never bundled in binary installers.
2. **Attribution**: All derived training metadata contains source citations linking to original publication DOIs or Hugging Face repositories.
3. **No Unlicensed Scraping**: UI ontologies and state graphs are constructed from official vendor public documentation and user-consented desktop telemetry.
