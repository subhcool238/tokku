"""Tokku sprite pipeline (art v3).

Reads art/sheet-map.json and the sheets in art/sheets/, and writes:
  src/renderer/character/assets/v3/<name>.png   clean single frames
  src/renderer/character/assets/character.json  poses, ring, walk, sequences
  art/review/contact-sheet.png                  every frame on grey for review

Run from the project folder:
  tools\\.venv\\Scripts\\python.exe tools\\cut_sprites.py            full run
  tools\\.venv\\Scripts\\python.exe tools\\cut_sprites.py --compare  model comparison only

Manual corrections go in art/scale-overrides.json, for example:
  { "wave_hello": { "scale": 1.05, "anchorX": 210 } }
"""
import json
import os
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("U2NET_HOME", str(ROOT / "tools" / ".models"))

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

SHEETS = ROOT / "art" / "sheets"
MAP = ROOT / "art" / "sheet-map.json"
OVERRIDES = ROOT / "art" / "scale-overrides.json"
CACHE = ROOT / "art" / "out"
REVIEW = ROOT / "art" / "review"
ASSETS = ROOT / "src" / "renderer" / "character" / "assets"
V3 = ASSETS / "v3"
CHAR_JSON = ASSETS / "character.json"

MODEL = "u2net"                      # compared with isnet-general-use on S01 and S06: fewer ragged bits in white face fur
MARGIN = 6                           # transparent pixels kept around each trimmed frame
AIRBORNE = {"joy_jump", "drag_grab", "drag_hang"}
WALK_LIKE = ("walk_", "side_idle")   # anchor on the torso, not the feet, so the body does not jitter
SCALE_FALLBACK = {"S07": "S06"}      # sheets with no measurable frame borrow the scale of another sheet
HEAD_SHEETS = {"S05"}                # back views hide the eye patches: measure head height (top to neck) instead
CALIB_SHEETS = ("S01", "S02", "S03")  # clean side views: used to tie the eye patch measure to real head height
FREE_SCALE = {"sleep_curl", "wake_lying", "inspect_low", "break_lie_rest", "quiet_rest_curl", "drag_land"}
#                                      lying poses are drawn at their own size, so they are not held to the sheet median
UNIFORM_GROUPS = (("S01",), ("S02",), ("S03",), ("S04", "S05"))
CIRCLE_BAD = {"sleep_curl", "sleep_breathe_in", "sleep_breathe_out", "sleep_ear_twitch", "sleep_tail_curl",
              "wake_ear_lift", "wake_peek", "quiet_rest_curl", "joy_jump", "done_checkmark",
              "turn_120", "turn_150", "turn_180", "quiet_back_sit"}
#                                      head merged with the body or a prop, or a back view: sized from the eye patch instead
#                                      walk frames share one size, turn frames share one size (no popping inside a cycle)
SCALE_SPREAD = 0.05                  # a frame may differ this much from its sheet's median scale

YAW = {"turn_000": 0, "turn_030": 30, "turn_060": 60, "turn_090": 90, "turn_120": 120, "turn_150": 150,
       "turn_180": 180, "turn_210": -150, "turn_240": -120, "turn_270": -90, "turn_300": -60, "turn_330": -30}


# ---------------------------------------------------------------- small helpers
def hsv(rgb):
    """H in degrees 0..360, S and V in 0..1."""
    h = cv2.cvtColor(rgb.astype(np.float32) / 255.0, cv2.COLOR_RGB2HSV)
    return h[..., 0], h[..., 1], h[..., 2]


def spread(rgb):
    return rgb.max(-1).astype(np.int16) - rgb.min(-1).astype(np.int16)


def disk(r):
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))


def erode(mask, r):
    return cv2.erode(mask.astype(np.uint8), disk(r)).astype(bool)


def dilate(mask, r):
    return cv2.dilate(mask.astype(np.uint8), disk(r)).astype(bool)


# ---------------------------------------------------------------- step 2: split
def find_dividers(rgb):
    """The three thin grey lines between the cells. Falls back to equal columns."""
    H, W, _ = rgb.shape
    sub = rgb[int(H * 0.15):int(H * 0.80)]
    mx = sub.max(-1)
    line = (spread(sub) < 18) & (mx < 246) & (mx > 150)
    frac = line.mean(0)
    cuts = []
    for k in (1, 2, 3):
        c0 = int(W * k / 4)
        lo, hi = c0 - int(W * 0.05), c0 + int(W * 0.05)
        c = lo + int(np.argmax(frac[lo:hi]))
        cuts.append(c if frac[c] > 0.5 else c0)
    return cuts


def crop_bands(rgb):
    """Erase the title text (top left) and find the row where the caption band starts."""
    H, W, _ = rgb.shape
    ink = (spread(rgb) < 30) & (rgb.max(-1) < 150)
    rows = ink[: int(H * 0.12)].sum(1) >= 2
    top = 0
    ys = np.flatnonzero(rows)
    if len(ys):
        last = ys[0]
        for y in ys[1:]:
            if y - last > 5:
                break
            last = y
        # the title is one line of text starting at the left edge: erase its box only,
        # because heads and raised arms in other cells may reach into the same rows
        xs = np.flatnonzero(ink[: last + 1].any(0))
        x1 = xs[0]
        for x in xs[1:]:
            if x - x1 > 70:
                break
            x1 = x
        rgb[: last + 4, max(0, xs[0] - 6): x1 + 7] = 255
    _, s, v = hsv(rgb)
    fig = ((s > 0.22) & (v > 0.35)).sum(1) >= 6
    fy = np.flatnonzero(fig[: int(H * 0.97)])
    bottom = min(H, (fy[-1] if len(fy) else H - 1) + 10)
    return top, bottom


