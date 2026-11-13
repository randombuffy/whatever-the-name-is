# Third-party attribution

Mission Control does not vendor the source trees of the two reference repositories. They were cloned into `reference/` for study and left out of the application bundle. What follows is the credit those studies require, plus the license text for VOIDTYPE so the notice travels with this project.

## Shipwright

- Project: shipwright
- Author: Dolf Veenvliet (macouno)
- Repository: https://github.com/macouno/shipwright
- What was used: the idea of composing a spacecraft from named attachment mounts. The r49 vertex tables were not copied. The mesh in `src/render/craft.ts` is original, and its dimensions are driven by the component specs.
- Terms: the upstream README says the code may be used and asks for credit if it is used, especially if it earns money. There is no SPDX license file in that repository. This project does not redistribute that code.

## VOIDTYPE

- Project: VOIDTYPE
- Authors: Itz-Murali and Itz-Anya
- Repository: https://github.com/Itz-Murali/Void-Type
- What was used: the renderer fallback pattern, a point-based star field, and the structure of a short engine-flame shader. Combat, typing, projectiles and the fighter model were not used. The implementations in `src/render/world.ts` were written for this game.
- Credit line: Informed by VOIDTYPE by Itz-Murali and Itz-Anya. https://github.com/Itz-Murali/Void-Type
- This project does not claim authorship of VOIDTYPE and does not imply endorsement.

The VOIDTYPE attribution license, copied from `reference/void-type/LICENSE`:

```
VOIDTYPE ATTRIBUTION LICENSE

Copyright (c) 2026 Itz-Murali and Itz-Anya
Project: VOIDTYPE (https://github.com/Itz-Murali/Void-Type)

VOIDTYPE was created by Itz-Murali (https://github.com/Itz-Murali) and
Itz-Anya (https://github.com/itz-Anya).

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated files (the "Software"), to use, copy, modify,
merge, publish, distribute, sublicense, and/or sell copies of the Software,
and to permit persons to whom the Software is furnished to do so, subject to
the following conditions:

1. CREDIT IS REQUIRED. Anyone who forks, copies, modifies, redistributes, or
   uses the Software or any substantial part of it, in source or compiled
   form, for any purpose, must give clear and visible credit to BOTH
   Itz-Murali and Itz-Anya as the original creators.

2. HOW TO CREDIT. At minimum, the credit must:
   a. appear in the README (or equivalent main documentation) of the
      derived project or product, and
   b. appear in the public-facing page, About screen, or credits section if
      the derived project or product has one, and
   c. include the names "Itz-Murali" and "Itz-Anya" and a link to the
      original repository: https://github.com/Itz-Murali/Void-Type

   A suitable credit line is:
   "Based on VOIDTYPE by Itz-Murali and Itz-Anya —
   https://github.com/Itz-Murali/Void-Type"

3. NOTICES MUST BE KEPT. This copyright notice and this license text must be
   included in all copies and substantial portions of the Software. Credits
   and author names already present in the Software must not be removed,
   hidden, or replaced.

4. NO FALSE CLAIMS. You may not claim that you are the original author of the
   Software, and you may not imply that Itz-Murali or Itz-Anya endorse your
   derived project or product without their written permission.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## ProceduralMeshGeneration

- Project: ProceduralMeshGeneration
- Author: Alexander Sanfilippo
- Repository: https://github.com/AlexSanfilippo/ProceduralMeshGeneration
- What was used: the extrusion method (a polygon scaled along its normal and stitched into a hull, with face greebles, wings and a bell). The Unity project is not vendored. The port lives in `src/render/procShip.ts`. Catalog mass, thrust and cost are not read off the mesh.
- Credit is on the Credits screen and in the README.

## Other dependencies

- React, Three.js, Zustand, Zod, Lucide, Vite, TypeScript and Vitest, under their own package licenses in `node_modules`.
- Icons: Lucide, chosen as one family from https://icones.js.org/.
- Typefaces: Inter and IBM Plex Mono, loaded from the page for the interface. Technical values use tabular figures.
- NASA Image and Video Library and, when a key is configured, the NASA Near Earth Object feed. Imagery stays labelled with its source and retrieval time. NASA retains rights in that media.

## Graphics note

The development machine reported an NVIDIA GeForce RTX 2070 SUPER. No virtual-GPU API was available. The scene uses WebGL through Three.js. Engineering calculations stay on the CPU.
