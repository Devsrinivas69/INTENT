"""
OCR Detector
Uses Windows Native OCR (Windows.Media.Ocr) for 100% offline, native, zero-dependency Windows OCR.
All returned coordinates are in PHYSICAL DESKTOP PIXELS.
"""

import asyncio
import base64
import re

try:
    import winrt.windows.media.ocr as ocr
    import winrt.windows.graphics.imaging as imaging
    import winrt.windows.storage.streams as streams
    import winrt.windows.globalization as globalization
    WINRT_OCR_AVAILABLE = True
except Exception:
    WINRT_OCR_AVAILABLE = False


def check_ocr_available() -> bool:
    """Check if WinRT OCR is available and functional."""
    if not WINRT_OCR_AVAILABLE:
        return False
    try:
        engine = ocr.OcrEngine.try_create_from_user_profile_languages()
        if engine is not None:
            return True
        lang = globalization.Language("en-US")
        engine = ocr.OcrEngine.try_create_from_language(lang)
        return engine is not None
    except Exception:
        return False


def normalize_text(text: str) -> str:
    """Lowercase, strip, collapse spaces, remove punctuation."""
    text = text.lower().strip()
    text = re.sub(r'[^\w\s]', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text


SYNONYM_GROUPS = [
    {
        'bg remover', 'background remover', 'remove background', 'background removal',
        'bg remove', 'eraser', 'edit photo', 'edit image', 'magic studio', 'magic edit',
        'remove bg', 'edit'
    },
    {'magic studio', 'magic edit', 'magic expand', 'effects', 'photo editor'},
    {'edit photo', 'edit', 'edit image', 'photo editor', 'effects', 'adjust', 'filter', 'tools'},
    {'animate', 'animation', 'add animation', 'fade', 'pan', 'rise', 'pop', 'motion'},
    {'insert', 'insert tab', 'charts', 'recommended charts', 'column', 'bar', 'pie'},
    {'image', 'photo', 'canvas', 'design', 'whiteboard', 'doc', 'sheet', 'website', 'presentation', 'create a design'},
]


def text_similarity(a: str, b: str) -> float:
    """
    Returns similarity score between two strings (0.0 to 1.0).
    Robust against single-character false positives.
    """
    a_n = normalize_text(a)
    b_n = normalize_text(b)

    if not a_n or not b_n:
        return 0.0

    # Exact match
    if a_n == b_n:
        return 1.0

    # Reject single-character or two-character partial matches (e.g. 'o' matching 'edit photo')
    if len(a_n) < 3 and a_n != b_n:
        # Only allow if it's an exact known acronym (e.g., 'bg')
        if a_n in {'bg', 'fx'} and a_n in b_n.split():
            return 0.85
        return 0.0

    if len(b_n) < 3 and a_n != b_n:
        if b_n in {'bg', 'fx'} and b_n in a_n.split():
            return 0.85
        return 0.0

    # Synonym group match (exact membership check)
    for group in SYNONYM_GROUPS:
        if any(g == a_n for g in group) and any(g == b_n for g in group):
            return 0.95
        if any(g in a_n for g in group) and any(g in b_n for g in group):
            return 0.88

    # Word-boundary substring match (e.g. 'edit' in 'edit photo', or 'animate' in 'add animation')
    a_words = a_n.split()
    b_words = b_n.split()

    if a_n in b_words or b_n in a_words:
        return 0.92

    # Whole phrase substring (e.g. 'bg remover' inside 'click bg remover')
    if (a_n in b_n and len(a_n) >= 4) or (b_n in a_n and len(b_n) >= 4):
        shorter_len = min(len(a_n), len(b_n))
        longer_len = max(len(a_n), len(b_n))
        ratio = shorter_len / longer_len
        if ratio >= 0.4:
            return round(0.75 + ratio * 0.20, 2)

    # Word overlap for multi-word phrases
    if a_words and b_words:
        set_a = set(a_words)
        set_b = set(b_words)
        overlap = len(set_a & set_b)
        if overlap > 0:
            jaccard = overlap / len(set_a | set_b)
            if jaccard >= 0.5:
                return round(0.70 + jaccard * 0.25, 2)

    return 0.0


async def _run_winrt_ocr(b64_image: str):
    if not WINRT_OCR_AVAILABLE:
        return []

    try:
        if ',' in b64_image:
            b64_image = b64_image.split(',', 1)[1]
        raw_bytes = base64.b64decode(b64_image)

        stream = streams.InMemoryRandomAccessStream()
        writer = streams.DataWriter(stream)
        writer.write_bytes(raw_bytes)
        await writer.store_async()
        await writer.flush_async()
        stream.seek(0)

        decoder = await imaging.BitmapDecoder.create_async(stream)
        bitmap = await decoder.get_software_bitmap_async()

        # Try user profile languages first
        engine = None
        try:
            engine = ocr.OcrEngine.try_create_from_user_profile_languages()
        except Exception:
            engine = None

        # Fallback to en-US language
        if not engine:
            try:
                lang = globalization.Language("en-US")
                engine = ocr.OcrEngine.try_create_from_language(lang)
            except Exception:
                engine = None

        if not engine:
            print("[OCR] Warning: No OCR engine available (user profile or en-US).", flush=True)
            return []

        result = await engine.recognize_async(bitmap)
        items = []

        # 1. Add complete lines (e.g. "Edit photo", "BG Remover")
        for line in result.lines:
            if not line.words:
                continue

            line_text = line.text.strip()
            # Ignore single stray characters
            if len(line_text) < 2:
                continue

            min_x = min(w.bounding_rect.x for w in line.words)
            min_y = min(w.bounding_rect.y for w in line.words)
            max_x = max(w.bounding_rect.x + w.bounding_rect.width for w in line.words)
            max_y = max(w.bounding_rect.y + w.bounding_rect.height for w in line.words)

            items.append({
                'text': line_text,
                'x': int(min_x),
                'y': int(min_y),
                'width': int(max_x - min_x),
                'height': int(max_y - min_y),
                'confidence': 0.95,
                'source': 'winrt_ocr'
            })

            # 2. Add individual multi-letter words (>= 2 chars)
            for word in line.words:
                w_text = word.text.strip()
                if len(w_text) < 2:
                    continue
                r = word.bounding_rect
                items.append({
                    'text': w_text,
                    'x': int(r.x),
                    'y': int(r.y),
                    'width': int(r.width),
                    'height': int(r.height),
                    'confidence': 0.90,
                    'source': 'winrt_ocr'
                })

        return items
    except Exception:
        return []


def ocr_full_image(b64_image: str, win_x: int = 0, win_y: int = 0, scale_factor: float = 1.0) -> list:
    """
    Run Windows Native OCR on a base64 PNG image.
    Returns physical pixel coordinates.
    """
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        items = loop.run_until_complete(_run_winrt_ocr(b64_image))
        loop.close()

        results = []
        for item in items:
            px_x = item['x'] + win_x
            px_y = item['y'] + win_y
            px_w = max(item['width'], 20)
            px_h = max(item['height'], 14)

            results.append({
                'text': item['text'],
                'x': px_x,
                'y': px_y,
                'width': px_w,
                'height': px_h,
                'confidence': item['confidence'],
                'source': 'ocr',
            })
        return results
    except Exception:
        return []


def find_best_text_match(ocr_results: list, target_text: str) -> list:
    """
    Filter and rank OCR results by similarity to target_text.
    """
    candidates = []
    for item in ocr_results:
        sim = text_similarity(item['text'], target_text)
        if sim >= 0.50:
            candidate = {**item, 'similarity': sim}
            candidate['score'] = round(item['confidence'] * sim, 3)
            candidates.append(candidate)

    candidates.sort(key=lambda c: c['score'], reverse=True)
    return candidates