def cut_cells(sheet_path):
    rgb = np.array(Image.open(sheet_path).convert("RGB"))
    H, W, _ = rgb.shape
    cuts = find_dividers(rgb)
    for c in cuts:  # paint the divider lines white
        band = rgb[:, c - 3:c + 4]
        band[(spread(band) < 24) & (band.max(-1) < 252)] = 255
    top, bottom = crop_bands(rgb)
    xs = [0] + cuts + [W]
    return [rgb[top:bottom, xs[i]:xs[i + 1]].copy() for i in range(4)], top


# ---------------------------------------------------------------- transparent sheets (no background to remove)
def has_alpha(sheet_path):
    im = Image.open(sheet_path)
    if im.mode not in ("RGBA", "LA"):
        return False
    return bool((np.array(im.getchannel("A")) < 128).mean() > 0.05)


def cut_figures_alpha(sheet_path, count, sid, log):
    """A sheet with a transparent background: the figures are simply the biggest separate shapes.

    Returns one (rgb, alpha, top_row) per figure, left to right, already trimmed. Small separate
    shapes (leftover drawn marks, stray specks) are dropped.
    """
    im = np.array(Image.open(sheet_path).convert("RGBA"))
    rgb, a = im[..., :3], im[..., 3].astype(np.float32) / 255.0
    a[a < 0.08] = 0.0
    a[a > 0.97] = 1.0
    n, lab, st, cen = cv2.connectedComponentsWithStats((a > 0.3).astype(np.uint8), connectivity=8)
    order = sorted(range(1, n), key=lambda i: -st[i, cv2.CC_STAT_AREA])
    figs = [i for i in order[:count] if st[i, cv2.CC_STAT_AREA] > 0.15 * st[order[0], cv2.CC_STAT_AREA]]
    if len(figs) < count:
        # two figures touch: fall back to equal columns and take the biggest shape in each
        log.append(f"{sid}: only {len(figs)} separate figures found, used equal columns instead (check for cut tails)")
        W = a.shape[1]
        out = []
        for k in range(count):
            x0, x1 = W * k // count, W * (k + 1) // count
            sub = np.zeros_like(a)
            sub[:, x0:x1] = a[:, x0:x1]
            n2, lab2, st2, _ = cv2.connectedComponentsWithStats((sub > 0.3).astype(np.uint8), connectivity=8)
            big = 1 + int(np.argmax(st2[1:, cv2.CC_STAT_AREA]))
            out.append(trim(rgb, sub * dilate(lab2 == big, 3), 0))
        return out
    for i in order[count:]:
        if st[i, cv2.CC_STAT_AREA] > 120:
            log.append(f"{sid}: dropped a separate shape of {int(st[i, cv2.CC_STAT_AREA])} px (drawn mark or speck)")
    figs.sort(key=lambda i: cen[i][0])
    return [trim(rgb, a * dilate(lab == i, 3), 0) for i in figs]


# ---------------------------------------------------------------- step 3: background
_sessions = {}


def rembg_alpha(cell, key, model):
    """Alpha from rembg, cached in art/out so re-runs are fast."""
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / f"{key}_{model}_{cell.shape[1]}x{cell.shape[0]}.png"
    if f.exists():
        return np.array(Image.open(f)).astype(np.float32) / 255.0
    from rembg import new_session, remove
    if model not in _sessions:
        if not (Path(os.environ["U2NET_HOME"]) / f"{model}.onnx").exists():
            print(f"  note: {model}.onnx is not in tools/.models, rembg will download it (slow)")
        _sessions[model] = new_session(model)
    m = remove(Image.fromarray(cell), session=_sessions[model], only_mask=True)
    m.save(f)
    return np.array(m).astype(np.float32) / 255.0


def refine(cell, a0):
    """Sharpen the fur edge using the fact that the background is white.

    Near the edge a pixel is  alpha*fur + (1-alpha)*white.  The fur colour is estimated
    from the solid inside, which gives a real per-pixel alpha and lets us take the white
    back out of the colour (no white halo). The grey floor shadow does not fit that
    mix of fur and white, so it drops out.
    """
    I = cell.astype(np.float32)
    hard = a0 > 0.5
    core = erode(hard, 4)
    outer = dilate(hard, 8)
    w = core.astype(np.float32)
    num = cv2.GaussianBlur(I * w[..., None], (0, 0), 5)
    den = cv2.GaussianBlur(w, (0, 0), 5)
    F = np.where(den[..., None] > 1e-3, num / np.maximum(den[..., None], 1e-3), I)
    d, g = 255.0 - I, 255.0 - F
    gg = (g * g).sum(-1)
    aw = np.clip((d * g).sum(-1) / (gg + 1e-3), 0, 1)
    res = np.linalg.norm(d - aw[..., None] * g, axis=-1)
    use = outer & ~core & (np.sqrt(gg) > 80)
    a = a0.copy()
    a[use] = np.where(res[use] < 28, aw[use], np.minimum(aw[use], a0[use]))
    a[core] = 1.0
    a[~outer] = 0.0
    a[a < 0.06] = 0.0
    # take the white back out of half transparent pixels
    aa = np.maximum(a, 0.08)[..., None]
    C = np.clip((I - (1 - aa) * 255.0) / aa, 0, 255)
    C = np.where((a > 0.999)[..., None], I, C)
    C = np.where((a <= 0.0)[..., None], F, C)
    return C.astype(np.uint8), a


