# Judge demonstration

Use the running app. Nothing below is a recorded stand-in. Start from a fresh browser profile if you want the starter spacecraft. Otherwise open Missions and pick Lunar Reconnaissance again. The starter is intentionally not flyable.

1. **Select a mission.** Missions lists four scenarios with duration, launch mass and budget. Open Lunar Reconnaissance. The briefing states the science goal, the patched-conic time of flight, and the assumptions. If the NASA Image Library answers, the panel shows a titled image, the source and a retrieval time. If it does not, the bundled scenario text remains and the flight is unaffected.

2. **Design.** Design the spacecraft. The starter is a smallsat bus, a 450 N bipropellant engine, a 40 kg chemical tank, attitude thrusters, a 150 W array, a 200 Wh battery, a transponder, a low-gain antenna, a camera, insulation and a small radiator. Drag the viewport to rotate. Scroll to zoom. The mesh is built from the fitted parts.

3. **Find the holds.** The ledger reports launch mass near 157 kg of 850 kg, delta-v near 994 m/s against about 3.97 km/s required, and a negative link margin. Constraints name the subsystem and the change that clears each hold. Trans-lunar injection cannot be flown on 40 kg of propellant. The low-gain antenna does not close the lunar link.

4. **Trade.** Remove the 40 kg tank and add the 500 kg chemical tank. Remove the low-gain antenna and add the 0.8 m high-gain antenna. Add the 600 W array so generation covers the load at the Moon. Mass rises by hundreds of kilograms, cost rises, and delta-v and link margin cross the requirement. The line under Constraints reads "No open constraints."

5. **Plan.** Review the plan. Nominal mapping orbit is the default arrival. Required delta-v stays under the rocket-equation delta-v of this spacecraft. Continue to launch.

6. **Commit.** Step through the checks. Commit launch stays disabled while a hard hold is open. With a clear ledger it starts the flight. The launcher's job ends at the parking orbit. Spacecraft delta-v starts at trans-lunar injection.

7. **Operate.** The clock runs in sim-seconds, independent of frame rate. Speed buttons set 1 hour, 1 day, 7 days or 30 days of mission time per real second. Pause freezes it. Chase, aft, wide and orbit move the camera. The path on screen is a schematic ellipse, which the panel says.

8. **Respond.** On day 2 a navigation residual stops the clock. Burn the correction. That spends 25 m/s and propellant. Leaving the error would add 40 m/s to insertion and cut the science multiplier. After lunar orbit insertion, antenna pointing drift offers a repoint or a degraded return. Repoint.

9. **Debrief.** When the science window closes, open the debrief. Objectives, propellant, delta-v, mass, cost and data are taken from that flight, not from a scripted success. A recorded lunar pass with the trades above finished complete, used about 3.95 km/s, returned on the order of 97 Gbit, and met the primary objectives. Revise the design to change the spacecraft and fly again. Another mission loads a new starter.

Mars, Europa and the asteroid use the same ledger and the same flight loop. Europa is the power puzzle: solar output at Jupiter is a small fraction of the 1 AU rating, and the constant-power modules are labelled as educational stand-ins.
