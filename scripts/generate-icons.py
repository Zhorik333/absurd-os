"""Regenerate original, locally drawn PWA artwork (requires Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1] / 'public' / 'icons'
ROOT.mkdir(parents=True, exist_ok=True)


def icon(size, maskable=False):
    scale = 4
    canvas = Image.new('RGB', (512 * scale, 512 * scale), '#090b16')
    glow = Image.new('RGBA', canvas.size)
    draw = ImageDraw.Draw(glow)
    # The mark stays in the central safe circle, including maskable variants.
    factor = .85 if maskable else 1

    def point(x, y):
        return (round((256 + (x - 256) * factor) * scale), round((256 + (y - 256) * factor) * scale))

    outline = [point(x, y) for x, y in [(156, 150), (304, 150), (304, 216), (356, 216), (356, 362), (208, 362), (208, 296), (156, 296), (156, 150)]]
    draw.line(outline, fill='#baff6260', width=round(36 * scale * factor), joint='curve')
    canvas = Image.alpha_composite(canvas.convert('RGBA'), glow.filter(ImageFilter.GaussianBlur(9 * scale)))
    draw = ImageDraw.Draw(canvas)
    draw.line(outline, fill='#baff62', width=round(24 * scale * factor), joint='curve')
    for coords in [(223, 217, 289, 295), (289, 217, 223, 295)]:
        draw.line([point(*coords[:2]), point(*coords[2:])], fill='#a79cff', width=round(18 * scale * factor))
    draw.ellipse([point(344, 120), point(380, 156)], fill='#ff88c8')
    return canvas.convert('RGB').resize((size, size), Image.Resampling.LANCZOS)


if __name__ == '__main__':
    for size in (192, 512):
        icon(size).save(ROOT / f'icon-{size}.png')
        icon(size, maskable=True).save(ROOT / f'maskable-{size}.png')
    icon(180).save(ROOT / 'apple-touch-icon.png')
    print('Generated five local RGB PNG icons.')
