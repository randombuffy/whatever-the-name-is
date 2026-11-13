# Mission Control

An educational spacecraft engineering game. You accept a mission, fit a spacecraft against mass, delta-v, power, link, thermal and budget limits, then fly that same configuration. The numbers in the ledger are the numbers the simulation uses.

The trajectories are patched-conic illustrations. They are not NASA ephemerides, and the component catalog is not flight hardware.

## Install

Node.js 22 or newer.

```bash
npm install
npm run dev
```

The dev server is Vite on http://localhost:5173/.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Local development |
| `npm test` | Engineering tests (Vitest, Node, no browser) |
| `npm run typecheck` | `tsc -b` |
| `npm run build` | Typecheck and production bundle in `dist/` |
| `npm run preview` | Serve the production build |

## NASA API

The game runs with no key. The briefing asks the [NASA Image and Video Library](https://images.nasa.gov/) (`images-api.nasa.gov`), which does not require a key. If `VITE_NASA_API_KEY` is set, the briefing also requests a near-Earth object count from `api.nasa.gov`, a DONKI flare note, and one Perseverance frame from the Mars 2020 raw-image feed. Those stills are captions. They are not the trajectory.

```bash
cp .env.example .env.local
```

Put a key from https://api.nasa.gov/ in `.env.local`. `DEMO_KEY` works and is rate limited. Responses are checked with Zod, cached in `localStorage` for 12 hours, and labelled with source and retrieval time. A failed request falls back to the scenario text bundled with the mission. The flight never waits on the network.

## Architecture

One Vite + React + TypeScript application. Three.js draws the scene. Zustand holds the mission and persists it in `localStorage` under `mission-control-v1`. An in-progress flight is not restored. Reloading during a flight returns you to launch commit with the same spacecraft.

The engineering engine lives in `src/domain` and does not import React or Three.js. Simulation time advances in fixed steps inside `stepSim`. The render loop only spends accumulated sim-seconds. A slow frame does not change the result.

| Area | Path | Owns |
| --- | --- | --- |
| Application | `src/App.tsx`, `src/store` | Phase flow and persistence |
| Interface | `src/ui`, `src/styles` | Screens, ledger, mission control |
| Rendering | `src/render` | Viewport, spacecraft mesh, schematic transfer |
| Spacecraft | `src/domain/catalog.ts`, `assemble.ts`, `src/render/procShip.ts` | Specs and the extruded hull. Catalog parts sit on that hull. |
| Engineering | `src/domain/*.ts` except missions and simulate | Mass, propulsion, power, cost, link, thermal, reliability, validation |
| Mission | `src/domain/missions.ts`, `orbit.ts`, `simulate.ts`, `score.ts` | Scenarios, burns, events, debrief |
| External data | `src/nasa` | Image library, optional NEO count, cache, fallback |

## Repository integrations

Both reference repositories were cloned under `reference/` (gitignored) and read. Their applications were not merged.

**ProceduralMeshGeneration** (Alexander Sanfilippo) is the hull: a polygon extruded, scaled, and stitched, with greebles grown from the faces. Catalog parts (tanks, engines, arrays, legs, shield, chute) sit on that hull. Watts, thrust and cost stay on the spec. https://github.com/AlexSanfilippo/ProceduralMeshGeneration

**Shipwright** (Dolf Veenvliet / macouno) is the hangar name and the idea of named mounts. Its vertex tables are not in this tree. Informal permission is in that repository's README. Credit is on the Credits screen and in `THIRD_PARTY.md`.

**VOIDTYPE** (Itz-Murali and Itz-Anya) is a Nuxt typing game. Mission Control does not use its combat, typing, or neon fighter. The renderer fallback chain, the star field, and the shape of the engine flame shader follow that project's Three.js approach and were rewritten here. The attribution license is reproduced in `THIRD_PARTY.md`. Credit is in this file and on the Credits screen: https://github.com/Itz-Murali/Void-Type

## Engineering assumptions

Internal units are SI. The interface shows kilograms, metres per second, watts, watt-hours, kelvin and decibels.

- Mass is dry mass plus propellant plus the science subset called out as payload. Exceeding the launcher limit is a hard hold.
- Delta-v is the Tsiolkovsky equation, `Isp * g0 * ln(m0 / mf)`, with `g0 = 9.80665`. Chemical propellant, then electric, then cold gas, are spent in that order. Attitude thrusters add their onboard propellant to the chemical pool. Electric thrust is scaled by spare electrical power. Below 5 percent of rated thrust the burn fails.
- Solar power is the 1 AU rating times the inverse square of heliocentric distance, floored at 0.2 AU. Constant sources in the catalog do not fall with distance. They are labelled illustrative. Eclipse is a validation check of battery energy against the eclipse load. The flight itself uses average generation.
- Cost is components plus launch plus operations plus a contingency fraction.
- The link uses free-space path loss and an achievable rate from transmitter power, gains, distance, noise temperature and a required Eb/N0. Distance is the mission's `linkDistanceM`, not "destination AU times an astronomical unit". The Moon is 384,400 km from the ground station.
- Temperature is a single-node balance of electrical waste heat, absorbed sunlight and radiation from the spacecraft plus its radiators. It is an illustration, not a thermal-desktop model.
- Reliability is a series exponential of component failure rates over the mission length. Scripted anomalies always occur. Additional part failures use a seeded mulberry32 stream, so the same design and the same choices repeat.

## Simulation limits

- Orbits are patched conics: a lunar Hohmann from a 300 km Earth orbit, a heliocentric Hohmann for Mars, an illustrative solar-system departure for Europa, and an illustrative 2.4 km/s excess for the asteroid. Jupiter arrival burns are round numbers, not a tour design.
- The 3D path is a schematic ellipse. The HUD says so. It is not a Horizons trajectory.
- Propellant used on a burn step is capped by the rocket equation for the delta-v still required. Coast steps are up to 3600 seconds. Burn steps are 600 seconds.
- A decision freezes the clock until you choose. Safe mode sheds science. An empty recorder discards new bits. An empty tank cannot finish a burn.

## Missions

Lunar Reconnaissance, Mars Pathfinder, Europa Explorer and Asteroid Survey. Parameters are game values. The starter spacecraft is supposed to fail validation. A flyable lunar example is a smallsat bus, the 450 N bipropellant engine, a 500 kg chemical tank, attitude thrusters, a 600 W array, the transponder, a 0.8 m high-gain antenna, a camera, insulation and a small radiator.

## Persistence

Spacecraft, plan, mission, debrief and a short history of outcomes stay in this browser. There is no account.

## Tests

`npm test` covers the rocket equation against an independent evaluation, invalid logarithm domains, mass split, solar inverse-square, battery clamp, cost contingency, the thermal closed form, free-space path loss at lunar distance, series reliability, circular and escape speeds, the lunar injection band, an unflyable starter, a resized lunar craft, a frozen clock while a decision is open, a full lunar flight, and the random stream.

## License of this project

The game code in this repository is the hackathon submission. Third-party terms are in `THIRD_PARTY.md`. NASA imagery remains NASA's. Do not present a played trajectory as an official product.
