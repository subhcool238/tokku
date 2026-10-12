"""Build the front idle rig (art v3) from the 4 figure idle sheet.

Input : art/idle/idle_4frames.(png|webp)   frames: eyes open, half closed, closed, mouth open
Output: src/renderer/character/assets/rig_v3/  body, tail, ear_l, ear_r, blink_half, blink_closed, mouth_open
        and the "rig" block of character.json

The four figures are separate drawings, so only frame 1 is used for the body. The other
frames give soft-edged patches (eye area, mouth area) that are laid over frame 1.

Run:  tools\\.venv\\Scripts\\python.exe tools\\build_idle_rig.py
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cut_sprites as cs

ROOT = cs.ROOT
SRC = next((p for p in (ROOT / "art" / "idle" / "idle_4frames.png", ROOT / "art" / "idle" / "idle_4frames.webp") if p.exists()), None)
OUT = cs.ASSETS / "rig_v3"
PAD = 24
OLD_IDLE_HEAD_RADIUS = 87.2      # head size every frame is matched to (see cut_sprites.py)


def dark_parts(rgb, a):
    """Find the dark face parts: two eye patches, two ears, nose. Returns dict of masks."""
    _, _, v = cs.hsv(rgb)
    dark = cv2.morphologyEx(((a > 0.8) & (v < 0.5)).astype(np.uint8), cv2.MORPH_OPEN, cs.disk(3))
    ys = np.flatnonzero((a > 0.5).any(1))
    dark[int(ys[0] + 0.5 * (ys[-1] - ys[0])):] = 0          # head only (claws and toes are dark too)
    n, lab, st, cen = cv2.connectedComponentsWithStats(dark, connectivity=8)
    comps = sorted(range(1, n), key=lambda i: -st[i, cv2.CC_STAT_AREA])
    p1, p2 = sorted(comps[:2], key=lambda i: cen[i][0])
    x_lo = st[p1, cv2.CC_STAT_LEFT]
    x_hi = st[p2, cv2.CC_STAT_LEFT] + st[p2, cv2.CC_STAT_WIDTH]
    rest = [i for i in comps[2:] if st[i, cv2.CC_STAT_AREA] > 300]
    ear_l = max((i for i in rest if cen[i][0] < x_lo + 10), key=lambda i: st[i, cv2.CC_STAT_AREA])
    ear_r = max((i for i in rest if cen[i][0] > x_hi - 10), key=lambda i: st[i, cv2.CC_STAT_AREA])
    mid = [i for i in rest if x_lo < cen[i][0] < x_hi and i not in (ear_l, ear_r)]
    nose = max(mid, key=lambda i: st[i, cv2.CC_STAT_AREA])
    return {"patch_l": lab == p1, "patch_r": lab == p2, "ear_l": lab == ear_l, "ear_r": lab == ear_r, "nose": lab == nose,
            "cen": {"ear_l": cen[ear_l], "ear_r": cen[ear_r], "nose": cen[nose]}}


def on_canvas(rgb, a, W, H, ox, oy):
    C = np.zeros((H, W, 3), np.uint8)
    A = np.zeros((H, W), np.float32)
    x0, y0 = max(0, ox), max(0, oy)
    sx, sy = x0 - ox, y0 - oy
    w, h = min(a.shape[1] - sx, W - x0), min(a.shape[0] - sy, H - y0)
    C[y0:y0 + h, x0:x0 + w] = rgb[sy:sy + h, sx:sx + w]
    A[y0:y0 + h, x0:x0 + w] = a[sy:sy + h, sx:sx + w]
    return C, A


def save(name, rgb, alpha):
    Image.fromarray(np.dstack([rgb, np.round(np.clip(alpha, 0, 1) * 255).astype(np.uint8)]), "RGBA").save(OUT / name, optimize=True)


def main():
    if SRC is None:
        sys.exit("Put the 4 figure idle sheet at art/idle/idle_4frames.png (or .webp)")
    log = []
    figs = cs.cut_figures_alpha(SRC, 4, "IDLE", log)
    rgb0, a0, _ = figs[0]
    H, W = a0.shape[0] + 2 * PAD, a0.shape[1] + 2 * PAD
    base, A = on_canvas(rgb0, a0, W, H, PAD, PAD)
    parts = dark_parts(base, A)
    OUT.mkdir(parents=True, exist_ok=True)

    # ---- colour: same gentle match to the old idle as every other frame
    old = np.array(Image.open(next(p for p in (cs.ASSETS / "_old" / "poses" / "idle.png", cs.ASSETS / "poses" / "idle.png") if p.exists())).convert("RGBA"))
    ref_h, ref_s = cs.fur_stats(old[..., :3], old[..., 3] / 255.0)
    mh, ms = cs.fur_stats(base, A)
    dh, ks = float(np.clip(ref_h - mh, -8, 8)), float(np.clip(ref_s / ms, 0.80, 1.10))
    tint = lambda rgb, al: cs.colour_match(rgb, al, dh, ks)

    # ---- other frames, moved so their ears and nose sit on those of frame 1
    aligned = []
    for rgb, a, _ in figs[1:]:
        C, Al = on_canvas(rgb, a, W, H, PAD, PAD)
        p = dark_parts(C, Al)
        d = np.mean([np.array(parts["cen"][k]) - np.array(p["cen"][k]) for k in ("ear_l", "ear_r", "nose")], axis=0)
        C, Al = on_canvas(rgb, a, W, H, PAD + int(round(d[0])), PAD + int(round(d[1])))
        aligned.append((C, Al, dark_parts(C, Al)))
        print(f"  frame moved by ({d[0]:+.1f}, {d[1]:+.1f}) px to sit on frame 1")

    def fill(mask):
        cnts, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        out = np.zeros(mask.shape, np.uint8)
        cv2.drawContours(out, cnts, -1, 1, -1)
        return out.astype(bool)

    eyes0 = fill(parts["patch_l"]) | fill(parts["patch_r"])
    for name, (C, Al, p) in zip(("blink_half.png", "blink_closed.png"), aligned[:2]):
        zone = cs.dilate(eyes0 | fill(p["patch_l"]) | fill(p["patch_r"]), 10)
        soft = cv2.GaussianBlur(zone.astype(np.float32), (0, 0), 4)
        save(name, tint(C, Al), soft * Al)

    # ---- mouth: the area under the nose where the open mouth frame differs from frame 1
    C4, A4, p4 = aligned[2]
    diff = np.abs(C4.astype(np.float32) - base.astype(np.float32)).mean(-1)
    ny = int(parts["cen"]["nose"][1])
    nx = int(parts["cen"]["nose"][0])
    eye_w = int(np.flatnonzero(eyes0.any(0))[-1] - np.flatnonzero(eyes0.any(0))[0])
    zone = np.zeros_like(eyes0)
    zone[ny + 6: ny + int(0.42 * eye_w), nx - int(0.33 * eye_w): nx + int(0.33 * eye_w)] = True
    changed = cv2.morphologyEx(((diff > 30) & zone).astype(np.uint8), cv2.MORPH_CLOSE, cs.disk(6))
    n, lab, st, _ = cv2.connectedComponentsWithStats(changed, connectivity=8)
    mouth = (lab == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))) if n > 1 else zone
    soft = cv2.GaussianBlur(cs.dilate(mouth, 9).astype(np.float32), (0, 0), 3.5)
    save("mouth_open.png", tint(C4, A4), soft * A4)

    # ---- tail: everything left of where the body would be if it were symmetric
    solid = A > 0.5
    ys = np.flatnonzero(solid.any(1))
    top, bot = int(ys[0]), int(ys[-1])
    rows = range(top + int(0.40 * (bot - top)), top + int(0.52 * (bot - top)))
    cx = float(np.median([(np.flatnonzero(solid[y])[0] + np.flatnonzero(solid[y])[-1]) / 2 for y in rows]))
    tail = np.zeros_like(solid)
    for y in range(top + int(0.55 * (bot - top)), bot + 1):
        xs = np.flatnonzero(solid[y])
        if len(xs):
            edge = int(2 * cx - xs[-1]) - 6
            tail[y, :max(0, edge)] = solid[y, :max(0, edge)]
    n, lab, st, _ = cv2.connectedComponentsWithStats(tail.astype(np.uint8), connectivity=8)
    tail = lab == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    tys, txs = np.nonzero(tail)
    edge_x = int(np.percentile(txs, 99))
    pivot_tail = [edge_x + 8, int(tys.min() + 0.78 * (tys.max() - tys.min()))]
    tail_layer = cs.dilate(tail, 34) & (A > 0.02)                # keeps some fur under the body so no gap opens
    save("tail.png", tint(base, A), A * tail_layer)

    # ---- ears
    ear_masks, pivots = {}, {"tail": pivot_tail}
    head_cx = (parts["cen"]["ear_l"][0] + parts["cen"]["ear_r"][0]) / 2
    for key, pk in (("ear_l", "earL"), ("ear_r", "earR")):
        ear = cs.dilate(parts[key], 7) & (A > 0.02)
        # only the part outside the head outline moves; the inner part stays in the body picture
        cxe, cye = parts["cen"][key]
        ear_masks[key] = ear
        layer = cs.dilate(parts[key], 16) & (A > 0.02)
        save(f"{key}.png", tint(base, A), A * layer)
        pivots[pk] = [int(round(cxe + (head_cx - cxe) * 0.12)), int(round(cye + 6))]

    # ---- body: frame 1 with the tail and ears taken out (soft edges, the layers lie underneath)
    cut = cv2.GaussianBlur(cs.dilate(tail | ear_masks["ear_l"] | ear_masks["ear_r"], 4).astype(np.float32), (0, 0), 1.6)
    save("body.png", tint(base, A), A * (1 - cut))
    save("idle_full.png", tint(base, A), A)

    feet = cs.feet_row(base, A)
    radius = cs.head_radius(base, A)
    char = json.loads(cs.CHAR_JSON.read_text(encoding="utf-8"))
    if "rig_old" not in char:
        char["rig_old"] = char["rig"]
        char["rig_old"]["note2"] = "Old idle rig (art v2), kept for reference. Files are in assets/rig."
    char["rig"] = {
        "w": W, "h": H, "anchorX": round(cs.anchor_x(A, "idle")), "feetY": feet,
        "scale": round(OLD_IDLE_HEAD_RADIUS / radius, 3),
        "layers": {"body": "rig_v3/body.png", "tail": "rig_v3/tail.png", "ear_l": "rig_v3/ear_l.png", "ear_r": "rig_v3/ear_r.png"},
        "overlays": {"blink_half": "rig_v3/blink_half.png", "blink_closed": "rig_v3/blink_closed.png", "mouth_open": "rig_v3/mouth_open.png"},
        "pivots": pivots, "tailRotationLimits": [-2, 14], "tailSign": -1,
        "note": "Art v3 idle. Draw order: tail, ear_l, ear_r, body, overlays. The tail is on the left, so tailSign is -1. "
                "Blink and mouth overlays are soft-edged patches cut from the other idle drawings.",
    }
    cs.write_character(char)
    print(f"rig: {W}x{H}, feet row {feet}, head radius {radius:.1f}, scale {char['rig']['scale']}, pivots {pivots}")
    print(f"colour: hue {mh:.1f} sat {ms:.3f} -> shift {dh:+.1f} deg, sat x{ks:.2f}")


if __name__ == "__main__":
    main()
