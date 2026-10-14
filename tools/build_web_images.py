"""Small copies of every picture the browser demo needs: half size, WebP. Output: demo/img/ (same folder layout).
The engine draws using the sizes in character.json, so these look the same on screen, just lighter to download."""
import json, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "src" / "renderer" / "character" / "assets"
OUT = ROOT / "demo" / "img"
c = json.loads((ASSETS / "character.json").read_text(encoding="utf-8"))
files = set(c["rig"]["layers"].values()) | set(c["rig"]["overlays"].values()) | set(c["rig"].get("angry", {}).values())
files |= {p["file"] for p in c["poses"].values() if not p.get("legacy")}
total = 0
for f in sorted(files):
    im = Image.open(ASSETS / f).convert("RGBA")
    im = im.resize((max(1, im.width // 2), max(1, im.height // 2)), Image.LANCZOS)
    dst = OUT / Path(f).with_suffix(".webp")
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, "WEBP", quality=82, method=6)
    total += dst.stat().st_size
print(f"{len(files)} pictures, {total / 1048576:.1f} MB")
