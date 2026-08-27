"""
INTENT Offline Semantic RAG Engine v1.0
Zero-cost, local retrieval and semantic UI disambiguation engine for Canva and Excel.
Uses token overlap, synonym matching, and semantic alias resolution.
"""

import sys
import os
import json
import re
from typing import List, Dict, Any, Optional

WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CANVA_ONTOLOGY_PATH = os.path.join(WORKSPACE_ROOT, 'knowledge', 'canva', 'ui_ontology.json')
EXCEL_ONTOLOGY_PATH = os.path.join(WORKSPACE_ROOT, 'knowledge', 'excel', 'ui_ontology.json')
CANVA_ALIASES_PATH = os.path.join(WORKSPACE_ROOT, 'knowledge', 'canva', 'aliases.json')
EXCEL_ALIASES_PATH = os.path.join(WORKSPACE_ROOT, 'knowledge', 'excel', 'aliases.json')

SYNONYM_MAP = {
    'cut out': 'background remover',
    'remove bg': 'background remover',
    'transparent': 'background remover',
    'erase background': 'background remover',
    'bar chart': 'column chart',
    'graph': 'chart',
    'table data': 'cell range',
}


def normalize_text(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r'[^\w\s]', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    return text


class SemanticRAGEngine:
    def __init__(self):
        self.ontologies: Dict[str, Any] = {}
        self.aliases: Dict[str, Dict[str, List[str]]] = {}
        self.index_records: List[Dict[str, Any]] = []
        self._load_knowledge()

    def _load_knowledge(self):
        """Load Canva and Excel ontologies and alias registers into memory."""
        for app, path in [('canva', CANVA_ONTOLOGY_PATH), ('excel', EXCEL_ONTOLOGY_PATH)]:
            if os.path.exists(path):
                with open(path, 'r', encoding='utf-8') as f:
                    self.ontologies[app] = json.load(f)

        for app, path in [('canva', CANVA_ALIASES_PATH), ('excel', EXCEL_ALIASES_PATH)]:
            if os.path.exists(path):
                with open(path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.aliases[app] = data.get('aliases', {})

        self._build_index()

    def _build_index(self):
        """Construct inverted text index for fast semantic lookup."""
        self.index_records = []
        for app, data in self.ontologies.items():
            for ctrl in data.get('controls', []):
                doc_terms = [ctrl.get('canonical_name', '')]
                doc_terms.extend(ctrl.get('aliases', []))
                for feat in ctrl.get('visual_features', []):
                    doc_terms.append(feat)

                cleaned_terms = [normalize_text(t) for t in doc_terms if t]
                self.index_records.append({
                    'id': ctrl.get('id'),
                    'app': app,
                    'canonical_name': ctrl.get('canonical_name'),
                    'element_type': ctrl.get('element_type'),
                    'parent_region': ctrl.get('parent_region'),
                    'aliases': ctrl.get('aliases', []),
                    'terms': cleaned_terms,
                    'raw_control': ctrl,
                })

    def _match_score(self, query: str, terms: List[str]) -> float:
        q_norm = normalize_text(query)
        # Check synonym expansion
        for syn_k, syn_v in SYNONYM_MAP.items():
            if syn_k in q_norm:
                q_norm += f" {syn_v}"

        q_words = [w for w in q_norm.split() if len(w) > 2 and w not in {'the', 'and', 'for', 'with', 'from', 'this', 'that', 'you', 'want'}]
        if not q_words:
            return 0.0

        best_score = 0.0
        for term in terms:
            t_words = set(term.split())
            if not t_words:
                continue

            # Substring match
            if q_norm in term or term in q_norm:
                best_score = max(best_score, 0.90)

            # Word match
            matched = sum(1 for w in q_words if w in t_words)
            if matched > 0:
                score = (matched / len(q_words)) * 0.85
                best_score = max(best_score, score)

        return min(1.0, best_score)

    def find_control_by_intent(self, query: str, app: Optional[str] = None) -> List[Dict[str, Any]]:
        """Query RAG index with natural language goal."""
        results = []
        for record in self.index_records:
            if app and record['app'] != app:
                continue

            score = self._match_score(query, record['terms'])
            if score >= 0.35:
                results.append({
                    'control_id': record['id'],
                    'canonical_name': record['canonical_name'],
                    'app': record['app'],
                    'element_type': record['element_type'],
                    'parent_region': record['parent_region'],
                    'confidence': round(score, 3),
                    'aliases': record['aliases'],
                })

        results.sort(key=lambda x: x['confidence'], reverse=True)
        return results

    def disambiguate_candidates(self, target_name: str, app: str, candidates: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Disambiguate visual OCR/UIA candidates against target ontology and aliases."""
        if not candidates:
            return None

        registered_aliases = [normalize_text(target_name)]
        app_aliases = self.aliases.get(app, {})
        for key, alias_list in app_aliases.items():
            if target_name.lower() in [a.lower() for a in alias_list]:
                registered_aliases.extend([normalize_text(a) for a in alias_list])

        best_cand = None
        best_score = -1.0

        for cand in candidates:
            cand_text = normalize_text(cand.get('text', ''))
            if not cand_text:
                continue

            score = self._match_score(cand_text, registered_aliases)
            cand_conf = cand.get('confidence', 0.8)
            composite_score = score * 0.7 + cand_conf * 0.3

            if composite_score > best_score:
                best_score = composite_score
                best_cand = {**cand, 'rag_score': round(best_score, 3)}

        return best_cand if best_score >= 0.40 else None


if __name__ == '__main__':
    rag = SemanticRAGEngine()
    print("=== INTENT Semantic RAG Self-Test ===")
    canva_match = rag.find_control_by_intent("cut out background of image", app="canva")
    print("Query: 'cut out background of image' ->\n", json.dumps(canva_match[:2], indent=2))

    excel_match = rag.find_control_by_intent("insert a bar chart from table", app="excel")
    print("\nQuery: 'insert a bar chart from table' ->\n", json.dumps(excel_match[:2], indent=2))