def fill_white_face(cell, rgb, a):
    """White face fur on the white background gets eaten by the background remover.

    The fur is very slightly off-white while the background is pure white (253 and up), so
    near the dark eye patches any off-white area joined to the figure is taken back, and
    small pure white pockets fully enclosed by the face are filled.
    """
    hard = a > 0.5
    mn = cell.min(-1)
    dark = cv2.morphologyEx((hard & (cell.max(-1) < 92)).astype(np.uint8), cv2.MORPH_OPEN, disk(2))
    n, lab, st, _ = cv2.connectedComponentsWithStats(dark, connectivity=8)
    patches = np.isin(lab, [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] > 400])
    if not patches.any():
        return rgb, a
    near = dilate(patches, 60)
    soft_mn = cv2.GaussianBlur(mn.astype(np.float32), (0, 0), 1.0)
    cand = (soft_mn < 251.5) & (mn > 200) & ~hard & near
    cand = cv2.morphologyEx(cand.astype(np.uint8), cv2.MORPH_OPEN, disk(2)).astype(bool)   # drops whiskers
    n, lab, st, _ = cv2.connectedComponentsWithStats((hard | cand).astype(np.uint8), connectivity=8)
    main = int(np.bincount(lab[hard]).argmax())
    body = cv2.morphologyEx(hard.astype(np.uint8), cv2.MORPH_OPEN, disk(4))
    dents = cv2.morphologyEx(body, cv2.MORPH_CLOSE, disk(25)).astype(bool)
    add = cand & (lab == main) & dents
    total = (hard | add).astype(np.uint8)
    cnts, _ = cv2.findContours(total, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    solid = np.zeros_like(total)
    cv2.drawContours(solid, cnts, -1, 1, -1)
    holes = (solid.astype(bool) & ~total.astype(bool) & (mn > 235)).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(holes, connectivity=8)
    ok = [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] <= 2500 and (near & (lab == i)).any()]
    fill = add | np.isin(lab, ok)
    if fill.sum() < 20:
        return rgb, a
    a, rgb = a.copy(), rgb.copy()
    a[fill] = 1.0
    rgb[fill] = cell[fill]
    return rgb, a


def feet_row(rgb, a):
    """Lowest row with solid coloured or dark pixels (the shadow is light grey, so it is ignored)."""
    _, s, v = hsv(rgb)
    solid = (a > 0.6) & ((s > 0.3) | (v < 0.35))
    ys = np.flatnonzero(solid.sum(1) >= 3)
    return int(ys[-1]) if len(ys) else a.shape[0] - 1


def remove_shadow(cell, rgb, a):
    fr = feet_row(rgb, a)
    rgb = cell
    H = a.shape[0]
    band = np.zeros_like(a, bool)
    band[max(0, fr - int(0.07 * H)):] = True
    mx = rgb.max(-1)
    grey = (spread(rgb) < 28) & (mx > 110) & (mx < 253)
    a = a.copy()
    a[band & grey & (a < 0.95)] = 0.0
    a[band & (spread(rgb) < 12) & (mx > 110)] = 0.0      # pure grey or white floor showing between the feet
    a[fr + 3:] = 0.0
    # pure white floor enclosed between the legs or under the belly (never near the face)
    ys = np.flatnonzero((a > 0.5).any(1))
    if len(ys):
        low = np.zeros_like(a, bool)
        low[int(ys[0] + 0.5 * (ys[-1] - ys[0])):] = True
        dark = cv2.morphologyEx(((a > 0.5) & (mx < 92)).astype(np.uint8), cv2.MORPH_OPEN, disk(2))
        n, lab, st, _ = cv2.connectedComponentsWithStats(dark, connectivity=8)
        face = dilate(np.isin(lab, [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] > 400]), 45)
        a[low & ~face & (rgb.min(-1) > 246)] = 0.0
    return a


# ---------------------------------------------------------------- step 4: drawn marks
def remove_marks(rgb, a, name, flagged, log):
    """Keep the figure. Drop separate ink shapes ('!' marks, motion lines, puff clouds)."""
    mask = (a > 0.25).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if n <= 2:
        return a
    areas = stats[1:, cv2.CC_STAT_AREA]
    big = 1 + int(np.argmax(areas))
    keep = lab == big
    near = dilate(keep, 25)
    sp, mx = spread(rgb), rgb.max(-1)
    for i in range(1, n):
        if i == big:
            continue
        comp = lab == i
        area = int(areas[i - 1])
        inky = float(np.median(sp[comp])) < 40 and float(np.median(mx[comp])) < 170
        coloured_prop = (not inky) and area > 0.004 * areas[big - 1] and bool((comp & near).any())
        if coloured_prop:
            keep |= comp
            log.append(f"{name}: kept a separate coloured shape ({area} px)")
        elif area > 120:
            log.append(f"{name}: removed a separate {'ink ' if inky else ''}shape ({area} px)")
    if flagged:
        # marks that touch the figure by a thin bridge: open the shape and rebuild it
        opened = erode(keep, 3)
        n2, lab2, st2, _ = cv2.connectedComponentsWithStats(opened.astype(np.uint8), connectivity=8)
        if n2 > 2:
            b2 = 1 + int(np.argmax(st2[1:, cv2.CC_STAT_AREA]))
            body = dilate(lab2 == b2, 5) & keep
            lost = int(keep.sum() - body.sum())
            if lost > 60:
                log.append(f"{name}: removed {lost} px joined to the figure by a thin bridge (check it was a mark)")
            keep = body
    return a * dilate(keep, 3)


