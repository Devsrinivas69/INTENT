"""
Generates INTENT app icon in ICO and PNG format.
Creates a monochrome black/white geometric icon matching INTENT's visual identity.
"""

from PIL import Image, ImageDraw
import os


def create_intent_icon():
    sizes = [256, 128, 64, 48, 32, 16]
    images = []

    for size in sizes:
        img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        # Black square background with slight rounding
        margin = max(1, size // 16)
        draw.rounded_rectangle(
            [margin, margin, size - margin, size - margin],
            radius=max(2, size // 8),
            fill=(10, 10, 10, 255)
        )

        # White geometric crosshair/reticle — the INTENT cursor symbol
        center = size // 2
        arm = size // 4
        thickness = max(1, size // 20)

        # Horizontal arm
        draw.rectangle(
            [center - arm, center - thickness,
             center + arm, center + thickness],
            fill=(255, 255, 255, 255)
        )
        # Vertical arm
        draw.rectangle(
            [center - thickness, center - arm,
             center + thickness, center + arm],
            fill=(255, 255, 255, 255)
        )

        # Center dot (black, to create crosshair look)
        dot = max(2, size // 10)
        draw.ellipse(
            [center - dot, center - dot,
             center + dot, center + dot],
            fill=(10, 10, 10, 255)
        )

        images.append(img)

    os.makedirs('build', exist_ok=True)
    images[0].save(
        'build/icon.ico',
        format='ICO',
        sizes=[(s, s) for s in sizes],
        append_images=images[1:]
    )
    print('[INTENT] Icon generated: build/icon.ico (256x256 primary)')

    # Save largest PNG for application and installer assets
    images[0].save('build/icon.png')
    print('[INTENT] PNG icon generated: build/icon.png')


if __name__ == '__main__':
    create_intent_icon()
