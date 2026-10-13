"""Build the pictures sent inside phone notifications: a peeking Tokku on a soft background.
Input: art/mobile/*.png (peeking sheets). Output: src/main/phone/*.png
Run it with the Python in tools/.venv."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, str(Path(__file__).resolve().parent))
import cut_sprites as cs

ROOT = cs.ROOT
OUT = ROOT / "src" / "main" / "phone"
W, H = 720, 400


def card(sheet, index, name, top, bottom):
    rgb, a, _ = cs.cut_figures_alpha(ROOT / "art" / "mobile" / sheet, 4, name, [])[index]
    fig = Image.fromarray(np.dstack([rgb, (a * 255).astype(np.uint8)]), "RGBA")
    k = (H * 0.96) / fig.height
    fig = fig.resize((round(fig.width * k), round(fig.height * k)), Image.LANCZOS)
    grad = np.linspace(0, 1, H)[:, None, None]
    bg = (np.array(top)[None, None] * (1 - grad) + np.array(bottom)[None, None] * grad).repeat(W, 1).astype(np.uint8)
    img = Image.fromarray(bg, "RGB").convert("RGBA")
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([W - 520, -80, W + 120, H + 80], fill=(255, 255, 255, 46))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(60)))
    img.alpha_composite(fig, (W - fig.width, H - fig.height))      # he peeks in from the right edge
    img.convert("RGB").save(OUT / f"{name}.png", optimize=True)
    print(name, (OUT / f"{name}.png").stat().st_size // 1024, "KB")


OUT.mkdir(parents=True, exist_ok=True)
card("angry_peeking.png", 3, "away", (58, 44, 92), (24, 22, 46))          # checking his watch
card("peeking_happy_face.png", 0, "hello", (255, 190, 110), (240, 130, 50))  # friendly peek, for the test message
