import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { TABLES, FLOOR_BOUNDS, PATH, zoneColor } from "./tableData";

const CANVAS_W = 1080;
const CANVAS_H = 1920;

// Map world coords → SVG px. Y is flipped (world +Y = top of screen).
const MAP_PAD  = 80;
const MAP_W    = CANVAS_W - MAP_PAD * 2;
const MAP_H    = CANVAS_H * 0.72;   // leave room for legend at bottom
const MAP_TOP  = 100;

const WORLD_W  = FLOOR_BOUNDS.maxX - FLOOR_BOUNDS.minX;
const WORLD_H  = FLOOR_BOUNDS.maxY - FLOOR_BOUNDS.minY;
const SCALE    = Math.min(MAP_W / WORLD_W, MAP_H / WORLD_H);

function wx(x) {
  return MAP_PAD + (x - FLOOR_BOUNDS.minX) * SCALE;
}
function wy(y) {
  // flip Y so positive world-Y appears at top
  return MAP_TOP + (FLOOR_BOUNDS.maxY - y) * SCALE;
}

// Frames per table in the animated sequence
const FRAMES_PER_TABLE = 38;
// Intro: show full map for 2 seconds before tour starts
const INTRO_FRAMES = 60;

const GAME_TABLES = TABLES.filter(t => !t.isCounter);
const COUNTER = TABLES.find(t => t.isCounter);

function isRound(name) {
  return name.includes("Ronde");
}

function TableShape({ table, active, visited, frame, fps }) {
  const x = wx(table.x);
  const y = wy(table.y);
  const w = table.width  * SCALE;
  const h = table.depth  * SCALE;
  const fill  = zoneColor(table.cameraAngle);
  const round = isRound(table.name);

  const glowOpacity = active
    ? interpolate(frame % FRAMES_PER_TABLE, [0, 8, FRAMES_PER_TABLE - 8, FRAMES_PER_TABLE], [0, 1, 1, 0], { extrapolateRight: "clamp" })
    : 0;

  const scaleVal = active
    ? spring({ fps, frame: frame % FRAMES_PER_TABLE, config: { damping: 14, stiffness: 140 } })
    : 1;

  const opacity = visited || active ? 1 : 0.35;

  return (
    <g
      transform={`translate(${x},${y}) scale(${scaleVal})`}
      style={{ transformOrigin: `${x}px ${y}px` }}
      opacity={opacity}
    >
      {/* Glow ring */}
      {active && (
        round ? (
          <circle cx={0} cy={0} r={(w / 2) + 8} fill="none" stroke="#FFFFFF" strokeWidth={3} opacity={glowOpacity} />
        ) : (
          <rect x={-w / 2 - 8} y={-h / 2 - 8} width={w + 16} height={h + 16} rx={4} fill="none" stroke="#FFFFFF" strokeWidth={3} opacity={glowOpacity} />
        )
      )}

      {/* Table body */}
      {round ? (
        <circle cx={0} cy={0} r={w / 2} fill={fill} stroke={active ? "#fff" : "#1a1a1a"} strokeWidth={active ? 2 : 1} />
      ) : (
        <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={3} fill={fill} stroke={active ? "#fff" : "#1a1a1a"} strokeWidth={active ? 2 : 1} />
      )}

      {/* Index label */}
      <text
        x={0} y={0}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={Math.min(w, h) * 0.42}
        fontFamily="monospace"
        fontWeight="bold"
        fill={active ? "#fff" : "#1a1a1a"}
      >
        {table.index}
      </text>
    </g>
  );
}

function PathLine({ tables, activeIndex }) {
  if (activeIndex <= 0) return null;
  const pts = tables.slice(0, activeIndex + 1).map(t => `${wx(t.x)},${wy(t.y)}`).join(" ");
  return (
    <polyline
      points={pts}
      fill="none"
      stroke="#FFFFFF"
      strokeWidth={2}
      strokeDasharray="6 4"
      opacity={0.55}
    />
  );
}

