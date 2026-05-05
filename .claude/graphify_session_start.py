import json, sys
from pathlib import Path

report_path = Path("graphify-out/GRAPH_REPORT.md")
graph_path = Path("graphify-out/graph.json")

if not graph_path.exists():
    sys.exit(0)

lines = report_path.read_text(encoding="utf-8").split("\n") if report_path.exists() else []

sections = ["## God Nodes", "## Surprising Connections", "## Suggested Questions", "## Knowledge Gaps"]
keep, active = [], False
for line in lines:
    if any(line.startswith(s) for s in sections):
        active = True
    elif line.startswith("## ") and not any(line.startswith(s) for s in sections):
        active = False
    if active:
        keep.append(line)

ctx = (
    "GRAPHIFY GRAPH LOADED - use it before reading source files to save context.\n"
    "Use /graphify query, /graphify explain, or /graphify path.\n"
    "graph.json is at graphify-out/graph.json | report at graphify-out/GRAPH_REPORT.md\n\n"
    + "\n".join(keep)
)
ctx_safe = ctx.encode("ascii", errors="replace").decode("ascii")
out = json.dumps({"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": ctx_safe}})
sys.stdout.buffer.write(out.encode("utf-8"))
