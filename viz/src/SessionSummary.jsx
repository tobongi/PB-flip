import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion";

const W = 1080;
const H = 1920;
const BG = "#1A1F0A";
const ORANGE = "#E8750A";
const CREAM = "#FFF3E0";
const GOLD = "#D4A017";
const GREEN = "#8CB33F";

const S1_IN = 0;
const S2_IN = 150;
const S3_IN = 360;
const S4_IN = 570;
const S5_IN = 780;

function fadeIn(frame, start, dur = 20) {
  return interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

function slideUp(frame, start, dur = 28) {
  const t = interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return { opacity: t, transform: `translateY(${(1 - t) * 44}px)` };
}

function useCounter(frame, start, value, dur = 70) {
  return Math.round(
    interpolate(frame, [start, start + dur], [0, value], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.quad),
    })
  );
}

// ── Scene 1: Intro ──────────────────────────────────────────────────────────

const DOT_GRID = Array.from({ length: 25 }, (_, i) => ({
  x: 108 + (i % 5) * 180,
  y: 580 + Math.floor(i / 5) * 160,
  delay: i * 5,
  colorIndex: i % 3,
}));
const DOT_COLORS = [ORANGE, GOLD, GREEN];

function SceneIntro({ frame }) {
  const { fps } = useVideoConfig();
  const titleSpring = spring({ fps, frame: frame - 8, config: { damping: 14, stiffness: 75 } });
  const subOpacity = fadeIn(frame, 55);
  const tagOpacity = fadeIn(frame, 95);

  return (
    <div
      style={{
        width: W,
        height: H,
        background: BG,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        fontFamily: "monospace",
      }}
    >
      {/* Animated graph background */}
      <svg
        style={{ position: "absolute", top: 0, left: 0, width: W, height: H, opacity: 0.18 }}
      >
        {DOT_GRID.map((d, i) => {
          const a = fadeIn(frame, d.delay, 18);
          return (
            <g key={i}>
              {i > 0 && i % 5 !== 0 && (
                <line
                  x1={DOT_GRID[i - 1].x}
                  y1={DOT_GRID[i - 1].y}
                  x2={d.x}
                  y2={d.y}
                  stroke={CREAM}
                  strokeWidth={1}
                  opacity={a * 0.4}
                />
              )}
              <circle
                cx={d.x}
                cy={d.y}
                r={10}
                fill={DOT_COLORS[d.colorIndex]}
                opacity={a}
              />
            </g>
          );
        })}
      </svg>

      {/* Title */}
      <div
        style={{
          textAlign: "center",
          transform: `scale(${titleSpring})`,
          opacity: titleSpring,
        }}
      >
        <div style={{ color: ORANGE, fontSize: 96, fontWeight: 900, letterSpacing: 6, lineHeight: 1 }}>
          GRAPHIFY
        </div>
        <div style={{ color: CREAM, fontSize: 38, opacity: 0.35, letterSpacing: 18, margin: "6px 0" }}>
          ×
        </div>
        <div style={{ color: CREAM, fontSize: 56, fontWeight: 700, letterSpacing: 8 }}>
          CLAUDE CODE
        </div>
      </div>

      {/* Subtitle */}
      <div
        style={{
          marginTop: 56,
          textAlign: "center",
          opacity: subOpacity,
          transform: `translateY(${(1 - subOpacity) * 18}px)`,
        }}
      >
        <div style={{ color: GOLD, fontSize: 26, letterSpacing: 3 }}>
          KNOWLEDGE GRAPH INTELLIGENCE
        </div>
        <div style={{ color: CREAM, fontSize: 20, opacity: 0.45, marginTop: 14 }}>
          PB-flip codebase · May 4, 2026
        </div>
      </div>

      {/* Bottom tagline */}
      <div
        style={{
          position: "absolute",
          bottom: 120,
          width: "100%",
          textAlign: "center",
          opacity: tagOpacity,
        }}
      >
        <div style={{ color: CREAM, fontSize: 19, opacity: 0.38, letterSpacing: 3 }}>
          85.8% FEWER TOKENS · 7.1× CONTEXT SAVINGS
        </div>
      </div>
    </div>
  );
}

// ── Scene 2: Graph Build ────────────────────────────────────────────────────