# ---------------------------------------------------------------- measuring
def head_height(a):
    """Rows from the top of the head down to the narrowest point of the neck.

    Follows the head downwards row by row, so a tail or paw beside the head is ignored.
    Returns (top_row, neck_row) or None if no clear neck is found.
    """
    m = a > 0.5
    ys = np.flatnonzero(m.any(1))
    if not len(ys):
        return None
    top, H = int(ys[0]), int(ys[-1] - ys[0] + 1)
    xs = np.flatnonzero(m[top])
    l, r = int(xs[0]), int(xs[-1])
    widths = []
    for y in range(top, int(ys[-1]) + 1):
        row = m[y].astype(np.int8)
        edges = np.flatnonzero(np.diff(np.concatenate(([0], row, [0]))))
        best, bo = None, 0
        for s, e in zip(edges[0::2], edges[1::2] - 1):
            o = min(e, r) - max(s, l) + 1
            if o > bo:
                bo, best = o, (int(s), int(e))
        if best is None:
            break
        l, r = best
        widths.append(r - l + 1)
    w = np.array(widths, np.float32)
    if len(w) < 40:
        return None
    w = np.convolve(w, np.ones(5) / 5, mode="same")
    lim = max(20, int(0.5 * H))
    ymax = int(np.argmax(w[:lim]))
    wmax = float(w[ymax])
    for y in range(ymax + 5, min(len(w) - 12, ymax + int(1.4 * wmax))):
        if w[y] <= 0.72 * wmax and w[y] <= w[y:y + 12].min() + 0.5:
            return top, top + y
    return None


def patch_size(rgb, a):
    """Square root of the area of the biggest dark eye patch (eye included). Steady across views and poses."""
    _, _, v = hsv(rgb)
    dark = cv2.morphologyEx(((a > 0.8) & (v < 0.5)).astype(np.uint8), cv2.MORPH_OPEN, disk(3))
    n, lab, st, _ = cv2.connectedComponentsWithStats(dark, connectivity=8)
    if n < 2:
        return None
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    comp = (lab == i).astype(np.uint8)
    cnts, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    filled = np.zeros_like(comp)
    cv2.drawContours(filled, cnts, -1, 1, -1)
    area = float(filled.sum())
    return float(np.sqrt(area)) if area > 1500 else None


def head_radius(rgb, a):
    """Radius of the biggest circle that fits inside the head, centred on the face.

    This follows what the eye reads as head size, in front, three-quarter and side views alike.
    It fails when the head is merged with something big (curled up body, arms over the head,
    a held prop) and on back views: those frames are listed in CIRCLE_BAD.
    """
    solid = (a > 0.5).astype(np.uint8)
    dt = cv2.distanceTransform(solid, cv2.DIST_L2, 5)
    _, _, v = hsv(rgb)
    dark = cv2.morphologyEx(((a > 0.8) & (v < 0.5)).astype(np.uint8), cv2.MORPH_OPEN, disk(3))
    n, lab, st, _ = cv2.connectedComponentsWithStats(dark, connectivity=8)
    big = [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] > 1500]
    if not big:
        return None
    return float(dt[dilate(np.isin(lab, big), 12)].max())


def eye_distance(rgb, a):
    """Distance between the two dark eye patches, for front views only (else None)."""
    _, s, v = hsv(rgb)
    dark = ((a > 0.8) & (v < 0.36)).astype(np.uint8)
    dark = cv2.morphologyEx(dark, cv2.MORPH_OPEN, disk(2))
    n, _, st, cen = cv2.connectedComponentsWithStats(dark, connectivity=8)
    if n < 3:
        return None
    order = np.argsort(-st[1:, cv2.CC_STAT_AREA])[:2] + 1
    a1, a2 = st[order[0], cv2.CC_STAT_AREA], st[order[1], cv2.CC_STAT_AREA]
    (x1, y1), (x2, y2) = cen[order[0]], cen[order[1]]
    dist = float(np.hypot(x1 - x2, y1 - y2))
    if a2 < 500 or a1 / a2 > 1.35 or abs(y1 - y2) > 0.25 * dist:
        return None
    return dist


def anchor_x(a, name):
    m = a > 0.5
    ys = np.flatnonzero(m.any(1))
    top, bot = int(ys[0]), int(ys[-1])
    H = bot - top + 1
    if name.startswith(WALK_LIKE):
        hh = head_height(a)
        if hh:
            # centre of the torso just below the neck, following the same column as the head
            y0, y1 = hh[1] + int(0.10 * H), hh[1] + int(0.30 * H)
            xs = np.flatnonzero(m[hh[1]])
            l, r = int(xs[0]), int(xs[-1])
            cs = []
            for y in range(hh[1], min(y1, bot)):
                row = m[y].astype(np.int8)
                e = np.flatnonzero(np.diff(np.concatenate(([0], row, [0]))))
                best, bo = None, 0
                for s, t in zip(e[0::2], e[1::2] - 1):
                    o = min(t, r) - max(s, l) + 1
                    if o > bo:
                        bo, best = o, (int(s), int(t))
                if best is None:
                    break
                l, r = best
                if y >= y0:
                    cs.append((l + r) / 2)
            if cs:
                return float(np.median(cs))
    xs = np.flatnonzero(m[bot - max(3, int(0.05 * H)):bot + 1].any(0))
    return (int(xs[0]) + int(xs[-1])) / 2


