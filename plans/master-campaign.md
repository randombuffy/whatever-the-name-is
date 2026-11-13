# Master campaign plan

The running game is the base. Design, budget, mass, power, link, thermal, reliability, the shared booster, the cruise script, and the debrief stay. This note maps the Mars Mission Planner specification onto that base, including the destinations that are already in the game (Moon, Mars, Europa, asteroid). Mars is the richest surface. It is not the only campaign.

Physics stays patched conics plus finite burns, which is the level the specification recommends. A full n-body integrator and a city-scale character game are later layers. This pass adds the decisions the spec says are missing, and a surface you can walk.

## What the base already covers

- One craft object from design through flight. Parts, fill, and call sign persist.
- Budget, mass limit, delta-v, power, link, and hard failures that stop a flight.
- Cruise corrections as decisions. Ignoring one spends extra arrival delta-v or cuts science.
- Score, lessons, and a short history in browser storage.
- A 3D system you can orbit, and a named hard-edge ship on a shared booster.

## What this pass adds

1. **Launch date.** A day offset from the best window. Departure delta-v rises with the square of that offset. Mars peaks near an extra 1.6 km/s. The Moon’s penalty is small. The cruise burn uses the same number, so a bad date is propellant you do not get back.
2. **Objective.** Water, atmosphere, geology, or habitation. The question is shown on the plan screen. The matching landing site pays more science on the surface.
3. **Landing sites.** Each destination has a catalogue with difficulty and a real-world note (Jezero, Gale, Meridiani, Utopia, Valles Marineris, and analogues for the Moon, Europa, and the asteroid).
4. **Entry.** After a completed cruise, the player times the corridor. Chance falls with site difficulty, a heavy stack, and a mistimed commit. A miss ends the campaign in the debrief. A success opens the surface with the same craft.
5. **Surface.** First person, mouse look, WASD, a crosshair, rocks that stop you, and sample markers. Energy drains as you drive and sample. Ending a sol restores energy: a steady generator restores more than solar, which is the dust-storm trade in miniature. Samples add science, then the existing debrief runs.
6. **Rover mesh.** `public/models/perseverance.glb` is the NASA/JPL public-domain Perseverance model (https://science.nasa.gov/3d-resources/mars-2020-perseverance-rover/). It is used on the surface. Sketchfab downloads were not used: most of those files are not licensed for redistribution. Further public-domain meshes can drop into `public/models/` the same way.

## Specification map

| Spec section | In this game |
| --- | --- |
| Choice has a cost | Mass, cost, propellant, window, site difficulty, surface energy |
| Continuous campaign | Same craft; surface science is added to the cruise score |
| Failure | Cruise failures remain; landing can fail; empty energy stops driving |
| Budget and score | Unchanged economy; surface points join the score |
| Physics level | Patched conics, finite burns, illustrative entry odds |
| Onboarding | Plan screen states the objective in one sentence; lunar mission is the short path |
| Launch window | Day slider, porkchop-shaped penalty, not a JPL ephemeris |
| EDL | Timing corridor plus mass and site, not a 6-DoF entry sim |
| Rover power | Sol restore depends on constant generation versus solar |
| Sites A–D | Four objectives, five Mars sites, other destinations keep the same verbs |
| Events | Cruise decisions already in the missions; dust is the sol restore |
| Save | Zustand persist already keeps the campaign; surface is one session |
| 3D map | Existing solar system; surface is its own view after landing |

## Still ahead

- A precomputed launch-date grid colored by delta-v, drawn on the 3D map.
- Heat shield and parachute as their own catalog parts, so entry mass is a part choice rather than a fraction of the mass limit.
- Wheel wear, a relay-bandwidth queue, and solar conjunction as cruise events.
- More public-domain meshes (lander, helicopter, astronaut) beside the rover.
- A guided first-mission overlay that only appears on the lunar flight.
- Difficulty flags: tutorial, standard, realistic faults.

## Files

- `src/domain/campaign.ts` — window, sites, objectives, landing chance, sample field
- `src/domain/validate.ts` and `src/domain/simulate.ts` — departure burn includes the window
- `src/ui/field.tsx` — entry corridor and first-person surface
- `src/ui/screens.tsx` — plan controls and the handoff from cruise
- `public/models/perseverance.glb` — NASA/JPL
