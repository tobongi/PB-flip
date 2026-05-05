"""
Annotates a restaurant screenshot with table indices.
The projection is calibrated to the isometric debug view taken with orbit controls.
"""

from PIL import Image, ImageDraw, ImageFont
import sys, os

# ─── Table data (from extract-tables.js output) ────────────────────────────
TABLES = [
    # Zone 0: Front camera
    dict(index= 0, x=-3.111, y= 0.570, name="Rect_12"),
    dict(index= 1, x=-3.111, y= 3.315, name="Rect_11"),
    dict(index= 2, x=-3.061, y=10.393, name="Grande_01"),
    dict(index= 3, x=-3.111, y=17.633, name="Rect_10"),
    dict(index= 4, x= 4.764, y=18.153, name="Ronde_03"),
    dict(index= 5, x= 4.837, y=12.265, name="Rect_07"),
    dict(index= 6, x= 4.837, y= 7.199, name="Carree_05"),
    dict(index= 7, x= 4.764, y= 3.600, name="Ronde_04"),
    dict(index= 8, x= 4.837, y=-0.789, name="Rect_08"),
    # Promoted from 27/28
    dict(index= 9, x= 5.179, y=-7.486, name="Grande_02"),
    dict(index=10, x= 9.810, y=-7.492, name="Rect_13"),
    # Zone PI/2: Right camera
    dict(index=11, x=10.682, y=-1.242, name="Ronde_02"),
    dict(index=12, x=10.682, y= 2.573, name="Rect_01"),
    dict(index=13, x=10.682, y= 8.259, name="Rect_02"),
    dict(index=14, x=10.682, y=13.545, name="Carree_03"),
    # Zone PI/4: Diagonal camera
    dict(index=15, x=10.682, y=18.077, name="Rect_05"),
    # Zone 0: Far-right column
    dict(index=16, x=18.816, y=18.803, name="Carree_04"),
    dict(index=17, x=18.816, y=14.685, name="Rect_06"),
    dict(index=18, x=18.695, y=10.630, name="Ronde_01"),
    dict(index=19, x=18.816, y= 6.440, name="Rect_04"),
    dict(index=20, x=18.816, y= 0.628, name="Carree_02"),
    dict(index=21, x=18.816, y=-1.730, name="Carree_01"),
    dict(index=22, x=18.816, y=-6.932, name="Rect_03"),
    # Zone -PI/2: Left camera
    dict(index=23, x=18.816, y=-11.448, name="Carree_06"),
    dict(index=24, x=17.060, y=-18.077, name="Rect_09"),
    dict(index=25, x=11.821, y=-18.183, name="Ronde_05"),
    dict(index=26, x= 6.216, y=-18.108, name="Carree_07"),
    dict(index=27, x= 2.243, y=-17.965, name="Rect_14"),
    # Zone -PI: Back camera
    dict(index=28, x=-3.001, y=-18.018, name="Grande_03"),
]

# ─── Camera projection ──────────────────────────────────────────────────────
# Estimated affine transform calibrated to the screenshot.
# pixel_x = OX + world_x * SX + world_y * SYX
# pixel_y = OY + world_x * SXY - world_y * SY
OX  = 490.0   # x origin (pixel x when world x=0, y=0)
OY  = 420.0   # y origin
SX  = 25.0    # px per world-X unit (moving right in world → right in image)
SYX =  4.0    # px per world-Y unit  (going deeper → shifts right slightly)
SXY =  5.0    # px per world-X unit  (moving right in world → slightly down in image)
SY  = 17.0    # px per world-Y unit  (going deeper → moves up in image)

def project(wx, wy):
    px = OX + wx * SX + wy * SYX
    py = OY + wx * SXY - wy * SY
    return int(px), int(py)

# ─── Zone colours ──────────────────────────────────────────────────────────
import math
ANGLE_COLOR = {
     0.0:              (232, 117,  10),   # PB Orange  — tables 0-8, 14-20
     math.pi/2:        (140, 179,  63),   # PB Green   — tables 9-12
     math.pi/4:        (212, 160,  23),   # PB Gold    — table 13
    -math.pi/2:        ( 59, 130, 246),   # Blue       — tables 21-25
    -math.pi:          (148, 163, 184),   # Slate      — tables 26-29
}

CAMERA_ANGLES = {
     0: 0.0,
     1: 0.0,
     2: 0.0,
     3: 0.0,
     4: 0.0,
     5: 0.0,
     6: 0.0,
     7: 0.0,
     8: 0.0,
     9: 0.0,        # Grande_02 — promoted, front zone
    10: 0.0,        # Rect_13   — promoted, front zone
    11: math.pi/2,
    12: math.pi/2,
    13: math.pi/2,
    14: math.pi/2,
    15: math.pi/4,
    16: 0.0,
    17: 0.0,
    18: 0.0,
    19: 0.0,
    20: 0.0,
    21: 0.0,
    22: 0.0,
    23: -math.pi/2,
    24: -math.pi/2,
    25: -math.pi/2,
    26: -math.pi/2,
    27: -math.pi/2,
    28: -math.pi,
}

# ─── Draw ──────────────────────────────────────────────────────────────────
INPUT  = r"C:\Users\drama\.claude\image-cache\99e53f36-82fa-47b9-98d4-7ceed091f624\1.png"
OUTPUT = r"C:\Users\drama\documents\despii\PB-flip\docs\annotated-tables.png"

img  = Image.open(INPUT).convert("RGBA")
draw = ImageDraw.Draw(img)

R = 18  # badge radius

# Try to load a decent font; fall back to default
try:
    font_big  = ImageFont.truetype("arial.ttf", 20)
    font_sm   = ImageFont.truetype("arial.ttf", 11)
except:
    try:
        font_big = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 20)
        font_sm  = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 11)
    except:
        font_big = ImageFont.load_default()
        font_sm  = font_big

for t in TABLES:
    px, py = project(t["x"], t["y"])
    angle  = CAMERA_ANGLES.get(t["index"], 0.0)
    color  = ANGLE_COLOR.get(angle, (255, 255, 255))
    label  = str(t["index"])

    # Drop shadow for readability
    draw.ellipse([px-R-1, py-R-1, px+R+1, py+R+1], fill=(0, 0, 0, 180))
    # Coloured badge
    draw.ellipse([px-R, py-R, px+R, py+R], fill=(*color, 230))
    # Thin white border
    draw.ellipse([px-R, py-R, px+R, py+R], outline=(255, 255, 255, 200), width=2)

    # Centre the label text
    bbox = draw.textbbox((0, 0), label, font=font_big)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text((px - tw//2, py - th//2 - 1), label, fill=(255, 255, 255, 255), font=font_big)

# ── Legend ────────────────────────────────────────────────────────────────
legend = [
    ("Orange  — Front camera (0-10, 16-22)",  (232, 117, 10)),
    ("Green   — Right camera (11-14)",         (140, 179, 63)),
    ("Gold    — Diagonal camera (15)",          (212, 160, 23)),
    ("Blue    — Left camera (23-27)",           ( 59, 130, 246)),
    ("Slate   — Back camera (28)",              (148, 163, 184)),
]
lx, ly = 8, img.height - len(legend)*24 - 8
for text, color in legend:
    draw.rectangle([lx, ly+3, lx+16, ly+19], fill=(*color, 230))
    draw.text((lx+22, ly), text, fill=(255,255,255,230), font=font_sm)
    ly += 22

os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
img.save(OUTPUT)
print(f"Saved: {OUTPUT}")
