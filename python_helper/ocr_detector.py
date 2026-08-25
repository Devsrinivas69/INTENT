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
    WINRT_OCR_AVAILABLE = True
except Exception:
    WINRT_OCR_AVAILABLE = False


def normalize_text(text: str) -> str:
    """Lowercase, strip, collapse spaces, remove punctuation."""
    text = text.lower().strip()
    text = re.sub(r'[^\w\s]', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text


SYNONYM_GROUPS = [
    {'bg remover', 'background remover', 'remove background', 'background removal', 'magic studio', 'effects', 'erase'},
    {'edit photo', 'edit image', 'photo editor', 'effects', 'adjust', 'filter', 'tools'},
    {'animate', 'animation', 'add animation', 'fade', 'pan', 'rise', 'pop', 'motion'},
    {'insert', 'insert tab', 'charts', 'recommended charts', 'column', 'bar', 'pie'},
    {'image', 'photo', 'canvas', 'design', 'whiteboard', 'doc', 'sheet', 'website', 'presentation', 'create a design'},
]


def text_similarity(a: str, b: str) -> float:
    """
    Returns similarity score between two strings.
    1.0 = exact, 0.9 = substring, 0.8 = synonym match, etc.
    """
    a_n = normalize_text(a)
    b_n = normalize_text(b)

    if not a_n or not b_n:
        return 0.0

    if a_n == b_n:
        return 1.0
    if a_n in b_n or b_n in a_n:
        return 0.92

    # Synonym group match
    for group in SYNONYM_GROUPS:
        if any(g in a_n for g in group) and any(g in b_n for g in group):
            return 0.90

    # Word overlap
    a_words = set(a_n.split())
    b_words = set(b_n.split())
    if a_words and b_words:
        overlap = len(a_words & b_words) / max(len(a_words), len(b_words))
        if overlap >= 0.5:
            return 0.70 + overlap * 0.25

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

        engine = ocr.OcrEngine.try_create_from_user_profile_languages()
        if not engine:
            return []

        result = await engine.recognize_async(bitmap)
        items = []

        # 1. Add complete lines (e.g. "Edit photo", "BG Remover")
        for line in result.lines:
            if not line.words:
                continue

            min_x = min(w.bounding_rect.x for w in line.words)
            min_y = min(w.bounding_rect.y for w in line.words)
            max_x = max(w.bounding_rect.x + w.bounding_rect.width for w in line.words)
            max_y = max(w.bounding_rect.y + w.bounding_rect.height for w in line.words)

            items.append({
                'text': line.text.strip(),
                'x': int(min_x),
                'y': int(min_y),
                'width': int(max_x - min_x),
                'height': int(max_y - min_y),
                'confidence': 0.95,
                'source': 'winrt_ocr'
            })

            # 2. Also add individual words
            for word in line.words:
                r = word.bounding_rect
                items.append({
                    'text': word.text.strip(),
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
            # Physical pixel coords relative to whole screen
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
