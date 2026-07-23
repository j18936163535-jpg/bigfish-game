#!/usr/bin/env python3
"""拼 4×4 总览图（白底），供视觉自查"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path("/Users/lala/ kimi workspace/大鱼吃小鱼/public/assets/fish")
IDS = ["shrimp", "clown", "blue_tang", "guppy", "sardine", "puffer_baby",
       "butterfly", "crab", "seahorse", "squid", "lionfish", "angelfish",
       "pompano", "boxfish", "eel", "grouper"]
CELL = 260
sheet = Image.new("RGB", (CELL * 4, CELL * 4), (255, 255, 255))
draw = ImageDraw.Draw(sheet)
for i, fid in enumerate(IDS):
    im = Image.open(OUT / f"{fid}.png").convert("RGBA")
    im.thumbnail((CELL - 24, CELL - 40), Image.LANCZOS)
    cx, cy = (i % 4) * CELL, (i // 4) * CELL
    sheet.paste(im, (cx + (CELL - im.width) // 2, cy + (CELL - 24 - im.height) // 2), im)
    draw.text((cx + 8, cy + CELL - 26), fid, fill=(30, 30, 30))
    draw.rectangle([cx, cy, cx + CELL - 1, cy + CELL - 1], outline=(220, 220, 220))
sheet.save("/Users/lala/ kimi workspace/大鱼吃小鱼/public/assets/fish/_overview.png")
print("saved _overview.png", sheet.size)
