#!/usr/bin/env python3
"""绿幕抠图：HSV 去绿域 → despill 去绿边 → RGBA → alpha bbox 裁剪(6% 边距) → 最长边 512 → 透明 PNG"""
import sys
from pathlib import Path
from PIL import Image
import numpy as np

RAW = Path("/Users/lala/ kimi workspace/大鱼吃小鱼/public/assets/fish_raw")
OUT = Path("/Users/lala/ kimi workspace/大鱼吃小鱼/public/assets/fish")
IDS = ["shrimp", "clown", "blue_tang", "guppy", "sardine", "puffer_baby",
       "butterfly", "crab", "seahorse", "squid", "lionfish", "angelfish",
       "pompano", "boxfish", "eel", "grouper"]


def process(src: Path, dst: Path):
    im = Image.open(src).convert("RGB")
    arr = np.asarray(im).astype(np.float32)
    hsv = np.asarray(im.convert("HSV")).astype(np.float32)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]

    # 绿幕像素判定（PIL HSV：纯绿 #00FF00 → H≈85, S=255, V=255）
    green = (h > 55) & (h < 100) & (s > 80) & (v > 50)

    # 形态学：腐蚀 alpha 1 圈去绿边（用纯 numpy 实现，避免 scipy 依赖）
    g = green
    # 膨胀绿色域 1px（吞掉边缘绿晕）
    gp = g.copy()
    gp[1:, :] |= g[:-1, :]
    gp[:-1, :] |= g[1:, :]
    gp[:, 1:] |= g[:, :-1]
    gp[:, :-1] |= g[:, 1:]
    grown = gp

    alpha = np.where(grown, 0.0, 255.0)

    # despill：非绿像素中 G 通道超过 max(R,B) 的部分压掉
    r, gg, b = arr[..., 0], arr[..., 1], arr[..., 2]
    excess = np.clip(gg - np.maximum(r, b), 0, None)
    keep = alpha > 0
    gg2 = np.where(keep, gg - excess * 0.9, gg)
    arr2 = np.stack([r, np.clip(gg2, 0, 255), b], axis=-1)

    rgba = np.dstack([arr2, alpha]).astype(np.uint8)
    out = Image.fromarray(rgba, "RGBA")

    # alpha bbox 裁剪 + 6% 边距
    ys, xs = np.where(alpha > 0)
    if len(xs) == 0:
        raise RuntimeError("alpha 全空，抠图失败")
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    bw, bh = x1 - x0 + 1, y1 - y0 + 1
    mx, my = int(bw * 0.06), int(bh * 0.06)
    x0 = max(0, x0 - mx); y0 = max(0, y0 - my)
    x1 = min(out.width - 1, x1 + mx); y1 = min(out.height - 1, y1 + my)
    out = out.crop((x0, y0, x1 + 1, y1 + 1))

    # 最长边缩到 512
    w, hh = out.size
    scale = 512 / max(w, hh)
    if scale < 1:
        out = out.resize((max(1, round(w * scale)), max(1, round(hh * scale))), Image.LANCZOS)

    out.save(dst, "PNG")
    cov = float((alpha > 0).mean())
    return out.size, cov


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    ok, fail = [], []
    for fid in IDS:
        src, dst = RAW / f"{fid}.png", OUT / f"{fid}.png"
        try:
            size, cov = process(src, dst)
            ok.append((fid, size, cov))
            print(f"[OK] {fid}: {size[0]}x{size[1]} 主体占比={cov:.2%}")
        except Exception as e:
            fail.append((fid, str(e)))
            print(f"[FAIL] {fid}: {e}", file=sys.stderr)
    if fail:
        print("FAILURES:", fail, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