# ---------------------------------------------------------------- step 6: colour
def fur_mask(rgb, a):
    h, s, v = hsv(rgb)
    return (a > 0.9) & (h > 12) & (h < 46) & (s > 0.45) & (v > 0.45)


def fur_stats(rgb, a):
    h, s, _ = hsv(rgb)
    m = fur_mask(rgb, a)
    if m.sum() < 500:
        return None
    return float(np.median(h[m])), float(np.median(s[m]))


def colour_match(rgb, a, dh, ks):
    """Shift hue by dh degrees and scale saturation by ks, on orange fur only (soft edged)."""
    if abs(dh) < 0.5 and abs(ks - 1) < 0.015:
        return rgb
    hsvf = cv2.cvtColor(rgb.astype(np.float32) / 255.0, cv2.COLOR_RGB2HSV)
    h, s = hsvf[..., 0], hsvf[..., 1]
    wgt = np.clip((s - 0.30) / 0.20, 0, 1) * np.clip((h - 6) / 8, 0, 1) * np.clip((52 - h) / 8, 0, 1) \
        * np.clip((hsvf[..., 2] - 0.30) / 0.15, 0, 1)
    hsvf[..., 0] = h + dh * wgt
    hsvf[..., 1] = np.clip(s * (1 + (ks - 1) * wgt), 0, 1)
    return np.clip(cv2.cvtColor(hsvf, cv2.COLOR_HSV2RGB) * 255.0, 0, 255).astype(np.uint8)


# ---------------------------------------------------------------- one cell -> one frame
def process_cell(cell, key, name, flagged, model, log, erase=(), fix_white=False):
    for x0, y0, x1, y1 in erase:      # boxes of a drawn mark that sits too close to the figure to remove safely
        cell[y0:y1, x0:x1] = 255
    if erase:
        key += "_e" + "_".join(str(v) for box in erase for v in box)
    a0 = rembg_alpha(cell, key, model)
    rgb, a = refine(cell, a0)
    if fix_white:       # opt in per frame in sheet-map.json: it can also fill real gaps beside a raised paw
        rgb, a = fill_white_face(cell, rgb, a)
    a = remove_shadow(cell, rgb, a)
    a = remove_marks(rgb, a, name, flagged, log)
    return rgb, a


def trim(rgb, a, cell_top):
    ys, xs = np.flatnonzero((a > 0.02).any(1)), np.flatnonzero((a > 0.02).any(0))
    y0, y1 = max(0, ys[0] - MARGIN), min(a.shape[0], ys[-1] + 1 + MARGIN)
    x0, x1 = max(0, xs[0] - MARGIN), min(a.shape[1], xs[-1] + 1 + MARGIN)
    return rgb[y0:y1, x0:x1], a[y0:y1, x0:x1], cell_top + y0


def on_grey(rgb, a, grey=128):
    return (rgb * a[..., None] + grey * (1 - a[..., None])).astype(np.uint8)


# ---------------------------------------------------------------- model comparison
def compare():
    smap = json.loads(MAP.read_text(encoding="utf-8"))["sheets"]
    REVIEW.mkdir(parents=True, exist_ok=True)
    rows = []
    for sid in ("S01", "S06"):
        cells, _ = cut_cells(SHEETS / smap[sid]["file"])
        for model in ("isnet-general-use", "u2net"):
            parts = []
            for i, cell in enumerate(cells):
                log = []
                rgb, a = process_cell(cell, f"{sid}_{i}", f"{sid}_{i}", False, model, log)
                parts.append(on_grey(rgb, a))
            h = max(p.shape[0] for p in parts)
            rows.append(np.hstack([np.pad(p, ((0, h - p.shape[0]), (0, 0), (0, 0)), constant_values=128) for p in parts]))
    w = max(r.shape[1] for r in rows)
    out = np.vstack([np.pad(r, ((0, 0), (0, w - r.shape[1]), (0, 0)), constant_values=128) for r in rows])
    Image.fromarray(out).save(CACHE / "compare-models.png")
    print("wrote", CACHE / "compare-models.png", "(rows: S01 isnet, S01 u2net, S06 isnet, S06 u2net)")


# ---------------------------------------------------------------- sequences (section 9.4)
def seq(*steps, **extra):
    d = {"frames": [{"pose": p, "ms": ms} for p, ms in steps]}
    d.update(extra)
    return d


