# Canva Magic Studio & Photo Editing Documentation

**Source**: Official Canva Help Center (https://www.canva.com/help/article/magic-studio-overview/)  
**Application State Mapping**: `STATE_IMAGE_SELECTED` $\to$ `STATE_MAGIC_STUDIO_OPEN` $\to$ `STATE_TOOL_APPLIED`

---

## 1. Contextual Toolbar Architecture

When any raster image or graphic is clicked on the Canva canvas workspace:
1. Canva renders a purple bounding box (`#8B3DFF`) with 8 resize handles.
2. Above the canvas (or below the main header), the Contextual Floating Toolbar activates:
   - Button 1: **Edit photo** (or **Edit** in compact viewport / modern redesign)
   - Button 2: **BG Remover** (direct Pro shortcut button on newer Canva releases)
   - Button 3: **Eraser** / **Magic Eraser**
   - Button 4: **Crop**
   - Button 5: **Flip** (Horizontal / Vertical)
   - Button 6: **Animate**
   - Button 7: **Position**
   - Button 8: **Transparency** (Opacity slider)

---

## 2. Magic Studio Left Panel Structure

Clicking `Edit photo` opens the left-hand flyout drawer (`x: 72px–450px`, `y: 110px–800px`):

### Magic Studio Tools
- **BG Remover**: Automatically cuts out the foreground subject and renders the surrounding canvas background transparent.
- **Magic Eraser**: Brush tool for removing unwanted objects or people.
- **Magic Expand**: Extends image borders using generative inpainting.
- **Magic Edit**: Generative brush to replace masked items with a text prompt.
- **Magic Grab**: Converts raster image elements into editable, draggable individual objects.
- **Grab Text**: Extracts text from an image into editable Canva typography.

### Traditional Effects & Filters
- **Filters**: Color presets (Warm, Cool, Vivid, Soft, Mono).
- **Adjust**: Sliders for White Balance, Temperature, Tint, Brightness, Contrast, Highlights, Shadows, Whites, Blacks, Saturation, Clarity, Vignette.
- **Effects**: Shadows (Glow, Drop, Curved), Autofocus, Blur, Duotone, Mockups.

---

## 3. UI Verification Signatures

| Action | Visual Mutation Signature |
|---|---|
| Image Selection | Purple outline (`#8B3DFF`) around object + floating context toolbar |
| Edit Photo Click | Expanding drawer on left side (`x < 450px`) with tool grid |
| BG Remover Click | Loading indicator / spinner over image $\to$ Background replaced with checkerboard/canvas background |
| Animate Click | Left panel shows style grid (`Fade`, `Pan`, `Rise`, `Pop`, `Wipe`, `Breathe`) |