export function FloorMap() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Which table is currently highlighted in the tour
  const tourFrame = Math.max(0, frame - INTRO_FRAMES);
  const activeIndex = Math.min(
    Math.floor(tourFrame / FRAMES_PER_TABLE),
    GAME_TABLES.length - 1
  );
  const isTourStarted = frame >= INTRO_FRAMES;

  // Title fade-in
  const titleOpacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" });

  // Active table info
  const active = GAME_TABLES[activeIndex];
  const angleNames = {
    "0":                   "Front",
    "1.5707963267948966":  "Right",
    "0.7853981633974483":  "Diagonal",
    "-1.5707963267948966": "Left",
    "-3.141592653589793":  "Back",
  };

  const infoOpacity = isTourStarted
    ? interpolate(frame % FRAMES_PER_TABLE, [0, 10, FRAMES_PER_TABLE - 6, FRAMES_PER_TABLE], [0, 1, 1, 0], { extrapolateRight: "clamp" })
    : 0;

  return (
    <div
      style={{
        width: CANVAS_W,
        height: CANVAS_H,
        background: "#2D3319",
        position: "relative",
        fontFamily: "sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Title */}
      <div
        style={{
          position: "absolute",
          top: 28,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: titleOpacity,
        }}
      >
        <div style={{ color: "#E8750A", fontSize: 44, fontWeight: 900, letterSpacing: 2 }}>
          LA MAISON PB
        </div>
        <div style={{ color: "#FFF3E0", fontSize: 22, opacity: 0.7, marginTop: 4 }}>
          Table Layout — {GAME_TABLES.length} landing targets
        </div>
      </div>

      {/* SVG floor plan */}
      <svg
        width={CANVAS_W}
        height={MAP_TOP + MAP_H + 20}
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        {/* Floor rectangle */}
        <rect
          x={MAP_PAD}
          y={MAP_TOP}
          width={MAP_W}
          height={MAP_H}
          rx={8}
          fill="#FFF3E0"
          opacity={0.08}
        />
        {/* Floor border */}
        <rect
          x={MAP_PAD}
          y={MAP_TOP}
          width={MAP_W}
          height={MAP_H}
          rx={8}
          fill="none"
          stroke="#FFF3E0"
          strokeWidth={1.5}
          opacity={0.25}
        />

        {/* Counter / bar */}
        {COUNTER && (
          <rect
            x={wx(COUNTER.x) - (COUNTER.width * SCALE) / 2}
            y={wy(COUNTER.y) - (COUNTER.depth * SCALE) / 2}
            width={COUNTER.width * SCALE}
            height={COUNTER.depth * SCALE}
            rx={4}
            fill="#6B3A1B"
            stroke="#D4A017"
            strokeWidth={1.5}
            opacity={0.6}
          />
        )}
        {COUNTER && (
          <text
            x={wx(COUNTER.x)}
            y={wy(COUNTER.y)}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={16}
            fill="#D4A017"
            fontFamily="monospace"
            opacity={0.9}
          >
            COMPTOIR
          </text>
        )}

        {/* Path trace */}
        <PathLine tables={GAME_TABLES} activeIndex={isTourStarted ? activeIndex : -1} />

        {/* Tables */}
        {GAME_TABLES.map(t => (
          <TableShape
            key={t.index}
            table={t}
            active={isTourStarted && t.index === activeIndex}
            visited={isTourStarted && t.index < activeIndex}
            frame={frame}
            fps={fps}
          />
        ))}
      </svg>

      {/* Active table info panel */}
      {isTourStarted && (
        <div
          style={{
            position: "absolute",
            bottom: 160,
            left: MAP_PAD,
            right: MAP_PAD,
            background: "rgba(0,0,0,0.55)",
            borderRadius: 16,
            padding: "28px 36px",
            opacity: infoOpacity,
            borderLeft: `6px solid ${zoneColor(active.cameraAngle)}`,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ color: zoneColor(active.cameraAngle), fontSize: 48, fontWeight: 900 }}>
                #{active.index}
              </div>
              <div style={{ color: "#FFF3E0", fontSize: 22, marginTop: 4, opacity: 0.85 }}>
                {active.name.replace("PB_", "").replace(/_/g, " ")}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "#FFF3E0", fontSize: 18, opacity: 0.6 }}>Camera</div>
              <div style={{ color: zoneColor(active.cameraAngle), fontSize: 26, fontWeight: 700 }}>
                {angleNames[String(active.cameraAngle)] ?? "Front"}
              </div>
              <div style={{ color: "#FFF3E0", fontSize: 15, opacity: 0.45, marginTop: 6 }}>
                {active.x.toFixed(1)}, {active.y.toFixed(1)} world
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div
        style={{
          position: "absolute",
          bottom: 40,
          left: MAP_PAD,
          right: MAP_PAD,
          display: "flex",
          justifyContent: "space-between",
          opacity: titleOpacity,
        }}
      >
        {[
          ["#E8750A", "Front"],
          ["#8CB33F", "Right"],
          ["#D4A017", "Diag"],
          ["#3B82F6", "Left"],
          ["#94A3B8", "Back"],
        ].map(([color, label]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 18, height: 18, borderRadius: 4, background: color }} />
            <span style={{ color: "#FFF3E0", fontSize: 18, opacity: 0.75 }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