WALK8 = [f"walk_{i}" for i in range(1, 9)]
SEQUENCES = {
    "walk_start": seq(("walk_start_lean", 120), ("walk_start_step", 120)),
    "walk_cycle": {"frames": [{"pose": p} for p in WALK8], "advance": "distance", "loop": True},
    "walk_stop": seq(("walk_stop_slow", 140), ("side_idle", 160)),
    "attention": seq(("notice", 350), ("lean_wave", 300), ("wave_hello", 700), ("paw_stop", 0), hold="paw_stop"),
    "plead": seq(("plead", 1400), ("hopeful", 1200)),
    "accept": seq(("accept_thumbs", 1000), end="rig"),
    "sulk": seq(("sulk", 1500), end="rig"),
    "rest": seq(("break_stretch", 900), ("break_yawn", 1100), ("break_sit_relaxed", 60000), ("break_lie_rest", 0),
                hold="break_lie_rest"),
    "stretch_up": seq(("break_stretch", 900), ("awake_front", 500), end="rig"),
    "sleep_in": seq(("sleepy_stand", 800), ("yawn_sit", 1100), ("drowsy_sit", 1100)),   # then the engine shows sleep_curl and loops
    "sleep_loop": seq(("sleep_breathe_in", 1600), ("sleep_breathe_out", 1600), loop=True,
                      extras=[{"pose": "sleep_ear_twitch", "ms": 500, "chance": 0.12},
                              {"pose": "sleep_tail_curl", "ms": 1200, "chance": 0.08}]),
    "wake": seq(("wake_ear_lift", 400), ("wake_peek", 500), ("wake_yawn_lying", 750), ("wake_lying", 450),
                ("wake_sit_rub", 650), ("stretch_up", 550), ("awake_front", 350), end="rig"),
    "celebrate": seq(("joy_excited", 450), ("joy_jump", 450), ("done_checkmark", 1200), ("done_proud", 900),
                     end="rig", hop={"at": "joy_jump", "heightPx": 14}),
    "annoyed_1": seq(("annoyed_mild", 1600), end="rig"),
    "annoyed_2": seq(("annoyed_question", 1600), end="rig"),
    "annoyed_3": seq(("annoyed_angry", 1800), end="rig"),
    "drag_start": seq(("drag_grab", 120), ("drag_hang", 0), hold="drag_hang"),
    "drag_end": seq(("drag_land", 260), ("drag_sit", 900)),
    "quiet_on": seq(("quiet_back_sit", 0), hold="quiet_back_sit", before="turn:180", dim=0.55),
    "quiet_off": seq(("quiet_back_sit", 250), after="turn:0", end="rig"),
    "welcome_back": seq(("away_check_time", 800), ("away_sigh", 800), ("joy_excited", 900), end="rig"),
    "surprise": seq(("surprise_start", 250), ("surprise_strong", 700), ("surprise_recover", 600), end="rig"),
    "point_at_task": seq(("found_point", 0), hold="found_point"),
    "idle_think": seq(("think_chin", 1800), end="rig"),
    "idle_inspect": seq(("inspect_low", 1600), end="rig"),
    "idle_glance": seq(("turn_030", 600), end="rig"),
}


