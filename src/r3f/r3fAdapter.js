// r3fAdapter.js
//
// Phase 3 R3F migration — the JSX side.
//
// This file is intentionally inert today. It exists to prove that every
// shape produced by sceneDSL.js is a 1:1 match for an @react-three/fiber
// JSX tree. Once the React 16 -> 17 and three 0.89 -> 0.155 upgrades have
// landed (see docs/phase-3-r3f-migration.md), uncomment the JSX block
// below and replace `buildScene(node)` call sites with `<Scene node={node} />`.
//
// The mapping is mechanical:
//
//   { type: 'group', position: [...], children: [...] }
//     -> <group position={[...]}>...</group>
//
//   { type: 'mesh', position, rotation, scale,
//     geometry: { type: 'lathe', args: [...] },
//     material: { type: 'meshStandard', args: [{...}] } }
//     -> <mesh position={...} rotation={...} scale={...}>
//          <latheGeometry args={[...]} />
//          <meshStandardMaterial {...args[0]} />
//        </mesh>
//
// The `name` attribute becomes a `ref` callback that populates a refs
// map identical to the one returned by buildSceneWithRefs(), so every
// imperative `refs['collar'].rotation.x = ...` site keeps working
// without modification across the migration.

/* eslint-disable no-unused-vars */

// Uncomment after R3F install (see migration doc):
//
// import React, { useRef, useEffect } from 'react';
//
// const GEOMETRY_TAGS = {
//   lathe: 'latheGeometry',
//   cylinder: 'cylinderGeometry',
//   torus: 'torusGeometry',
//   circle: 'circleGeometry',
//   plane: 'planeGeometry',
//   box: 'boxGeometry',
// };
//
// const MATERIAL_TAGS = {
//   meshStandard: 'meshStandardMaterial',
//   meshBasic: 'meshBasicMaterial',
// };
//
// export function Scene({ node, refs }) {
//   if (!node) return null;
//   if (node.type === 'group') {
//     return (
//       <group
//         position={node.position}
//         rotation={node.rotation}
//         scale={node.scale}
//         ref={node.name && refs ? (g) => { refs[node.name] = g; } : undefined}
//       >
//         {(node.children || []).map((child, i) => (
//           <Scene key={child.name || i} node={child} refs={refs} />
//         ))}
//       </group>
//     );
//   }
//   if (node.type === 'mesh') {
//     const GTag = GEOMETRY_TAGS[node.geometry.type];
//     const MTag = MATERIAL_TAGS[node.material.type];
//     return (
//       <mesh
//         position={node.position}
//         rotation={node.rotation}
//         scale={node.scale}
//         castShadow={node.castShadow}
//         receiveShadow={node.receiveShadow}
//         renderOrder={node.renderOrder}
//         ref={node.name && refs ? (m) => { refs[node.name] = m; } : undefined}
//       >
//         <GTag args={node.geometry.args} />
//         <MTag {...(node.material.args && node.material.args[0])} />
//       </mesh>
//     );
//   }
//   return null;
// }

// Stub export so the module is importable today and tooling sees a
// stable entry point. Replaced with the JSX implementation above.
export const Scene = null;

export const R3F_READY = false;
