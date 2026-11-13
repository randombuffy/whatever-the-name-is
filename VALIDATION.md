# Validation

Checked on 11 November 2026 on this machine. The engineering model is an educational approximation. Nothing here is a flight-dynamics certification.

## Automated

- `npm test`: 18 tests passed (Vitest 4.1.12). Covers the rocket equation against an independent evaluation (321 s, 1000 kg to 700 kg, 1122.79 m/s), invalid log domain, mass flow, the propellant inverse, mass split, solar inverse-square, battery clamp, cost contingency, the thermal closed form, free-space path loss at 384,400 km and 2200 MHz, series reliability, circular and escape speeds, the lunar injection band, an unflyable starter, a resized lunar craft with no hard holds, a deterministic correction burn, a frozen clock while a decision is open, a full lunar flight to completion, and the mulberry32 stream.
- `npm run typecheck`: `tsc -b` completed with no errors after the flight-camera and initial-power changes.
- `npm run build`: production bundle written to `dist/`. `dist/assets/index-uml0rS0h.js` is 910.15 kB (257.30 kB gzip) and `dist/assets/index-iXam6cMY.css` is 7.67 kB. The JavaScript chunk is large because Three.js is in the main file. That is a size warning, not a failed build.
- Hallmark `sloplint --scope app` on `src`: 0 FAIL, 0 WARN, 5 REFLEX. All five are gate 7b, pure black via `--bg: #000000`. That value is the required page color for this product, so it stays.

## Runtime path

Dev server: http://localhost:5173/. The browser session walked this sequence on Lunar Reconnaissance, call sign Surveyor.

1. Mission select showed four missions with their limits. Lunar briefing loaded. The NASA Image and Video Library returned an LRO image, labelled with source and retrieval time. The game did not wait on that request.
2. The starter spacecraft showed hard holds: delta-v near 994 m/s against about 3.97 km/s required, and a negative link margin. The constraint text named the tank and the antenna.
3. Removing the 40 kg tank, adding the 500 kg tank, replacing the low-gain antenna with the 0.8 m high-gain antenna, and adding the 600 W array cleared the holds. The ledger then read 666 kg of 850 kg, 4.43 km/s available against 3.97 km/s required, link margin 17.0 dB, 750 W, 269 K, $36.1 million, reliability 99%.
4. Setting the tank fill to 0.5 dropped available delta-v to 2.94 km/s, under the requirement. Restoring fill to 1 cleared the hold again. The range input is writable. The accessibility tree had marked it readonly, which was a tool reading, not the control.
5. The plan kept the nominal mapping orbit. Launch commit stayed disabled until the checks were stepped through, then started the flight.
6. Trans-lunar injection planned 3108 m/s and completed. At day 2, 4 h the navigation residual stopped the clock. Burning the correction spent 25 m/s. Propellant after that burn was 85.9 kg. Antenna pointing drift was the second decision. Repointing was taken.
7. The science window closed on day 15. Debrief: primary objectives met, score 100 of 100, 181 science points against 30 required, 97.20 Gbit returned against 1.50 Gbit required, 476.1 kg of propellant used with 27.4 kg left, 3.95 km/s used, mass 666 kg, cost $36.1 million of $42.0 million. The recorder did fill during the pass and later bits were discarded. The returned total still met the objective.
8. Reloading the page restored that debrief from `localStorage`. A later launch clears the stored outcome until the new flight finishes, and an in-progress flight is not restored. Reload during a flight returns to launch commit with the same spacecraft. That was confirmed.
9. The chase camera frames the spacecraft on the schematic arc. The wide camera shows both bodies and the transfer curve, with the spacecraft outside the departure planet. The corner control reads Pause or Resume, and Holding while a decision is open. Power at the first frame is 750 W / 154 W, not a zero placeholder.
10. At an 820 px width the mission list, phase navigation and Open actions remained usable. The header stacks.
11. Credits names Shipwright (Dolf Veenvliet / macouno) and VOIDTYPE (Itz-Murali and Itz-Anya), and reports the live WebGL renderer. This machine reported an NVIDIA GeForce RTX 2070 SUPER and that WebGPU is present. No virtual-GPU API was used. No page `error` events were recorded during the checked launches.

## Left as limits

- The 3D path is a schematic ellipse. The flight panel says it is not an ephemeris.
- A clean lunar flight with surplus science can score 100. The formula is in `src/domain/score.ts` and is capped there. It is not a professional mission score.
- Europa and the asteroid were not flown in the browser in this pass. They use the same planner, validator and flight loop. Their capture and departure figures are labelled illustrative in the mission text.
- The main bundle is not code-split. Engineering still runs on the CPU.