# ---------------------------------------------------------------- contact sheet
def font(size):
    for f in ("segoeui.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default()


def contact_sheet(frames, S, ref, unsure):
    """frames: list of dicts with name, rgb, a, scale, anchorX, feetY, head (top, neck) or None."""
    cols, cw, chh = 8, 290, 316
    base = 276                       # baseline y inside a cell
    rows = (len(frames) + cols - 1) // cols
    img = Image.new("RGB", (cols * cw, rows * chh + 40), (128, 128, 128))
    dr = ImageDraw.Draw(img)
    fnt, small = font(15), font(12)
    dr.text((10, 8), "Tokku art v3 contact sheet, at on-screen size. White line = floor. Yellow lines = top of head and neck of "
                     "the old idle (a standing head should sit between them). Red name = please check this frame.",
            fill=(255, 255, 255), font=small)
    head_top = ref["feetY"] * S                 # idle head top above the floor, display px
    neck = (ref["feetY"] - ref["head_h"]) * S
    for i, f in enumerate(frames):
        cx, cy = (i % cols) * cw, 40 + (i // cols) * chh
        k = S * f["scale"]
        w, h = max(1, round(f["rgb"].shape[1] * k)), max(1, round(f["rgb"].shape[0] * k))
        rgba = np.dstack([f["rgb"], (f["a"] * 255).astype(np.uint8)])
        im = Image.fromarray(rgba, "RGBA").resize((w, h), Image.LANCZOS)
        ox = cx + cw // 2 - round(f["anchorX"] * k)
        oy = cy + base - round(f["feetY"] * k)
        dr.line([(cx + 4, cy + base - head_top), (cx + cw - 4, cy + base - head_top)], fill=(230, 210, 60), width=1)
        dr.line([(cx + 4, cy + base - neck), (cx + cw - 4, cy + base - neck)], fill=(230, 210, 60), width=1)
        img.paste(im, (ox, oy), im)
        dr.line([(cx + 4, cy + base), (cx + cw - 4, cy + base)], fill=(255, 255, 255), width=1)
        dr.rectangle([cx, cy, cx + cw - 1, cy + chh - 1], outline=(110, 110, 110))
        red = f["name"] in unsure
        dr.text((cx + 8, cy + base + 8), f["name"], fill=(255, 90, 90) if red else (255, 255, 255), font=fnt)
        dr.text((cx + 8, cy + base + 26), f"scale {f['scale']:.2f}" + ("  mirrored" if f.get("mirrored") else ""),
                fill=(210, 210, 210), font=small)
    REVIEW.mkdir(parents=True, exist_ok=True)
    img.save(REVIEW / "contact-sheet.png")
    return img.size


def write_character(char):
    """Save character.json, plus the same data as a script so review pages work when opened as a file."""
    text = json.dumps(char, indent=1)
    CHAR_JSON.write_text(text + "\n", encoding="utf-8")
    (ASSETS / "character.data.js").write_text(
        "/* Generated from character.json by the tools in tools/. Do not edit. */\nwindow.TOKKU_CHARACTER = " + text + ";\n",
        encoding="utf-8")


# ---------------------------------------------------------------- main run
def main():
    m = json.loads(MAP.read_text(encoding="utf-8"))
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8")) if OVERRIDES.exists() else {}
    char = json.loads(CHAR_JSON.read_text(encoding="utf-8"))
    S = char["displayHeightPx"] / char["spriteHeightPx"]
    log, unsure = [], {}

    def flag(name, why):
        unsure.setdefault(name, []).append(why)

    # reference: the old idle (same picture as the rig) gives the head size every frame must match
    idle_file = next(p for p in (ASSETS / "poses" / "idle.png", ASSETS / "_old" / "poses" / "idle.png") if p.exists())
    idle = np.array(Image.open(idle_file).convert("RGBA"))
    ia = idle[..., 3].astype(np.float32) / 255.0
    rt, rn = head_height(ia)
    ref = {"head_h": rn - rt, "feetY": char["rig"]["feetY"] - rt, "patch": patch_size(idle[..., :3], ia)}
    print(f"reference head: {ref['head_h']} px top to neck, eye patch size {ref['patch']:.1f}")

    frames, by_sheet = {}, {}
    for sid, sh in m["sheets"].items():
        if sh.get("skip"):
            print(f"{sid}: skipped ({sh['reason']})")
            continue
        clear = has_alpha(SHEETS / sh["file"])
        if clear:
            figs = cut_figures_alpha(SHEETS / sh["file"], len(sh["frames"]), sid, log)
        else:
            cells, top = cut_cells(SHEETS / sh["file"])
        for i, fr in enumerate(sh["frames"]):
            if not fr["use"]:
                continue
            name = fr["name"]
            if clear:
                rgb, a, sheet_y = figs[i]
            else:
                rgb, a = process_cell(cells[i], f"{sid}_{i}", name, bool(fr.get("remove_marks")), MODEL, log,
                                      fr.get("erase", ()), bool(fr.get("fix_white")))
                if fr.get("remove_marks"):
                    flag(name, "had a drawn mark removed")
                touch = [(a[:, 0] > 0.3).any(), (a[:, -1] > 0.3).any(), (a[0] > 0.3).any()]
                if any(touch):
                    flag(name, "touches the edge of its cell, something may be cut")
                rgb, a, sheet_y = trim(rgb, a, top)
            frames[name] = {"name": name, "sheet": sid, "rgb": rgb, "a": a, "sheet_y": sheet_y,
                            "mirror": bool(fr.get("mirror")), "airborne": bool(fr.get("airborne")) or name in AIRBORNE}
            by_sheet.setdefault(sid, []).append(name)
        print(f"{sid}: cut {len(by_sheet.get(sid, []))} frames")

    # ---- colour match per sheet, to walk_1
    ref_h, ref_s = fur_stats(frames["walk_1"]["rgb"], frames["walk_1"]["a"])
    if m.get("colour_reference", "").startswith("old idle"):
        ref_h, ref_s = fur_stats(idle[..., :3], ia)
    print(f"  colour reference: hue {ref_h:.1f} sat {ref_s:.3f} ({m.get('colour_reference')})")
    for sid, names in by_sheet.items():
        st = [fur_stats(frames[n]["rgb"], frames[n]["a"]) for n in names]
        st = [x for x in st if x]
        if not st:
            continue
        mh, ms = float(np.median([x[0] for x in st])), float(np.median([x[1] for x in st]))
        dh, ks = float(np.clip(ref_h - mh, -8, 8)), float(np.clip(ref_s / ms, 0.80, 1.10))
        changed = abs(dh) >= 0.5 or abs(ks - 1) >= 0.015
        print(f"  colour {sid}: hue {mh:5.1f} sat {ms:.3f} -> " + (f"shift {dh:+.1f} deg, sat x{ks:.2f}" if changed else "no change"))
        for n in names:
            frames[n]["rgb"] = colour_match(frames[n]["rgb"], frames[n]["a"], dh, ks)

    # ---- baseline, anchor, head measure (before mirroring, in sheet orientation)
    for sid, names in by_sheet.items():
        ground = [frames[n]["sheet_y"] + feet_row(frames[n]["rgb"], frames[n]["a"]) for n in names if not frames[n]["airborne"]]
        ground = float(np.median(ground)) if ground else None
        for n in names:
            f = frames[n]
            fr = feet_row(f["rgb"], f["a"])
            f["feetY"] = fr
            f["air"] = 0
            if f["airborne"] and ground is not None:
                f["air"] = max(0, round(ground - (f["sheet_y"] + fr)))
                f["feetY"] = fr + f["air"]
            f["anchorX"] = anchor_x(f["a"], n)
            f["head"] = head_height(f["a"])
            f["patch"] = patch_size(f["rgb"], f["a"])
            f["circle"] = None if n in CIRCLE_BAD else head_radius(f["rgb"], f["a"])

    # ---- head size -> scale
    target = head_radius(idle[..., :3], ia)      # every head is scaled to the head of the old idle
    print(f"  head radius of the old idle: {target:.1f} px")

    def circle_scale(n):
        return target / frames[n]["circle"] if frames[n]["circle"] else None

    def patch_scale(n):
        return ref["patch"] / frames[n]["patch"] if frames[n]["patch"] else None

    # frames where the circle cannot be used fall back to the eye patch, tied to the circle measure
    # through all the frames that have both
    both = [circle_scale(n) / patch_scale(n) for n in frames if circle_scale(n) and patch_scale(n)]
    calib = float(np.median(both))
    print(f"  eye patch to head circle correction: x{calib:.3f}")

    def own_scale(n, sid):
        v = circle_scale(n)
        if v is None and patch_scale(n) and sid not in HEAD_SHEETS:
            v = patch_scale(n) * calib
        return v

    sheet_scale = {}
    for sid, names in by_sheet.items():
        vals = [v for v in (circle_scale(n) for n in names) if v and 0.5 < v < 1.6]
        if vals:
            sheet_scale[sid] = float(np.median(vals))
    for sid, names in by_sheet.items():
        base = sheet_scale.get(sid) or sheet_scale.get(SCALE_FALLBACK.get(sid, ""))
        for n in names:
            own = own_scale(n, sid)
            if own is None:
                own = base if base else float(np.median(list(sheet_scale.values())))
                flag(n, "head could not be measured, size taken from its sheet")
            frames[n]["scale"] = own
        print(f"  size {sid}: frames " + " ".join(f"{frames[n]['scale']:.2f}" for n in names)
              + "  air " + " ".join(str(frames[n]["air"]) for n in names))

    for group in UNIFORM_GROUPS:
        vals = [v for sid in group for n in by_sheet[sid] for v in [circle_scale(n)] if v and 0.5 < v < 1.6]
        g = float(np.median(vals))
        for sid in group:
            for n in by_sheet[sid]:
                frames[n]["scale"] = g
        print(f"  size {'+'.join(group)}: one uniform scale {g:.3f}")

    # ---- mirror and derived frames
    def mirrored(f, name):
        g = dict(f)
        g["name"], g["rgb"], g["a"] = name, f["rgb"][:, ::-1].copy(), f["a"][:, ::-1].copy()
        g["anchorX"] = f["a"].shape[1] - 1 - f["anchorX"]
        g["mirrored"] = True
        return g

    for n in list(frames):
        if frames[n]["mirror"]:
            frames[n] = mirrored(frames[n], n)
    for d in m.get("derived", []):
        frames[d["name"]] = mirrored(frames[d["from"]], d["name"]) if d.get("mirror") else dict(frames[d["from"]], name=d["name"])
        if d["name"] in unsure:
            del unsure[d["name"]]

    # ---- manual overrides
    for n, o in overrides.items():
        if n in frames and isinstance(o, dict):
            for k in ("scale", "anchorX", "feetY"):
                if k in o:
                    frames[n][k] = o[k]

    # ---- export PNGs
    if V3.exists():
        shutil.rmtree(V3)
    V3.mkdir(parents=True)
    for n, f in frames.items():
        rgba = np.dstack([f["rgb"], np.round(f["a"] * 255).astype(np.uint8)])
        Image.fromarray(rgba, "RGBA").save(V3 / f"{n}.png", optimize=True)

    # ---- move the old art out of the way (kept until art v3 is approved)
    old = ASSETS / "_old"
    for folder in ("ring", "poses"):
        if (ASSETS / folder).exists():
            old.mkdir(exist_ok=True)
            if (old / folder).exists():
                shutil.rmtree(old / folder)
            shutil.move(str(ASSETS / folder), str(old / folder))

    # ---- character.json
    legacy = {k: v for k, v in char["poses"].items() if "/poses/" in "/" + v["file"]}
    for v in legacy.values():
        v["file"] = "_old/poses/" + v["file"].split("poses/")[-1]
        v["legacy"] = True
    poses = {}
    for n, f in frames.items():
        p = {"file": f"v3/{n}.png", "w": int(f["a"].shape[1]), "h": int(f["a"].shape[0]),
             "anchorX": round(float(f["anchorX"])), "feetY": int(f["feetY"]), "scale": round(float(f["scale"]), 3)}
        if f.get("air"):
            p["airPx"] = int(f["air"])
        poses[n] = p
    for k, v in legacy.items():      # a new frame wins when the name is the same (sleep_curl)
        poses.setdefault(k, v)
    char["version"] = 3
    char["poses"] = poses
    char["ring"] = {"note": "12 views, 30 degrees apart. Each entry is a pose name; anchors and scale come from that pose.",
                    "ring": [{"yaw": y, "pose": n, "file": f"v3/{n}.png", "anchorX": poses[n]["anchorX"],
                              "feetY": poses[n]["feetY"], "scale": poses[n]["scale"]}
                             for n, y in sorted(YAW.items(), key=lambda kv: kv[1])]}
    char["walk"] = {"right": WALK8, "start": ["walk_start_lean", "walk_start_step"], "stop": ["walk_stop_slow", "side_idle"],
                    "framePx": 9, "note": "8 frame cycle facing right. The frame advances every framePx screen pixels. Mirror for left."}
    char["sequences"] = SEQUENCES
    char["scaleNote"] = ("Per-pose \"scale\" gives every frame the same head size. Measured by tools/cut_sprites.py as the biggest "
                         "circle that fits in the head. Manual corrections: art/scale-overrides.json.")
    char["legacyNote"] = "Poses marked legacy are the old art in assets/_old. The engine uses them until Phase 1B."
    write_character(char)

    # ---- contact sheet
    order = [n for sid in by_sheet for n in by_sheet[sid]] + [d["name"] for d in m.get("derived", [])]
    idle_frame = {"name": "OLD IDLE (reference)", "rgb": idle[..., :3], "a": ia, "scale": 1.0,
                  "anchorX": char["rig"]["anchorX"], "feetY": char["rig"]["feetY"], "head": (rt, rn)}
    size = contact_sheet([idle_frame] + [frames[n] for n in order], S, ref, unsure)

    report = {"frames": len(frames), "unsure": unsure, "log": log}
    (REVIEW / "report.json").write_text(json.dumps(report, indent=1) + "\n", encoding="utf-8")
    print(f"\nexported {len(frames)} frames to {V3.relative_to(ROOT)}")
    print(f"contact sheet {size[0]}x{size[1]}: {(REVIEW / 'contact-sheet.png').relative_to(ROOT)}")
    for line in log:
        print("  log:", line)


if __name__ == "__main__":
    compare() if "--compare" in sys.argv else main()
