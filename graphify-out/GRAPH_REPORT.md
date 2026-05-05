# Graph Report - PB-flip  (2026-05-05)

## Corpus Check
- 83 files · ~14,910,315 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 577 nodes · 797 edges · 38 communities detected
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 38 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `493ad769`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 54|Community 54]]

## God Nodes (most connected - your core abstractions)
1. `Game` - 47 edges
2. `CameraController` - 38 edges
3. `TextTexture` - 28 edges
4. `CameraController` - 26 edges
5. `Bottle` - 16 edges
6. `Seamless Orthoâ†”Persp Projection Blend Plan` - 12 edges
7. `isDebugEnabled()` - 10 edges
8. `Block` - 10 edges
9. `scoreMatch()` - 9 edges
10. `CameraController (State Machine Rewrite)` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Table Numbering System (0-28)` --conceptually_related_to--> `Restaurant World Configuration`  [INFERRED]
  docs/annotated-tables.png → src/game/worlds/restaurant.js
- `Annotated Restaurant Tables Screenshot` --conceptually_related_to--> `Restaurant World Configuration`  [INFERRED]
  docs/annotated-tables.png → src/game/worlds/restaurant.js
- `Phase 3 â€” React Three Fiber Migration Plan` --references--> `Poulet BraisÃ© Flip â€” Project Root`  [INFERRED]
  docs/phase-3-r3f-migration.md → README.md
- `Poulet BraisÃ© Flip â€” Project Root` --references--> `Poulet BraisÃ© Flip Web App Entry Point`  [INFERRED]
  README.md → public/index.html
- `Label Tracking Design â€” Block-Travel Axis Strategy` --semantically_similar_to--> `_computeTargetZoom â€” View-Space Extent Fitting`  [INFERRED] [semantically similar]
  docs/phase-3-r3f-migration.md → docs/superpowers/plans/2026-04-30-adaptive-camera-zoom.md

## Hyperedges (group relationships)
- **Seamless Projection Blend System â€” State, Damping, Matrix Lerp** — projblend_blend_state, projblend_damping_constant, projblend_matrix_lerp, projblend_apply_projection, projblend_set_projection [EXTRACTED 1.00]
- **CameraController State Machine â€” Label Tracking, Flip Modes, Projection Swap** — phase3doc_cameracontroller, phase3doc_label_tracking, phase3doc_flip_modes, phase3doc_projection_swap [EXTRACTED 1.00]
- **Adaptive Zoom Pipeline â€” Compute, Damping, UI Compensation, Ground Plane** — adaptivezoom_compute_zoom, adaptivezoom_flip_damping, adaptivezoom_ui_compensation, adaptivezoom_ground_plane [EXTRACTED 1.00]

## Communities (76 total, 18 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (12): computeGameSize(), updateViewport(), isDebugEnabled(), getCubeById(), applyQuaternion(), applyVector(), cloneCheckpoint(), Game (+4 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (37): _computeTargetZoom â€” View-Space Extent Fitting, Zoom Constants (CAM_ZOOM_MIN/MAX/PADDING), Dual Zoom Damping (flip vs idle), Ground Plane 3x Enlargement for Zoom-Out, Adaptive Camera Zoom Implementation Plan, UI Group Counter-Scale Compensation, Poulet BraisÃ© Flip Web App Entry Point, Cormorant Garamond Font (+29 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (9): App, BottleGLB, GameCanvas, Landing, Loading, _loadWinBottleScene(), Score, Win (+1 more)

### Community 6 - "Community 6"
Cohesion: 0.12
Nodes (14): applyOverrideAndScreenshot(), evalAngleExpr(), readCurrentOverrides(), scoreCombo(), decodePng(), dhashBits(), geoScore(), grayscale() (+6 more)

### Community 7 - "Community 7"
Cohesion: 0.17
Nodes (15): FloorMap(), isRound(), TableShape(), wx(), wy(), fadeIn(), SceneBenchmark(), SceneGraph() (+7 more)

### Community 9 - "Community 9"
Cohesion: 0.16
Nodes (8): bucket(), ndcToScreen(), projectWorldToNDC(), scoreFrame(), scoreGeometric(), scorePixel(), applyOverrideAndScreenshot(), settle()

### Community 10 - "Community 10"
Cohesion: 0.14
Nodes (5): AddScoreText, CenterText, ScoreText, ShadowText, Text

### Community 11 - "Community 11"
Cohesion: 0.26
Nodes (5): evalSafeNumber(), parseOverrideBlob(), parseOverrides(), parseSingleOverride(), parseVariants()

### Community 12 - "Community 12"
Cohesion: 0.41
Nodes (11): ceramicMat(), createCuttingBoard(), createGrillBlock(), createPlateStack(), createServingTray(), createSpiceShaker(), createTagine(), enableShadows() (+3 more)

### Community 14 - "Community 14"
Cohesion: 0.3
Nodes (8): buildCapStack(), buildCapStackNode(), applyTransform(), buildScene(), buildSceneWithRefs(), createGeometry(), createMaterial(), createObject()

### Community 15 - "Community 15"
Cohesion: 0.24
Nodes (4): computeWorldMatrix(), mat4FromTRS(), mat4Mul(), nodeLocalMatrix()

### Community 17 - "Community 17"
Cohesion: 0.27
Nodes (10): Blue-Labeled Tables (Different State/Zone), Outdoor Deck/Patio Area, Green-Labeled Tables (Special State), Color Legend (Bottom-Left), Orange-Labeled Tables (Active/Available), Annotated Restaurant Tables Screenshot, Metal Railing/Divider Structure, Restaurant 3D Scene (+2 more)

### Community 18 - "Community 18"
Cohesion: 0.33
Nodes (10): Bottle Visual / Game Object, Poulet Braise Depuis 2009 (Brand Tagline), Corner Bracket Frame Decoration, Dark Olive/Green Background, PB Flip Bottle (Game Title), JOUER (Play Button CTA), La Maison PB (Footer Brand Text), Mobile Portrait Layout (+2 more)

### Community 19 - "Community 19"
Cohesion: 0.32
Nodes (3): makeController(), makeFakeAddScoreText(), makeFakeLight()

### Community 20 - "Community 20"
Cohesion: 0.32
Nodes (8): Bottle/Container 3D Object, Dark Green Header UI Bar, Falling Objects In Flight, PB Flip Game Mechanic, Isometric Camera View, Restaurant Scene Game State, Playtest After Jouer Screenshot, Wooden Table 3D Object

### Community 21 - "Community 21"
Cohesion: 0.47
Nodes (3): makeController(), makeFakeAddScoreText(), makeFakeLight()

### Community 25 - "Community 25"
Cohesion: 0.6
Nodes (3): ensureSlash(), getPublicUrl(), getServedPath()

### Community 31 - "Community 31"
Cohesion: 0.7
Nodes (4): dump(), makeBlock(), makeBottle(), makeCtrl()

### Community 32 - "Community 32"
Cohesion: 0.5
Nodes (5): In-Game Sauce Label Texture Asset, Green Herb Sauce Product, Quiet Brain Brand, Sauce PB Verte l'Originale, Squeeze Bottle Packaging

### Community 39 - "Community 39"
Cohesion: 0.83
Nodes (4): La Maison PB, PB Logo, Since 2009 (Brand Founded), Sticker Rond PB

## Knowledge Gaps
- **26 isolated node(s):** `Annotates a restaurant screenshot with table indices. The projection is calibrat`, `Cormorant Garamond Font`, `Josefin Sans Font`, `WeChat JS-SDK (jweixin-1.2.0)`, `React Three Fiber (R3F)` (+21 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getCubeById()` connect `Community 0` to `Community 12`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Why does `isDebugEnabled()` connect `Community 0` to `Community 13`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **What connects `Annotates a restaurant screenshot with table indices. The projection is calibrat`, `Cormorant Garamond Font`, `Josefin Sans Font` to the rest of the system?**
  _26 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._