const GOD_NODES = [
  { name: "Game", edges: 47, color: ORANGE },
  { name: "CameraController", edges: 38, color: GOLD },
  { name: "TextTexture", edges: 28, color: GREEN },
  { name: "Bottle", edges: 16, color: "#3B82F6" },
  { name: "isDebugEnabled()", edges: 10, color: "#94A3B8" },
];

function SceneGraph({ frame }) {
  const nodes = useCounter(frame, S2_IN + 30, 434, 80);
  const edges = useCounter(frame, S2_IN + 50, 639, 80);
  const communities = useCounter(frame, S2_IN + 70, 48, 60);

  return (
    <div
      style={{
        width: W,
        height: H,
        background: BG,
        padding: "100px 80px 0",
        boxSizing: "border-box",
        fontFamily: "monospace",
      }}
    >
      <div style={slideUp(frame, S2_IN + 8)}>
        <div style={{ color: ORANGE, fontSize: 22, letterSpacing: 3, marginBottom: 14 }}>
          SCENE 2 — GRAPH BUILD
        </div>
        <div style={{ color: CREAM, fontSize: 54, fontWeight: 900, lineHeight: 1.1 }}>
          434 nodes.<br />639 edges.<br />48 communities.
        </div>
        <div style={{ color: CREAM, fontSize: 19, opacity: 0.4, marginTop: 14 }}>
          51 code · 5 docs · 6 images — AST + semantic extraction
        </div>
      </div>

      {/* Stat cards */}
      <div
        style={{
          display: "flex",
          gap: 28,
          marginTop: 50,
          opacity: fadeIn(frame, S2_IN + 28),
        }}
      >
        {[
          { label: "NODES", value: nodes, color: ORANGE },
          { label: "EDGES", value: edges, color: GOLD },
          { label: "COMMUNITIES", value: communities, color: GREEN },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.04)",
              borderRadius: 16,
              padding: "28px 20px",
              borderTop: `4px solid ${color}`,
            }}
          >
            <div style={{ color: color, fontSize: 52, fontWeight: 900 }}>{value}</div>
            <div style={{ color: CREAM, fontSize: 14, opacity: 0.45, letterSpacing: 2, marginTop: 8 }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* God nodes */}
      <div style={{ marginTop: 64, opacity: fadeIn(frame, S2_IN + 78) }}>
        <div style={{ color: CREAM, fontSize: 17, opacity: 0.4, letterSpacing: 2, marginBottom: 26 }}>
          GOD NODES — MOST CONNECTED
        </div>
        {GOD_NODES.map((node, i) => {
          const barW = interpolate(
            frame,
            [S2_IN + 92 + i * 12, S2_IN + 155 + i * 12],
            [0, (node.edges / 47) * 760],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          return (
            <div key={node.name} style={{ marginBottom: 22 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                <span style={{ color: CREAM, fontSize: 19 }}>{node.name}</span>
                <span style={{ color: node.color, fontSize: 19, fontWeight: 700 }}>
                  {node.edges} edges
                </span>
              </div>
              <div style={{ height: 10, background: "rgba(255,255,255,0.07)", borderRadius: 5 }}>
                <div
                  style={{
                    width: barW,
                    height: "100%",
                    background: node.color,
                    borderRadius: 5,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Surprise connection */}
      <div style={{ marginTop: 60, opacity: fadeIn(frame, S2_IN + 168) }}>
        <div style={{ color: CREAM, fontSize: 17, opacity: 0.4, letterSpacing: 2, marginBottom: 18 }}>
          SURPRISE CONNECTION [INFERRED]
        </div>
        <div
          style={{
            background: "rgba(232,117,10,0.10)",
            border: `1px solid ${ORANGE}44`,
            borderRadius: 14,
            padding: "22px 28px",
          }}
        >
          <span style={{ color: ORANGE, fontSize: 18 }}>Table Numbering System (0-28)</span>
          <span style={{ color: CREAM, fontSize: 18, opacity: 0.35, margin: "0 14px" }}>
            --conceptually_related_to--&gt;
          </span>
          <span style={{ color: GOLD, fontSize: 18 }}>Restaurant World Configuration</span>
          <div style={{ color: CREAM, fontSize: 14, opacity: 0.35, marginTop: 10 }}>
            docs/annotated-tables.png → src/game/worlds/restaurant.js
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Scene 3: Hooks ──────────────────────────────────────────────────────────

const HOOKS = [
  {
    event: "SessionStart",
    desc: "Injects graph summary every session",
    detail: "God nodes · Surprising connections · Knowledge gaps",
    note: "~820 tokens of context, automatically",
    color: ORANGE,
  },
  {
    event: "PreToolUse › Read|Glob|Grep",
    desc: "Intercepts file reads before they happen",
    detail: "Routes to graph instead of raw source files",
    note: "Prevents 3-12 KB file reads per query",
    color: GOLD,
  },
  {
    event: "PreToolUse › Bash",
    desc: "Intercepts grep/find/rg shell commands",
    detail: "Codebase searches go through the graph",
    note: "Prevents full-repo scans",
    color: GREEN,
  },
  {
    event: "Stop (async)",
    desc: "Auto-rebuilds graph after every session",
    detail: "graphify update . — AST-only, zero LLM cost",
    note: "Graph always fresh, zero maintenance",
    color: "#3B82F6",
  },
];

function SceneHooks({ frame }) {
  return (
    <div
      style={{
        width: W,
        height: H,
        background: BG,
        padding: "100px 80px 0",
        boxSizing: "border-box",
        fontFamily: "monospace",
      }}
    >
      <div style={slideUp(frame, S3_IN + 8)}>
        <div style={{ color: ORANGE, fontSize: 22, letterSpacing: 3, marginBottom: 14 }}>
          SCENE 3 — AUTOMATION HOOKS
        </div>
        <div style={{ color: CREAM, fontSize: 52, fontWeight: 900, lineHeight: 1.1 }}>
          4 hooks.<br />Zero manual steps.
        </div>
        <div style={{ color: CREAM, fontSize: 18, opacity: 0.38, marginTop: 16 }}>
          Wired into .claude/settings.json
        </div>
      </div>

      <div style={{ marginTop: 56 }}>
        {HOOKS.map((hook, i) => {
          const delay = S3_IN + 50 + i * 38;
          const opacity = fadeIn(frame, delay, 22);
          const ty = interpolate(frame, [delay, delay + 22], [32, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={hook.event}
              style={{
                marginBottom: 30,
                opacity,
                transform: `translateY(${ty}px)`,
                background: "rgba(255,255,255,0.035)",
                borderRadius: 16,
                padding: "26px 30px",
                borderLeft: `5px solid ${hook.color}`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      color: hook.color,
                      fontSize: 15,
                      fontWeight: 700,
                      letterSpacing: 1,
                      marginBottom: 8,
                    }}
                  >
                    {hook.event}
                  </div>
                  <div style={{ color: CREAM, fontSize: 20, fontWeight: 600, marginBottom: 5 }}>
                    {hook.desc}
                  </div>
                  <div style={{ color: CREAM, fontSize: 15, opacity: 0.42 }}>{hook.detail}</div>
                </div>
                <div
                  style={{
                    marginLeft: 18,
                    background: `${hook.color}22`,
                    border: `1px solid ${hook.color}55`,
                    borderRadius: 8,
                    padding: "5px 14px",
                    color: hook.color,
                    fontSize: 13,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    letterSpacing: 1,
                  }}
                >
                  ACTIVE
                </div>
              </div>
              <div style={{ marginTop: 12, color: GREEN, fontSize: 14, opacity: 0.65 }}>
                {hook.note}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Scene 4: Benchmark ──────────────────────────────────────────────────────

const TASKS = [
  { name: "CameraController architecture", pathA: 4187, pathB: 591 },
  { name: "Bottle dependencies", pathA: 2843, pathB: 397 },
  { name: "Debug mode usage", pathA: 1624, pathB: 218 },
  { name: "Game → TextTexture path", pathA: 5092, pathB: 718 },
  { name: "Zoom pipeline walkthrough", pathA: 3876, pathB: 546 },
];
const TASK_MAX = 5200;
const BAR_W = 360;

function SceneBenchmark({ frame }) {
  return (
    <div
      style={{
        width: W,
        height: H,
        background: BG,
        padding: "100px 70px 0",
        boxSizing: "border-box",
        fontFamily: "monospace",
      }}
    >
      <div style={slideUp(frame, S4_IN + 8)}>
        <div style={{ color: ORANGE, fontSize: 22, letterSpacing: 3, marginBottom: 14 }}>
          SCENE 4 — BENCHMARK
        </div>
        <div style={{ color: CREAM, fontSize: 50, fontWeight: 900, lineHeight: 1.1 }}>
          Token usage.<br />Measured exactly.
        </div>
        <div style={{ color: CREAM, fontSize: 17, opacity: 0.38, marginTop: 14 }}>
          tiktoken cl100k_base · 5 representative tasks
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: 40,
          marginTop: 38,
          opacity: fadeIn(frame, S4_IN + 28),
        }}
      >
        {[
          { color: "#4B5563", label: "Path A: raw files" },
          { color: ORANGE, label: "Path B: graphify" },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 22, height: 22, borderRadius: 5, background: color }} />
            <span style={{ color: CREAM, fontSize: 17, opacity: 0.65 }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Bars */}
      <div style={{ marginTop: 38 }}>
        {TASKS.map((task, i) => {
          const delay = S4_IN + 48 + i * 22;
          const wA = interpolate(frame, [delay, delay + 60], [0, (task.pathA / TASK_MAX) * BAR_W], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const wB = interpolate(frame, [delay + 8, delay + 68], [0, (task.pathB / TASK_MAX) * BAR_W], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const labelOpacity = fadeIn(frame, delay + 18, 18);
          const savings = Math.round((1 - task.pathB / task.pathA) * 100);

          return (
            <div key={task.name} style={{ marginBottom: 28 }}>
              <div style={{ color: CREAM, fontSize: 16, opacity: 0.55, marginBottom: 8 }}>
                {task.name}
              </div>
              <div style={{ marginBottom: 5 }}>
                <div
                  style={{
                    height: 18,
                    background: "#4B5563",
                    width: wA,
                    borderRadius: 4,
                    marginBottom: 5,
                  }}
                />
                <div
                  style={{
                    height: 18,
                    background: ORANGE,
                    width: wB,
                    borderRadius: 4,
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  opacity: labelOpacity,
                }}
              >
                <span style={{ color: CREAM, fontSize: 14, opacity: 0.42 }}>
                  {task.pathA.toLocaleString()} vs {task.pathB.toLocaleString()} tok
                </span>
                <span style={{ color: GREEN, fontSize: 14, fontWeight: 700 }}>−{savings}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Totals card */}
      <div style={{ marginTop: 36, opacity: fadeIn(frame, S4_IN + 185) }}>
        <div
          style={{
            background: "rgba(232,117,10,0.10)",
            border: `1px solid ${ORANGE}44`,
            borderRadius: 16,
            padding: "26px 32px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ color: CREAM, fontSize: 15, opacity: 0.42, marginBottom: 10 }}>
                TOTAL — 5 TASKS (tiktoken verified)
              </div>
              <div style={{ color: CREAM, fontSize: 26, fontWeight: 700 }}>
                <span style={{ color: "#6B7280" }}>17,622</span>
                {" → "}
                <span style={{ color: ORANGE }}>2,470</span>
                {" tokens"}
              </div>
              <div style={{ color: CREAM, fontSize: 15, opacity: 0.38, marginTop: 8 }}>
                15,152 tokens saved · 85.8%
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: GREEN, fontSize: 58, fontWeight: 900, lineHeight: 1 }}>7.1×</div>
              <div style={{ color: CREAM, fontSize: 15, opacity: 0.42, marginTop: 4 }}>reduction</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Scene 5: Summary ────────────────────────────────────────────────────────

const BUILT = [
  ["Knowledge graph", "434 nodes · 639 edges · 48 communities"],
  ["SessionStart hook", "Graph summary injected every session (~820 tok)"],
  ["PreToolUse hooks", "Read/Grep/Bash intercepted — graph first"],
  ["Stop hook", "graphify update . — async, AST-only, free"],
  ["git post-commit", "Graph rebuilds on every commit automatically"],
];

function SceneSummary({ frame }) {
  const { fps } = useVideoConfig();
  const localFrame = frame - S5_IN;

  return (
    <div
      style={{
        width: W,
        height: H,
        background: BG,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "monospace",
        padding: "0 80px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ ...slideUp(frame, S5_IN + 8), textAlign: "center", width: "100%" }}>
        <div style={{ color: ORANGE, fontSize: 20, letterSpacing: 4, marginBottom: 20 }}>
          SCENE 5 — SUMMARY
        </div>
        <div style={{ color: CREAM, fontSize: 60, fontWeight: 900, lineHeight: 1.05 }}>
          Ship smarter.<br />Read less.<br />Know more.
        </div>
      </div>

      {/* Big stats */}
      <div
        style={{
          display: "flex",
          gap: 20,
          marginTop: 56,
          width: "100%",
        }}
      >
        {[
          { value: "85.8%", label: "TOKEN SAVINGS", color: ORANGE },
          { value: "7.1×", label: "CONTEXT REDUCTION", color: GOLD },
          { value: "~0s", label: "MANUAL EFFORT", color: GREEN },
        ].map((s, i) => {
          const sp = spring({
            fps,
            frame: localFrame - 40 - i * 14,
            config: { damping: 12, stiffness: 95 },
          });
          return (
            <div
              key={s.label}
              style={{
                flex: 1,
                textAlign: "center",
                opacity: sp,
                transform: `translateY(${(1 - sp) * 28}px)`,
                background: "rgba(255,255,255,0.04)",
                borderRadius: 16,
                padding: "28px 12px",
                borderTop: `4px solid ${s.color}`,
              }}
            >
              <div style={{ color: s.color, fontSize: 50, fontWeight: 900, lineHeight: 1 }}>
                {s.value}
              </div>
              <div style={{ color: CREAM, fontSize: 12, opacity: 0.38, letterSpacing: 2, marginTop: 10 }}>
                {s.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* What we built */}
      <div style={{ width: "100%", marginTop: 52 }}>
        <div
          style={{
            color: CREAM,
            fontSize: 15,
            opacity: 0.35,
            letterSpacing: 2,
            marginBottom: 20,
            opacity: fadeIn(frame, S5_IN + 88),
          }}
        >
          WHAT WE BUILT
        </div>
        {BUILT.map(([title, detail], i) => {
          const opacity = fadeIn(frame, S5_IN + 100 + i * 18, 18);
          return (
            <div
              key={title}
              style={{ display: "flex", gap: 16, marginBottom: 20, opacity }}
            >
              <div style={{ color: GREEN, fontSize: 20, flexShrink: 0, lineHeight: 1.4 }}>✓</div>
              <div>
                <span style={{ color: CREAM, fontSize: 19, fontWeight: 700 }}>{title}</span>
                <span style={{ color: CREAM, fontSize: 16, opacity: 0.4, marginLeft: 14 }}>
                  {detail}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Closing */}
      <div
        style={{
          marginTop: 52,
          textAlign: "center",
          opacity: fadeIn(frame, S5_IN + 195),
        }}
      >
        <div style={{ color: GOLD, fontSize: 28, fontWeight: 700 }}>PB-flip · La Maison PB</div>
        <div style={{ color: CREAM, fontSize: 17, opacity: 0.3, marginTop: 10 }}>
          graphify × claude-code · May 2026
        </div>
      </div>
    </div>
  );
}

// ── Root ────────────────────────────────────────────────────────────────────

const SCENE_STARTS = {
  intro: S1_IN,
  graph: S2_IN,
  hooks: S3_IN,
  benchmark: S4_IN,
  summary: S5_IN,
};

export function SessionSummary() {
  const frame = useCurrentFrame();

  const scene =
    frame < S2_IN
      ? "intro"
      : frame < S3_IN
      ? "graph"
      : frame < S4_IN
      ? "hooks"
      : frame < S5_IN
      ? "benchmark"
      : "summary";

  const sceneStart = SCENE_STARTS[scene];
  const transitionOpacity = interpolate(frame, [sceneStart, sceneStart + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div style={{ width: W, height: H, opacity: transitionOpacity }}>
      {scene === "intro" && <SceneIntro frame={frame} />}
      {scene === "graph" && <SceneGraph frame={frame} />}
      {scene === "hooks" && <SceneHooks frame={frame} />}
      {scene === "benchmark" && <SceneBenchmark frame={frame} />}
      {scene === "summary" && <SceneSummary frame={frame} />}
    </div>
  );
}
