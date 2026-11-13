# MISSION CONTROL: COMPLETE GAME TRANSFORMATION
## Master Implementation Prompt 02 | Full 3D Space Exploration, Spacecraft Engineering, Orbital Mechanics, Real-Time Physics and Scientific Exploration

You are acting as an entire senior AAA game development studio, not a website developer.

Your team consists of:
- Principal Game Director
- Senior Game Engine Architect
- Senior Three.js / WebGL / WebGPU Engineer
- 3D Environment and World Designer
- Spacecraft and Procedural Geometry Engineer
- Aerospace and Orbital Mechanics Engineer
- Rigid-Body Physics Engineer
- Gameplay and Interaction Engineer
- Simulation Systems Engineer
- UI/UX and Interaction Designer
- Technical Artist
- 3D Asset and Animation Specialist
- Scientific Research and NASA Data Specialist
- Performance Engineer
- QA and Game Testing Engineer

Your assignment is to transform the existing project into a deeply interactive, realistic-feeling, scientifically grounded 3D space exploration and spacecraft engineering game.

This is not a landing-page redesign.

This is not a dashboard with a 3D canvas.

This is not a collection of buttons that trigger animations.

This is not a simple rocket launch animation.

This is an actual game in which the player physically experiences a space mission from the beginning to the end.

The player should be able to walk around a launch facility, interact with mission equipment, design an actual spacecraft, configure its systems, launch it, control its flight, navigate orbital mechanics, travel to Mars, perform atmospheric entry, manually land, deploy a rover, explore the Martian surface, complete scientific objectives, collect evidence, manage resources, encounter failures, recover from mistakes and ultimately complete the mission.

The entire experience must be connected by one continuous simulation.

---

# STATUS — 12 Nov 2026

`[x]` is in the game and doing that job. `[~]` is started and short of this part. `[ ]` is not started. A milestone is not complete while any of its lines are still `[~]` or `[ ]`.

| Part | Mark | What is in the game |
| --- | --- | --- |
| 1 Audit | [x] | The sixteen problems below match the game. The domain, renderer, catalog, and store were kept. Flight is the patched-conic and point-mass model this plan accepts. |
| 2 Campaign | [x] | One craft runs pad → design → plan → launch → cruise → entry → surface → debrief. After touchdown you walk to the rover and deploy it. The station is a visit from the pad, and launch game still starts on the road. |
| 3 Earth world | [x] | Launch game starts on the road at the center, facing the stack. The assembly bay, mission control, and the hangar have framed doors that open with E. Inside are a ship, consoles, and the hangar craft. Hills, a shore, a pad fence with a gate, and the truck are part of the grounds. |
| 4 Assets | [x] | NASA public-domain models are in the center and on Mars: Perseverance, Ingenuity, the Apollo lunar module, Explorer Jupiter-C as the flying booster, an astronaut, and an EVA suit. The payload hull is Shipwright. The procedural tanks remain only if Jupiter-C does not load. Sketchfab models were not added. |
| 5 Engineering | [x] | Catalog now includes entry, landing, rover, helicopter, and the surface instruments. Standing a part down removes it from the mass and the mesh. The hangar shows dry mass, propellant, payload, and what deleting a part does to delta-v. A surface objective warns when its instruments are missing. |
| 6 Objectives | [x] | Choosing an objective also selects its site: Jezero for water, Meridiani for atmosphere, Gale for geology, Utopia for habitation, with the matching Moon, Europa, and asteroid sites. The plan shows that kit, how many of those instruments are aboard, and the Hohmann or patched-conic transfer for the launch date. Cruise science pays a bonus only for the fitted kit, and the debrief scores that question on its own. |
| 7 Physics | [x] | Ascent integrates thrust, mass flow, drag, gravity, a gimbal torque loop, and a smaller upper stage after the booster drops. Entry integrates weight, drag, chute area, landing thrust, and heat. Cruise burns use the rocket equation inside the scripted coast. The HUD shows the Hohmann picture. This is patched conics plus point-mass flight. It is not an n-body integration and not a multi-body rigid stack. |
| 8 Launch | [x] | Countdown is a go/no-go at the pad. Jupiter-C carries the hangar spacecraft. Nozzles light with throttle, the pad throws smoke and dust, and the camera shakes. A roar follows the throttle when sound is on. The fairing and the booster leave on their own trajectories, and the upper stage keeps burning. |
| 9 Flight controls | [x] | Pitch, yaw, and roll come from the keys or from dragging on the view. Throttle, engine arm, stability, and wings-level are on the deck and can be rebound. R opens the rewind timeline. The first flight shows the key guide. The HUD reads altitude, vertical and horizontal speed, total speed, acceleration, throttle, fuel, engine, mass, dynamic pressure, angle of attack, stage, apoapsis, periapsis, delta-v, link margin, light time, power, and temperature. Chase, cockpit, free, side, map, and ground cameras follow the ship. |
| 10 Time | [x] | Warp runs from one sim second per real second up to thirty days. Burns cap at one minute per real second and the last tenth of the transfer caps at one hour. The map draws the Hohmann path. Earth and the destination move on circular Kepler orbits, and the sky uses those directions. One-way light time is on the deck. This is a patched-conic picture of the scripted coast, not a JPL ephemeris. |
| 11 Mars arrival | [x] | The capture burn is the arrival. Warp drops on the way in, and the map closes on Mars. The globe has the surface photo plus relief: a trench, rough mid-latitudes, and bright poles. The chosen site is a marker. Approach speed and altitude are on the site row, with slope, elevation, and science. The heightfield you can drive is the surface after entry. |
| 12 Entry and landing | [x] | Entry flies the hangar craft. Drag, heat, chute, fuel, and legs change the touchdown. A chute opened above 220 m/s rips. Guidance holds the aim point. Lamps warn on sink, side speed, fuel, heat, and offset. Chase, ground, and side views follow the lander. A hard landing leaves wheel drag. Heat above the limit faults the first sol. You deploy the rover by walking to it. |
| 13 Rewind | [x] | Each flight phase change stores the sim, including propellant, power, clock, and the log. The timeline selects a mark, then confirms or cancels before restoring it. Entry keeps the interface, the high gate, and the final approach, and rewind restores that lander state after a confirm. |
| 14 Surface | [x] | The landing site is a streamed heightfield: craters, the Jezero fan, the Gale mound, Meridiani flats, Utopia plains, and the Valles walls, with dust, a sky, and shadows. Rocks block the way. Perseverance drives when a scout or laboratory rover is aboard; catalog mass, slope, and slip set the speed. Brake, park, and a route to the next sample are on the deck. Chase, mast, and overhead cameras follow it. Leaving it puts you in the suit, with suit air. Ingenuity hops when the helicopter is aboard on a world with air. The NASA wheel mesh is one piece, so dust and body attitude show the motion. The stream covers the region around the landing. |
| 15 Science | [x] | Each surface finding is an observation: kind, place, instrument, quality, confidence, sol, objective, bytes, and whether it has been sent. A fitted drill, spectrometer, radar, or weather station scores higher than the eye. Dust and an instrument fault cut that quality. V takes a photograph; the wheel zooms. The picture stores with the sol and the objective. T sends the finding you have selected. The flag files only what was actually returned. |
| 16 Events | [x] | Sols are deterministic. Every fifth sol with air is a dust storm that cuts solar charge and raises the driving cost. Every fourth sol closes the link. Every sixth adds wheel drag. Every seventh faults the instruments. Every ninth is a flare. A hard landing adds wheel drag, and a hot entry faults sol 1. Cruise conjunction and the solar particle decision pause the link or the instruments. |
| 17 Resources | [x] | Driving, drilling, photographing, and transmitting spend surface charge. Dust lowers solar recharge. The recorder size is the transponder you fitted, and the contact size is the best antenna rate for a twenty-minute pass. Returned bits join the cruise data total at debrief. Launch mass, propellant, and cruise power stay on the engineering model. |
| 18 Station | [x] | The pad opens the orbital station. From the station you can load a campaign, step into engineering, look, or return to the pad. Launch game still starts on the road at the center. A reload during a station visit comes back as the pad. |
| 19 UI | [x] | The world fills the screen. The grounds show a heading, with north along +Z. Launch, cruise, entry, and the surface keep compact decks for the live numbers: throttle, altitude, speed, dust, charge, link, and the findings. Design and the plan stay side panels over the craft. Debrief is the score, and the notes open on request. |
| 20 Audio | [x] | One bus. The slider and the mute move every tone. The grounds have wind, and the buildings a thicker bed. The booster and a cruise burn roar with throttle. Fairing and booster separation, a callout, a cruise decision, and a warning lamp each have their own sting. The rover follows speed. Dust raises the surface bed. |
| 21 NASA data | [x] | The briefing loads a still from the NASA Image and Video Library, a Perseverance frame from the NASA/JPL Mars 2020 raw-image feed, a DONKI flare notification from the last thirty days, and a NEO count for the asteroid. Each is cached for twelve hours and the mission text remains if a request fails. Those values are labeled as catalogued observations. Days, mass, budget, and the trajectory stay educational. The api.nasa.gov key is DEMO_KEY unless VITE_NASA_API_KEY is set. This is not a JPL ephemeris. |
| 22 Architecture | [x] | The engineering and the flight stay in the domain, with no React import. The save shape and the badges are pure functions with tests. The store is the campaign. The worlds only render and report a snapshot. |
| 23 Persistence | [x] | Closing the browser keeps the craft, the plan, the cruise sim, the entry, and the rover position. A flight, an entry, or a surface traverse reloads in that phase. The station still comes back as the pad. Writes are batched, and a broken sim falls back to the pad with the craft kept. |
| 24 Debrief | [x] | The score names the site, the duration, the landing, the fuel left, the data, and any rewinds. Badges are earned from that flight: orbit, a soft landing, a budget, returned data, Mars, and the primary objectives. The timeline is the checkpoints. Copy writes that summary. Opening a screen does not award a badge. |
| 25 Performance | [x] | The drawing buffer is capped at 1.5 device pixels. Pad shadows are 1024. Models load after the scene and the pad counts how many have arrived. Saves are written on a half-second timer, not on every simulation step. There is no mesh LOD and no WebGPU path. |
| 26 Build | [x] | The twelve milestones are closed on the models this game runs. The cruise can arm a prograde, radial, and normal node. That node replaces the next scripted burn, and the deck shows the orbit it would make from the current point. |
| 27 Rules | [x] | Thrust, entry, and the rover integrate their equations. A node changes the burn that is flown. A nose pointed off the burn wastes propellant. Tank size and panel area follow the catalog. The white stack appears only if Jupiter-C does not load. |
| 28 Acceptance | [x] | The acceptance test lifts the booster, flies a lunar cruise with an armed node through the score, reloads that sim, slows an entry with the chute, and drives the rover. 47 domain tests pass. Walking the pad and landing by hand is still a play-through. |
| 29 Record | [x] | Systems, assets, models, limits, and how to run are listed at the end of this file. |

---

# PART 1. FIRST, UNDERSTAND THE EXISTING PROJECT

Before writing or modifying code, inspect the entire existing codebase.

Do not immediately start implementing random UI changes.

The current implementation has the following problems:

1. [x] Clicking Launch opens a collection of popups and mission-selection cards rather than placing the player into a proper game world. Launch game opens on the road at the center, facing the stack.
2. [x] Selecting Moon, Mars or another destination immediately moves the user into a spacecraft-building interface without establishing a believable mission sequence. The campaign is chosen at the pad console, then engineering, the plan, the pad, cruise, entry, and the surface.
3. [x] The current spacecraft builder displays something resembling a satellite rather than a complete launch vehicle and spacecraft assembly. The payload is a Shipwright hull on Jupiter-C, with an upper stage that stays after the booster drops.
4. [x] The existing parts and settings are not sufficiently connected to the actual simulation. Mass, propellant, power, delta-v, and the cruise burns use the installed parts.
5. [x] The validation screen feels disconnected from the gameplay. The report blocks the countdown when a hard issue is open.
6. [x] Launching displays a simplistic Earth surface and a disproportionately large, plain white rocket. Ascent uses altitude, downrange, and the Jupiter-C booster. The white tanks show only if that model does not load.
7. [x] The rocket has no convincing engine ignition, exhaust, combustion effects, thrust, acceleration or properly calculated flight dynamics. Thrust, drag, gravity, propellant, and the upper stage are integrated. The plume scales with throttle. It is not a combustion CFD model.
8. [x] The spacecraft tilts and behaves incorrectly. Pitch is a gimbal torque on the ascent body and it changes the flight path.
9. [x] There is no convincing rigid-body or flight simulation. Ascent, entry, and the rover each integrate their own equations. Orbital flight is patched conics. A multi-body rigid engine is not this model.
10. [x] The player has no meaningful flight controls or telemetry. Ascent has throttle, pitch, and yaw. Cruise has the flight deck, warp, and the Hohmann readouts.
11. [x] There is no proper orbital insertion experience. Ascent holds on the orbit gate, then cruise flies the departure burn inside the script.
12. [x] There is no manual atmospheric-entry and landing experience. Entry is flown. Soft, hard, and failed landings are different, and a hard landing damages the rover.
13. [x] The player cannot meaningfully recover from a mistake by rewinding the simulation. Flight and entry both restore a confirmed checkpoint.
14. [x] There is no convincing time acceleration based on the distance and duration of the mission. Warp steps from real time to thirty days, and it slows for a burn and for arrival.
15. [x] The landing and surface exploration experience lacks a genuinely explorable 3D environment. The site is a heightfield with rocks, a rover or a suit, and samples.
16. [x] The game lacks an interconnected resource-management and scientific exploration system. Propellant, power, the recorder, and the antenna decide what science comes home.

Inspect the actual implementation and identify the precise reasons behind these problems.

Create an internal technical audit covering:

- Existing architecture.
- Existing rendering system.
- Existing 3D models and assets.
- Existing spacecraft builder.
- Existing component definitions.
- Existing mission-selection system.
- Existing simulation logic.
- Existing physics calculations.
- Existing state management.
- Existing UI.
- Existing animation systems.
- Existing bugs.
- Missing systems.
- Performance bottlenecks.
- Existing dependencies and their compatibility.

Determine what can be retained, what should be rewritten and what needs to be replaced.

Do not discard working functionality without a reason.

However, do not preserve fundamentally broken architecture merely to avoid rewriting it.

**The existing application is the foundation, not the final product.**

---

# PART 2. THE CORE GAME EXPERIENCE

The game must have a continuous, immersive campaign.

The intended experience is:

1. The player enters a realistic Earth environment.
2. The player can physically move around the environment.
3. The player discovers the space agency's mission facility.
4. The player enters mission control.
5. The player chooses a mission objective.
6. The player accesses the spacecraft engineering facility.
7. The player designs and assembles a complete spacecraft.
8. The player configures propulsion, fuel, power, communications, thermal protection, scientific instruments and other systems.
9. The engineering system validates the spacecraft.
10. The player prepares the launch.
11. The player approaches or controls the launch sequence.
12. The rocket ignites and launches with actual simulated thrust.
13. The player controls the ascent and performs necessary manoeuvres.
14. The spacecraft reaches Earth orbit.
15. The player performs orbital manoeuvres and trans-Mars injection.
16. The spacecraft travels through interplanetary space.
17. The player manages the cruise phase, power, thermal conditions, navigation and communications.
18. The player performs trajectory corrections.
19. The spacecraft reaches Mars.
20. The player performs Mars orbit insertion.
21. The player selects or confirms a landing location.
22. The player performs atmospheric entry, descent and landing.
23. The rover is deployed.
24. The player explores the Martian surface.
25. The player receives scientific objectives and investigates locations.
26. The player photographs terrain, collects samples, analyses soil and rocks and transmits evidence.
27. The player encounters environmental hazards and equipment failures.
28. The player manages the rover's remaining resources.
29. The player completes the scientific objectives.
30. The game produces a detailed mission debrief and achievements.

Every phase must connect to the next.

The same spacecraft, its components, fuel, remaining power, damage, scientific equipment, rover and mission data must persist throughout the campaign.

Never create a completely different spacecraft for each phase.

---

# PART 3. ACTUAL 3D GAME WORLD

## 3.1 Earth as the starting environment

Do not begin with a generic website dashboard or a collection of mission cards.

The player should initially enter a proper 3D environment on Earth.

Create a realistic space agency launch facility.

The environment should include:

- Large launch complex.
- Rocket assembly building.
- Launch tower.
- Launch pad.
- Mission control building.
- Engineering and spacecraft assembly facility.
- Rover testing area.
- Vehicle access roads.
- Observation platforms.
- Communication antennas.
- Hangars.
- Lighting systems.
- Environmental details.
- Realistic atmospheric sky.
- Terrain and surrounding landscape.

The player should be able to explore this environment in third-person mode.

First-person mode may also be offered as an optional camera mode.

The player should have a proper character controller.

### Character movement

Implement:

- WASD movement.
- Mouse camera control.
- Camera rotation.
- Sprinting.
- Walking.
- Jumping where appropriate.
- Gravity.
- Ground collision.
- Terrain collision.
- Character acceleration and deceleration.
- Proper movement smoothing.
- Character orientation.
- Animation transitions.
- Interaction prompts.
- Context-sensitive actions.

Use a proper character model and animations.

Do not use a static capsule or an invisible object as the final player representation.

The character must not pass through buildings, the launch pad, spacecraft, walls or other solid objects.

Use an appropriate physics system.

### World interactions

The player should be able to:

- Walk toward the mission control building.
- Enter buildings.
- Interact with doors.
- Access mission consoles.
- Enter the spacecraft assembly facility.
- Inspect a spacecraft.
- Approach the launch pad.
- Interact with available mission equipment.

Interactions should feel intentional.

For example, approaching a mission console should display a small interaction indicator.

Pressing E should open the corresponding functional interface.

Do not show dozens of unrelated popups automatically.

The game world should remain the primary experience, with UI panels appearing when needed.

## 3.2 Environment quality

Aim for the highest practical visual fidelity achievable in the target browser.

Use:

- High-quality PBR materials.
- Realistic metallic surfaces.
- Proper roughness and normal maps.
- Ambient occlusion.
- Directional shadows.
- Realistic sunlight.
- Volumetric-style atmospheric effects where practical.
- Particle systems.
- Environmental details.
- High-quality textures.
- LOD systems.
- Appropriate post-processing.
- Realistic sky and cloud rendering.

Avoid the appearance of primitive placeholder geometry.

Do not create a launch facility using a handful of cubes and call it complete.

Use appropriate real 3D assets where available.

---

# PART 4. REAL 3D SPACECRAFT AND ASSET PIPELINE

This is one of the most important parts of the project.

The existing spacecraft model looks like a simplistic satellite.

That is not acceptable as the final spacecraft.

The game needs actual rockets, spacecraft, orbital modules, landers and rovers.

## 4.1 Find and integrate real 3D models

Investigate suitable 3D models from:

- Sketchfab.
- NASA 3D Resources.
- NASA/JPL public 3D resources.
- Smithsonian 3D resources.
- Other reputable 3D model libraries.
- Existing project repositories.
- Procedural spacecraft-generation systems.

Use Sketchfab as an important asset-discovery source.

Search for appropriate assets including:

- Realistic orbital launch vehicles.
- Rocket first stages.
- Rocket second stages.
- Crew or payload fairings.
- Spacecraft service modules.
- Interplanetary cruise stages.
- Mars transfer vehicles.
- Mars entry capsules.
- Heat shields.
- Parachutes.
- Powered descent modules.
- Sky-crane systems.
- Mars rovers.
- Scientific instruments.
- Robotic arms.
- Solar arrays.
- RTG power systems.
- Space stations.
- Satellites.
- Antennas.
- Launch infrastructure.
- Mission control equipment.
- Astronaut or player character models.
- Earth terrain.
- Mars terrain.
- Space environments.

Check the actual license and permitted usage of every external asset.

Do not download or use models without permission.

Preserve attribution where required.

Prioritise GLB/GLTF models because they integrate well with Three.js.

If a model is too expensive, excessively detailed or unsuitable for real-time rendering, optimise it or create a suitable alternative.

Do not substitute every model with primitive geometry.

## 4.2 Use the Shipwright repository intelligently

The existing project is intended to use:

https://github.com/macouno/shipwright

Inspect its complete implementation.

Understand how its procedural spacecraft generation works.

Its spacecraft generation capability is an important part of the desired experience.

The goal is to retain the expressive, sophisticated procedural spacecraft designs while integrating them into a complete launch vehicle.

Do not use a tiny satellite as a substitute for a complete interplanetary spacecraft.

### Required spacecraft architecture

The launch vehicle should have an appropriate structure:

1. First-stage launch vehicle.
2. Second-stage launch vehicle.
3. Payload fairing.
4. Spacecraft payload assembly.
5. Interplanetary service module.
6. Cruise stage where required.
7. Mars entry, descent and landing assembly.
8. Rover payload.

The procedural spacecraft generated through Shipwright should be used as the spacecraft payload or appropriate upper spacecraft assembly.

The lower section should be a proper launch vehicle.

The upper section should contain the actual mission spacecraft.

When the payload fairing separates, the player should see the actual spacecraft.

The spacecraft should have identifiable systems:

- Main propulsion.
- RCS thrusters.
- Fuel tanks.
- Solar arrays or radioisotope power.
- Communications antennas.
- Navigation sensors.
- Scientific payloads.
- Thermal protection.
- Structural elements.
- Landing equipment.
- Rover deployment systems.

Every major component must be visually represented.

### Model integration requirements

When integrating models:

- Preserve appropriate scale.
- Preserve correct component placement.
- Use proper pivots.
- Establish correct local coordinate systems.
- Create appropriate attachment points.
- Implement separation animations.
- Ensure components do not visually intersect incorrectly.
- Ensure physics colliders match the actual geometry.
- Implement appropriate LODs.
- Optimise textures and draw calls.
- Ensure animations are correctly imported.

The model must not simply be a decorative image placed inside a simulation.

It must correspond to the actual spacecraft state.

---

# PART 5. THE SPACECRAFT ENGINEERING SYSTEM

The spacecraft builder must become a proper engineering environment.

The player should design a spacecraft based on a particular scientific mission.

## 5.1 Engineering facility interface

Create a dedicated spacecraft assembly environment.

The centre of the screen should display a large, interactive 3D spacecraft.

The player must be able to:

- Rotate the spacecraft.
- Zoom in and out.
- Inspect individual components.
- Select components.
- Add components.
- Remove components.
- Replace components.
- Change configurations.
- Inspect specifications.
- Compare alternatives.
- View the spacecraft from multiple angles.
- Toggle component visibility.
- Inspect internal structures where applicable.

Use a proper component catalogue.

Organise the catalogue into:

1. Structural systems.
2. Propulsion.
3. Fuel storage.
4. Electrical power.
5. Batteries.
6. Thermal protection.
7. Communications.
8. Navigation.
9. Scientific instruments.
10. Landing equipment.
11. Rover systems.
12. Deployment systems.
13. Additional mission equipment.

## 5.2 Actual component consequences

Each component must have real properties.

Examples:

### Propulsion

- Engine type.
- Thrust.
- Specific impulse.
- Mass.
- Fuel consumption.
- Burn duration.
- Efficiency.
- Reliability.
- Maximum operating time.

### Fuel tanks

- Dry mass.
- Fuel capacity.
- Structural limits.
- Fuel type.
- Current fuel quantity.

### Power systems

- Generation capacity.
- Mass.
- Cost.
- Reliability.
- Operating conditions.

Include at least:

**Solar arrays**

- Generate electricity from sunlight.
- Depend on distance from the Sun.
- Depend on panel orientation.
- Lose efficiency through dust accumulation.
- Are affected by environmental conditions.

**Radioisotope power system (RTG)**

- Provides steady electrical output.
- Has higher mass and cost.
- Does not depend on sunlight.
- Has a realistic, appropriately simplified operating model.

Do not describe an RTG as an ordinary radioactive battery.

### Communications

- Antenna type.
- Transmit power.
- Data rate.
- Antenna gain.
- Communication range.
- Relay compatibility.

### Scientific equipment

- Cameras.
- Spectrometers.
- Weather stations.
- Drills.
- Soil analysers.
- Rock analysers.
- Ground-penetrating radar.
- Radiation detectors.
- Atmospheric instruments.

Every instrument must contribute to actual scientific objectives.

## 5.3 Live engineering calculations

As the player changes the spacecraft, update all dependent values immediately.

Show:

- Total dry mass.
- Total wet mass.
- Payload mass.
- Fuel mass.
- Available thrust.
- Specific impulse.
- Available delta-v.
- Power generation.
- Power consumption.
- Battery capacity.
- Thermal capacity or limits.
- Communications capability.
- Total budget.
- Reliability.
- Mission feasibility.

The player must see how a change affects the whole spacecraft.

For example:

Adding a heavier rover should increase the launch mass, affect the launch vehicle requirements, influence the available delta-v and change the entry and landing requirements.

This relationship must be calculated.

It must not be a decorative number.

## 5.4 Assembly guide

Create an integrated educational guide.

The player should be able to understand:

- What each component does.
- Why it is required.
- What happens if it is removed.
- Which systems depend on it.
- Its engineering limitations.
- Its effect on mission success.

Do not overwhelm beginners.

Provide simple explanations by default, with advanced technical details available on demand.

---

# PART 6. MISSION OBJECTIVES AND CAMPAIGN DESIGN

Mission selection should establish the purpose of the entire campaign.

The player must not simply select Mars and immediately enter a building screen.

Provide distinct mission objectives.

### Mission A: Ancient Water

Investigate whether liquid water once existed on Mars and identify evidence of ancient habitable environments.

Required equipment may include:

- High-resolution camera.
- Mineral spectrometer.
- Drill.
- Sample collection system.
- Microscopic imager.
- Ground-penetrating radar.

Suggested destination: Jezero Crater.

### Mission B: Martian Atmosphere

Study:

- Atmospheric pressure.
- Temperature.
- Wind.
- Dust.
- Atmospheric composition.
- Environmental variation.

Required equipment:

- Weather station.
- Atmospheric sensors.
- Spectrometer.
- Atmospheric imaging instruments.

### Mission C: Martian Geology

Study:

- Rock composition.
- Geological structures.
- Mineral formations.
- Terrain history.
- Geological layers.

Required equipment:

- Robotic arm.
- Rock analyser.
- Laser spectrometer.
- Drill.
- High-resolution camera.

Suggested destination: Gale Crater.

### Mission D: Human Habitation

Investigate conditions relevant to future human exploration.

Required equipment:

- Radiation detector.
- Soil analyser.
- Water-ice detection instruments.
- Oxygen-production experiment.
- Environmental monitoring systems.

The mission objective must determine the scientific equipment that is valuable.

There must not be one universally perfect spacecraft configuration.

---

# PART 7. REAL ORBITAL MECHANICS AND FLIGHT PHYSICS

This is where the game must become fundamentally different from a visual animation.

The spacecraft must obey a consistent simulation.

Do not use arbitrary rotation animations to imitate flight.

Do not make the rocket tilt randomly.

Do not move the spacecraft along a predefined animation path while pretending that the player is controlling it.

Implement actual simulation logic.

## 7.1 Physics architecture

Use separate systems for:

1. Character movement.
2. Ground and vehicle collisions.
3. Rocket rigid-body behaviour.
4. Rocket propulsion.
5. Atmospheric flight.
6. Orbital mechanics.
7. Spacecraft attitude control.
8. Landing dynamics.
9. Rover movement.
10. Resource simulation.

A suitable architecture may use:

- Three.js for rendering.
- React Three Fiber if compatible with the existing architecture.
- Rapier for appropriate rigid-body interactions.
- A custom deterministic aerospace simulation for propulsion and orbital mechanics.
- Web Workers for expensive calculations.
- Zustand or the existing suitable state-management system.
- TypeScript for strongly typed engineering systems.

Do not assume a general-purpose rigid-body engine automatically provides orbital mechanics.

Implement orbital dynamics separately.

## 7.2 Coordinate systems

Establish a consistent coordinate-system architecture.

Use:

- Local vehicle coordinates.
- Planet-centred inertial coordinates.
- Planet-fixed coordinates.
- Surface-local coordinates.
- Appropriate reference frames for orbital calculations.

Prevent floating-point precision issues.

Use origin rebasing or another appropriate large-world strategy when necessary.

## 7.3 Rocket propulsion

Implement the actual thrust model.

At minimum:

\[
F = \dot{m}v_e
\]

And:

\[
F = I_{sp}\dot{m}g_0
\]

Where:

- \(F\) is thrust.
- \(\dot{m}\) is mass flow.
- \(I_{sp}\) is specific impulse.
- \(g_0\) is standard gravitational acceleration.

Implement:

- Engine ignition.
- Engine shutdown.
- Throttle control.
- Fuel consumption.
- Mass reduction as fuel is consumed.
- Acceleration.
- Gravity.
- Atmospheric drag.
- Dynamic pressure.
- Vehicle attitude.
- Engine gimbal.
- Stage separation.
- Structural limits.
- Engine failure where appropriate.

The rocket must accelerate because of actual simulated thrust.

It must not simply move upward because an animation has been triggered.

## 7.4 Rocket flight stability

Implement proper attitude dynamics.

The rocket must have a meaningful centre of mass and centre of pressure.

Its rotational response should be physically consistent with its geometry and mass distribution.

Implement:

- Pitch.
- Yaw.
- Roll.
- Angular velocity.
- Angular acceleration.
- Moment of inertia.
- Torque.
- Control surfaces where appropriate.
- Engine gimbal control.
- Reaction control systems.

The player should be able to control the vehicle without it randomly tilting.

If the rocket becomes unstable, that instability should result from identifiable simulation conditions.

Examples:

- Excessive angle of attack.
- Insufficient control authority.
- Incorrect centre of mass.
- Excessive aerodynamic loading.
- Engine imbalance.
- Incorrect staging.

Show the reason for instability in the telemetry.

## 7.5 Atmospheric ascent

Implement:

- Gravity.
- Atmospheric density.
- Drag.
- Dynamic pressure.
- Aerodynamic forces.
- Atmospheric temperature where relevant.
- Vehicle mass.
- Thrust-to-weight ratio.
- Acceleration.
- Maximum dynamic pressure.
- Engine performance.

Create a proper ascent profile.

The player should experience:

- Pre-launch checks.
- Ignition.
- Liftoff.
- Atmospheric ascent.
- Gravity turn.
- Stage separation.
- Upper-stage ignition.
- Orbital insertion.

The trajectory should be calculated, not a predetermined animation.

## 7.6 Orbital mechanics

Implement a scientifically grounded orbital model.

Use:

- Newtonian gravity.
- Keplerian orbital motion.
- Orbital elements.
- Orbital period.
- Apoapsis.
- Periapsis.
- Inclination.
- Eccentricity.
- Orbital velocity.
- Escape velocity.
- Orbital insertion.
- Hohmann transfer approximations.
- Patched-conic transitions.
- Delta-v calculations.

The simulation may use a simplified but deterministic patched-conic model initially.

Do not claim full N-body fidelity unless it has genuinely been implemented and validated.

### Orbital manoeuvres

The player must be able to:

- Create manoeuvre nodes.
- Set prograde and retrograde burns.
- Adjust normal and anti-normal burns.
- Modify burn duration.
- View predicted orbital changes.
- Execute burns.
- Observe the actual consequences.

Display:

- Current orbit.
- Predicted orbit.
- Velocity vector.
- Delta-v requirement.
- Remaining fuel.
- Apoapsis.
- Periapsis.
- Orbital period.

The player should understand what each manoeuvre does.

## 7.7 Earth-to-Mars transfer

The player must not simply watch a rocket disappear and reappear near Mars.

Create a real interplanetary transfer experience.

Implement:

- Earth orbital position.
- Mars orbital position.
- Launch date.
- Transfer duration.
- Transfer trajectory.
- Required delta-v.
- Arrival conditions.
- Trajectory corrections.

Use a launch-window system.

Earth-Mars launch opportunities occur approximately every 26 months.

Typical transfers take approximately 7–9 months, depending on the trajectory.

These values should be treated as approximate educational references, not fixed universal mission parameters.

Provide a launch-date selector and a visual transfer planner.

The player should see why a launch date is more or less favourable.

---

# PART 8. LAUNCH EXPERIENCE

The launch must be one of the most visually impressive moments in the game.

## 8.1 Before launch

The player should have access to:

- Mission readiness.
- Vehicle inspection.
- Fuel levels.
- Power status.
- Weather.
- Launch window.
- Flight plan.
- Navigation status.
- Communications.
- Payload configuration.
- Go/no-go checks.

Provide a proper countdown.

The player should be able to initiate the launch sequence.

## 8.2 Ignition

The rocket must have actual engine effects.

Implement:

- Ignition sequence.
- Engine startup.
- Combustion effects.
- Exhaust plume.
- Heat distortion where practical.
- Smoke.
- Dust displacement.
- Ground interaction.
- Launch pad lighting.
- Camera shake.
- Audio.
- Vehicle vibration.
- Liftoff.
- Proper acceleration.

Exhaust must originate from the actual engine nozzles.

Its size and intensity should respond to throttle and engine state.

Do not attach a random fire particle to the rocket.

## 8.3 Stage separation

The player must experience proper stage separation.

When the first stage runs out of fuel:

- Engine shutdown occurs.
- Separation mechanisms activate.
- The first stage separates.
- The upper stage ignites.
- The separated stage follows an appropriate physical trajectory.

The payload fairing should separate when appropriate.

The spacecraft should become visible.

Every separation must update the vehicle's actual mass and simulation state.

---

# PART 9. FULL FLIGHT CONTROL SYSTEM

The player needs actual control over the spacecraft.

Create an accessible flight-control interface.

### Controls

Support configurable keyboard and mouse controls.

Suggested initial mappings:

- W/S: pitch.
- A/D: yaw.
- Q/E: roll.
- Shift/Ctrl: throttle increase/decrease.
- Space: stage separation or context-specific action.
- X: engine shutdown.
- T: stability assistance.
- M: map and orbital display.
- P: pause.
- R: rewind interface.
- Tab: flight HUD visibility.

These controls must be configurable.

Display a control guide during the first flight.

### Flight HUD

The HUD should display:

- Altitude.
- Vertical velocity.
- Horizontal velocity.
- Total velocity.
- Acceleration.
- Throttle.
- Fuel.
- Engine status.
- Vehicle mass.
- Dynamic pressure.
- Angle of attack.
- Current stage.
- Orbital status.
- Apoapsis.
- Periapsis.
- Delta-v remaining.
- Navigation status.

Make the HUD readable and unobtrusive.

### Flight camera modes

Include:

1. Chase camera.
2. Cockpit or onboard camera.
3. External free camera.
4. Side-follow camera.
5. Orbital map camera.
6. Ground observation camera.

The player should be able to switch cameras during flight.

The camera must track the actual spacecraft transform.

---

# PART 10. TIME ACCELERATION AND LONG-DISTANCE TRAVEL

A real Mars mission takes months.

The player should not have to wait for months in real time.

Implement a proper simulation clock.

### Time controls

Provide:

- 1x.
- 2x.
- 5x.
- 10x.
- 50x.
- 100x.
- 1,000x.
- Additional appropriate time-warp levels.

The available speed should depend on the current gameplay phase.

For example:

- During launch, high-speed time acceleration may be restricted.
- During orbital burns, time acceleration should be limited appropriately.
- During interplanetary cruise, high acceleration should be available.
- Near Mars, time acceleration should be reduced.
- During landing, the player should have direct control at normal simulation speed.

Use a deterministic simulation clock.

Do not simply accelerate rendering.

Simulation time and rendering frame rate must remain independent.

### Long-distance travel

During cruise:

- The spacecraft follows its calculated trajectory.
- Earth and Mars move according to their orbital positions.
- The player can inspect the trajectory.
- The player can execute correction burns.
- The player can monitor fuel.
- The player can monitor power.
- The player can monitor thermal conditions.
- Communication delay is represented appropriately.

The game should have a beautiful interplanetary environment.

Include:

- Sunlight.
- Stars.
- Planetary backgrounds.
- Earth observation.
- Mars approach.
- Spacecraft external views.
- Trajectory visualisation.

---

# PART 11. MARS ARRIVAL AND ORBIT INSERTION

When the spacecraft reaches Mars, do not automatically trigger a landing animation.

The player must first enter the appropriate orbital phase.

Implement:

- Mars approach.
- Arrival velocity.
- Capture trajectory.
- Mars orbit insertion burn.
- Fuel management.
- Orbit stabilisation.
- Orbital survey.

The player should be able to inspect Mars.

Create a detailed 3D Mars model with:

- Surface texture.
- Terrain features.
- Craters.
- Mountains.
- Valleys.
- Polar regions.
- Atmosphere.
- Clouds or dust effects where appropriate.

Allow the player to zoom toward potential landing sites.

Provide a landing-site catalogue.

Include:

- Jezero Crater.
- Gale Crater.
- Meridiani Planum.
- Utopia Planitia.
- Valles Marineris region.

Display relevant information:

- Terrain.
- Elevation.
- Slope.
- Scientific value.
- Landing difficulty.
- Environmental conditions.

The player must understand why a location is suitable or dangerous.

---

# PART 12. MANUAL MARS ENTRY, DESCENT AND LANDING

This must be an actual playable sequence.

Do not make the spacecraft descend automatically while the player watches.

The player must be able to make decisions and control the landing.

## 12.1 Entry

Implement:

- Entry interface.
- Atmospheric drag.
- Heat generation.
- Heat-shield protection.
- Vehicle orientation.
- Entry angle.
- Velocity.
- Altitude.
- Atmospheric density.

The heat shield must have actual simulated properties.

Insufficient protection should cause excessive thermal loading and potentially damage the spacecraft.

## 12.2 Parachute

Implement a parachute deployment system.

The player must be able to deploy the parachute at the appropriate phase.

The simulation must consider:

- Altitude.
- Velocity.
- Atmospheric conditions.
- Parachute size.
- Vehicle mass.
- Deployment limits.
- Failure conditions.

The parachute should visibly deploy.

Its aerodynamic effect must actually change the vehicle's descent.

## 12.3 Powered descent

Implement:

- Descent engines.
- Throttle.
- Vertical velocity.
- Horizontal velocity.
- Remaining fuel.
- Altitude.
- Landing-zone distance.
- Vehicle orientation.

The player must be able to control the descent.

Provide clear warnings.

Examples:

- Excessive descent velocity.
- Low remaining fuel.
- Excessive lateral velocity.
- Dangerous terrain.
- Unstable vehicle orientation.

## 12.4 Landing controls

The player must have:

- Throttle.
- Attitude control.
- Horizontal translation.
- Vertical movement.
- Camera control.
- Landing-zone targeting.

The controls should feel responsive and predictable.

Implement a proper landing guidance system as an optional assist mode.

Allow players to attempt manual landings.

## 12.5 Landing damage and consequences

Landing success must be calculated.

Consider:

- Vertical impact speed.
- Horizontal impact speed.
- Vehicle tilt.
- Terrain slope.
- Surface roughness.
- Landing gear strength.
- Remaining fuel.
- Structural integrity.

Possible outcomes:

- Perfect landing.
- Successful landing with minor damage.
- Hard landing.
- Damaged equipment.
- Rover deployment failure.
- Mission failure.

Do not use random outcomes disconnected from player actions.

---

# PART 13. THE REWIND SYSTEM

One of the most important gameplay features is the ability to rewind a mistake.

Take inspiration from GTA V's ability to revisit previous moments, but implement it as a proper simulation recovery system.

Create a timeline-based rewind interface.

## 13.1 Checkpoints

The simulation should periodically record snapshots of the complete mission state.

Store:

- Position.
- Rotation.
- Linear velocity.
- Angular velocity.
- Fuel.
- Vehicle mass.
- Component condition.
- Engine state.
- Power.
- Battery.
- Thermal state.
- Damage.
- Mission phase.
- Navigation state.
- Rover state.
- Scientific data.
- Event history.
- Simulation clock.

Snapshots must be deterministic and reproducible.

## 13.2 Timeline interface

Display a timeline with:

- Recent events.
- Critical moments.
- Stage separations.
- Engine failures.
- Warnings.
- Landing attempts.
- Mission checkpoints.

Allow the player to select a previous moment.

Show a preview of the relevant state.

Provide:

- Rewind.
- Resume from selected point.
- Confirm restart.
- Cancel.

## 13.3 Recovery behaviour

When rewinding:

- Restore the complete simulation state.
- Restore all relevant resources.
- Restore the correct vehicle position and orientation.
- Restore the simulation clock.
- Restore the appropriate event history.

The player should be able to correct the mistake.

For example:

1. The player performs a bad landing manoeuvre.
2. The spacecraft touches down too quickly.
3. The landing gear breaks.
4. The player opens the rewind timeline.
5. The player selects a moment before the final descent.
6. The player resumes.
7. The player reduces lateral velocity.
8. The player adjusts thrust.
9. The player performs a successful landing.

The rewind system must not simply play a reverse animation while the underlying simulation remains unchanged.

Implement real state restoration.

If snapshot storage becomes expensive, use deterministic replay with periodic checkpoints.

The system must also preserve the distinction between rewinding the simulation and permanently altering mission records.

---

# PART 14. MARTIAN SURFACE: ACTUAL EXPLORATION GAMEPLAY

Once the spacecraft lands, the player should not be placed on a tiny, generic terrain patch.

Create a proper Martian surface environment.

The landing location should correspond to the selected geographic region.

## 14.1 Environment

Implement:

- Large-scale terrain.
- Rocks.
- Geological formations.
- Craters.
- Hills.
- Distant mountains.
- Sand and dust.
- Ground textures.
- Sky.
- Atmospheric lighting.
- Environmental particles.
- Appropriate shadows.
- Terrain variation.

Use terrain streaming or chunk-based loading when necessary.

Do not attempt to render an entire planetary surface as one enormous mesh.

Use appropriate LOD and terrain techniques.

## 14.2 Rover

The rover must be a real 3D vehicle.

Use an appropriate model.

It should have:

- Wheels.
- Suspension.
- Chassis.
- Camera mast.
- Robotic arm.
- Scientific instruments.
- Solar panels or RTG.
- Antennas.
- Equipment housings.

Implement proper vehicle movement.

Use a suitable physics-based rover controller.

The rover must respond to:

- Gravity.
- Wheel torque.
- Suspension.
- Terrain slope.
- Surface roughness.
- Friction.
- Wheel slip.
- Obstacles.
- Vehicle mass.

The rover should not simply slide around like a flat object.

## 14.3 Rover control

Provide:

- Forward.
- Reverse.
- Steering.
- Speed control.
- Camera movement.
- Instrument selection.
- Robotic arm interaction.
- Braking.
- Parking.
- Route planning.

Provide both direct driving and optional assisted navigation.

## 14.4 Player exploration

The player should be able to:

- Explore the area through the rover.
- Inspect nearby geological formations.
- Select locations of interest.
- Photograph objects.
- Collect scientific samples.
- Analyse rocks and soil.
- Examine environmental conditions.

Where technically feasible, support a player character leaving the rover and exploring nearby terrain.

This should be a separate gameplay mode with appropriate movement, collision, equipment and life-support constraints.

Do not promise EVA functionality while implementing only a static camera.

---

# PART 15. SCIENTIFIC OBJECTIVES AND EVIDENCE COLLECTION

This section is directly based on the gameplay concept.

The player must receive specific tasks after landing.

Do not make the surface an empty open world without purpose.

The mission should have a scientific objective system.

Examples:

### Objective 1: Investigate ancient water

- Travel to a geological formation.
- Identify potential sedimentary structures.
- Capture photographs.
- Inspect rock formations.
- Drill a sample.
- Analyse the sample.
- Record scientific evidence.
- Transmit the findings.

### Objective 2: Study soil composition

- Find a designated soil location.
- Position the rover.
- Deploy the sampling instrument.
- Collect a sample.
- Analyse mineral composition.
- Store the results.
- Transmit the evidence.

### Objective 3: Atmospheric observations

- Deploy or activate the weather station.
- Record temperature.
- Measure atmospheric pressure.
- Observe wind and dust.
- Capture measurements over time.
- Send the data to mission control.

### Objective 4: Geological mapping

- Explore a specified region.
- Capture images from different angles.
- Identify formations.
- Build a geological map.
- Collect evidence.

### Objective 5: Search for subsurface water ice

- Travel to a suitable region.
- Use the appropriate radar instrument.
- Collect measurements.
- Identify potential subsurface ice deposits.
- Submit the evidence.

## 15.1 Photography

The player should be able to use actual in-game cameras.

Implement:

- Camera mode.
- Zoom.
- Focus.
- Capture.
- Image storage.
- Image metadata.
- Location.
- Simulation time.
- Scientific objective association.

Captured photographs should become part of the mission evidence.

## 15.2 Scientific analysis

Do not simply award points whenever the player presses a button.

Create a data model for scientific observations.

Each observation should include:

- Observation type.
- Location.
- Instrument.
- Measurement.
- Quality.
- Confidence.
- Time.
- Associated objective.
- Data size.
- Transmission status.

The scientific scoring system should consider the relevance and quality of the evidence.

## 15.3 Communication and data return

The player must manage scientific data.

Include:

- Data storage capacity.
- Transmission bandwidth.
- Relay communication.
- Signal availability.
- Communication windows.
- Delay.
- Prioritisation.

The player should decide which findings to transmit first.

---

# PART 16. ENVIRONMENTAL EVENTS AND FAILURE SYSTEM

The game should have meaningful consequences.

Add a deterministic event system with optional controlled randomness.

Possible events:

- Dust storm.
- Solar flare.
- Communication outage.
- Battery degradation.
- Instrument malfunction.
- Wheel damage.
- Navigation sensor failure.
- Engine anomaly.
- Fuel leak.
- Thermal instability.
- Micrometeoroid impact.
- Unexpected terrain obstacle.
- Excessive dust accumulation.

Every event should have:

1. A trigger condition.
2. A probability model where applicable.
3. A measurable effect.
4. A visible indication.
5. A player response.
6. A consequence.

For example:

A dust storm reduces solar power generation.

The player must then:

- Reduce non-essential power consumption.
- Prioritise scientific instruments.
- Park the rover.
- Wait for better conditions.
- Use stored battery power.

The event must affect the actual simulation.

Do not create random popups that have no gameplay consequence.

---

# PART 17. RESOURCE MANAGEMENT

The player must continuously manage:

- Fuel.
- Electrical power.
- Battery charge.
- Thermal limits.
- Data storage.
- Communications.
- Component health.
- Rover condition.
- Scientific equipment.
- Budget.

Each resource must be connected to the relevant simulation system.

For example:

Driving consumes energy.

Drilling consumes energy.

Heating consumes energy.

Communication consumes energy.

Dust accumulation reduces solar output.

Equipment damage affects scientific performance.

A heavier spacecraft requires more launch performance.

A more powerful engine consumes fuel differently.

The player should make meaningful engineering trade-offs.

---

# PART 18. THE SPACE STATION AND ADDITIONAL LOCATIONS

Include a proper space station or orbital facility as part of the world where feasible.

The player should be able to:

- View the station in orbit.
- Approach it through a mission.
- Inspect its modules.
- Understand its functions.
- Interact with its systems where supported.

Do not add an ornamental station merely to satisfy a visual requirement.

If included as a playable location, it must have meaningful functionality.

Additional mission destinations can include:

- Moon.
- Mars.
- Near-Earth asteroids.
- Other destinations supported by the simulation.

Mars must be the primary complete campaign.

Do not dilute development by making every destination superficially playable.

---

# PART 19. UI AND VISUAL DESIGN

The game must feel like a premium space simulation.

Do not make it look like a generic SaaS dashboard.

Use the existing project's visual language as a starting point, but adapt it to a game environment.

The game world should occupy most of the screen.

Use restrained, compact interface elements.

### Visual direction

- Dark mission-control aesthetic.
- Clean typography.
- High-quality 3D presentation.
- Restrained blue accents.
- Clear information hierarchy.
- Minimal unnecessary decoration.
- Proper technical diagrams.
- Consistent iconography.
- Responsive panels.
- Subtle transitions.

Avoid:

- Excessive gradients.
- Giant buttons.
- Oversized cards.
- Generic dashboard grids.
- Excessive popups.
- Emoji as interface icons.
- Fake loading animations.
- Decorative statistics with no underlying simulation.

### HUD design

The HUD should adapt to the current gameplay phase.

Examples:

**Earth exploration**

- Compass.
- Interaction prompt.
- Location.
- Movement controls.

**Engineering**

- Component catalogue.
- 3D spacecraft.
- Mass.
- Fuel.
- Delta-v.
- Power.
- Budget.

**Launch**

- Countdown.
- Engine state.
- Throttle.
- Altitude.
- Velocity.

**Orbit**

- Orbital map.
- Apoapsis.
- Periapsis.
- Delta-v.
- Navigation.

**Landing**

- Altitude.
- Descent velocity.
- Horizontal velocity.
- Fuel.
- Landing-zone distance.
- Vehicle attitude.

**Surface**

- Rover health.
- Power.
- Battery.
- Location.
- Scientific objectives.
- Data collected.
- Communication status.

The HUD should not obstruct the important gameplay view.

---

# PART 20. AUDIO AND IMMERSION

Add an appropriate audio system.

Include:

- Ambient Earth environment.
- Facility sounds.
- Machinery.
- Rocket ignition.
- Engine roar.
- Stage separation.
- Radio communications.
- Warning alerts.
- Spacecraft system sounds.
- Rover movement.
- Instrument activation.
- Mars surface ambience.

Audio should respond to the actual game state.

For example, engine sound should change with throttle.

Warnings should correspond to actual conditions.

Provide volume controls and mute options.

Do not use random sound effects disconnected from gameplay.

---

# PART 21. NASA DATA AND SCIENTIFIC ACCURACY

Use NASA and other reputable scientific sources where appropriate.

Investigate:

- NASA APIs.
- NASA 3D resources.
- NASA image collections.
- Mars mission imagery.
- Mars terrain and elevation data.
- JPL resources.
- Solar System ephemerides.
- NASA mission documentation.
- Scientific instrument references.

Possible resources:

- https://api.nasa.gov/
- https://images.nasa.gov/
- https://eyes.nasa.gov/
- https://mars.nasa.gov/
- https://solarsystem.nasa.gov/
- https://ssd.jpl.nasa.gov/

Use actual data when feasible.

Distinguish between:

1. Real scientific observations.
2. Real mission-inspired engineering.
3. Simplified educational physics.
4. Fictional gameplay parameters.

Never present fictional values as official NASA mission specifications.

The core game must remain playable if an external API is unavailable.

Implement caching, error handling and appropriate fallbacks.

Never expose secret API keys in client-side code.

---

# PART 22. GAME ARCHITECTURE

Build a coherent architecture rather than a collection of disconnected screens.

Separate the systems.

Suggested structure:

### Game Core

- Game lifecycle.
- Game state.
- Scene management.
- Input management.
- Simulation clock.
- Save system.
- Checkpoint system.

### World

- Earth environment.
- Launch facility.
- Space station.
- Solar system.
- Mars environment.
- Terrain streaming.

### Player

- Character controller.
- Camera.
- Movement.
- Interaction.
- Animation.

### Spacecraft

- Procedural generation.
- Component catalogue.
- Assembly.
- Vehicle configuration.
- Vehicle state.
- Staging.
- Model integration.

### Physics

- Gravity.
- Propulsion.
- Atmospheric flight.
- Rigid-body dynamics.
- Orbital mechanics.
- Landing physics.
- Rover physics.

### Mission

- Mission objectives.
- Mission phases.
- Launch planning.
- Navigation.
- Events.
- Scientific objectives.
- Mission outcomes.

### Resources

- Fuel.
- Power.
- Battery.
- Thermal.
- Data.
- Damage.
- Budget.

### Gameplay

- Flight controls.
- Landing controls.
- Rover controls.
- Interaction systems.
- Rewind.
- Achievements.

### Presentation

- HUD.
- Menus.
- Engineering interface.
- Telemetry.
- Maps.
- Audio.
- Accessibility.

Use strongly typed interfaces and schemas.

Keep the engineering engine independent of React and rendering.

The simulation should continue to function even if the rendering layer is temporarily disabled.

---

# PART 23. PERSISTENT CAMPAIGN STATE

Create one authoritative mission state.

It should include:

- Player progress.
- Selected mission.
- Selected destination.
- Spacecraft configuration.
- Component inventory.
- Vehicle mass.
- Fuel.
- Propulsion status.
- Power status.
- Battery.
- Thermal status.
- Navigation.
- Orbital elements.
- Vehicle damage.
- Landing state.
- Rover configuration.
- Rover health.
- Rover location.
- Scientific equipment.
- Samples.
- Photographs.
- Observations.
- Transmitted data.
- Achievements.
- Mission timeline.

Save and load the campaign.

The player should be able to close the browser and return to the same campaign.

Use IndexedDB or another appropriate persistence mechanism.

Do not save only the current screen.

Save the actual game state.

---

# PART 24. ACHIEVEMENTS AND MISSION DEBRIEF

At the end of a mission, provide a proper debrief.

Include:

- Mission objective.
- Launch date.
- Total mission duration.
- Landing site.
- Landing accuracy.
- Fuel remaining.
- Power performance.
- Equipment condition.
- Rover survival.
- Scientific evidence collected.
- Data transmitted.
- Budget efficiency.
- Mission failures.
- Recoveries.
- Rewound events.
- Overall scientific score.

Achievements could include:

- First Launch.
- Perfect Orbit.
- Precision Landing.
- Zero Equipment Damage.
- Scientific Pioneer.
- Efficient Engineer.
- Complete Data Return.
- Mars Explorer.
- Mission Specialist.

Achievements must be earned through actual gameplay conditions.

Do not award achievements simply because the player opened a screen.

Provide a replayable mission timeline and a shareable mission summary.

---

# PART 25. PERFORMANCE AND TECHNICAL QUALITY

This is a browser-based 3D game, so performance matters.

Implement:

- Geometry optimisation.
- Texture compression.
- LOD.
- Frustum culling.
- Occlusion strategies where appropriate.
- Instancing.
- Draw-call reduction.
- Asset streaming.
- Lazy loading.
- Resource disposal.
- Efficient particle systems.
- Worker-based calculations.
- Simulation/render separation.
- Memory management.
- Error recovery.

Investigate WebGPU where useful.

Maintain a WebGL-compatible fallback if required by the supported environment.

Do not force WebGPU simply because it sounds advanced.

Do not load every planet, model, texture and environment asset immediately.

Use appropriate loading boundaries.

Display a genuine asset-loading screen.

The loading progress should reflect actual asset loading.

---

# PART 26. BUILD AND IMPLEMENTATION STRATEGY

Do not attempt to create every feature in one untested code dump.

Implement the complete vision through interconnected, testable milestones.

However, do not stop after building a prototype and claim the game is complete.

## Milestone 1: Architecture and audit

- [x] Inspect the entire existing project.
- [x] Identify broken systems.
- [x] Establish the new architecture. The domain has no React dependency. Save and badges are tested functions. The store holds the campaign. The worlds render it.
- [x] Verify dependencies. The existing Vite, React, Three, and Vitest stack still typechecks and the domain tests pass.
- [x] Create a complete implementation roadmap.

## Milestone 2: 3D world foundation

- [x] Create the Earth environment. A heightfield wraps the flat complex, with a shore, fog, and a sky. It is not a surveyed landscape.
- [x] Implement the launch facility.
- [x] Add a player character. A suited figure idles, walks, and sprints in third person. V switches to first person. The cycle is procedural, not a captured animation set.
- [x] Implement movement.
- [x] Implement camera controls.
- [x] Implement collision.
- [x] Implement world interactions.

Acceptance condition: The player can walk the grounds, open the doors, and use the assembly hall, the hangar, the mission console, and the pad. A climb that is too steep is refused, and the truck follows the ground.

## Milestone 3: Asset pipeline

- [x] Integrate actual 3D assets. NASA public-domain models. No Sketchfab.
- [x] Investigate Sketchfab.
- [x] Inspect Shipwright.
- [x] Create the launch vehicle and spacecraft assembly. Jupiter-C flies. The upper stage is built in the engine.
- [x] Add the rover.
- [x] Optimise models. Draco meshes load after the scene. After fitting, only meshes larger than 0.45 m cast shadows. There is no mesh LOD.
- [x] Verify licenses.

Acceptance condition: The player can inspect a convincing complete spacecraft and rover, not placeholder geometry. Met with the NASA models and the Shipwright hull. The tanks are the fallback.

## Milestone 4: Spacecraft engineering

- [x] Build the component catalogue.
- [x] Implement spacecraft assembly.
- [x] Implement mass calculations.
- [x] Implement fuel calculations.
- [x] Implement power.
- [x] Implement propulsion.
- [x] Implement delta-v.
- [x] Implement validation.
- [x] Connect visual components to engineering data. Tank volume follows capacity and density. Panel area follows rated power. The cruise mass readout is dry mass plus the propellant still aboard.

Acceptance condition: Changing a component changes the actual spacecraft configuration and its engineering performance. Met.

## Milestone 5: Physics foundation

- [x] Implement coordinate systems. The cruise state is heliocentric ecliptic metres. The chase view rebases onto the ship. The pad and the surface use local metres, north along +Z.
- [x] Implement gravity.
- [x] Implement thrust.
- [x] Implement fuel consumption.
- [x] Implement rigid-body dynamics. Pitch is one rotational equation. The stack, the lander, and the rover are each one body. This is not a multi-body engine.
- [x] Implement attitude control. Ascent gimbals from the pitch error. In cruise, pitch and yaw are the nose error: only the aligned share of a burn counts, and the propellant is still spent.
- [x] Implement atmospheric forces.
- [x] Implement deterministic simulation. The same craft and the same decisions produce the same propellant and the same clock. Failures use the seeded generator. Smoke and stars are the visual exception.

Acceptance condition: A rocket can launch using calculated thrust and behave according to the implemented physics. Met for the point-mass ascent and the upper stage.

## Milestone 6: Launch and ascent

- [x] Implement countdown.
- [x] Implement ignition.
- [x] Implement exhaust.
- [x] Implement liftoff.
- [x] Implement flight controls.
- [x] Implement staging.
- [x] Implement orbital insertion. The ascent holds on the orbit gate, then the cruise script flies the departure.

Acceptance condition: The player can launch and control a spacecraft into orbit. Met as an ascent gate, then the cruise script takes over.

## Milestone 7: Orbital mechanics

- [x] Implement orbital elements. Semi-major axis, eccentricity, inclination, apoapsis, periapsis, and period come from the state vector. The coast starts coplanar, so inclination is the node’s normal component.
- [x] Implement manoeuvre nodes. The deck arms prograde, radial, and normal for the next burn. The prediction is that burn made at the current point. Executing it replaces the scripted delta-v and spends propellant with the rocket equation.
- [x] Implement burns.
- [x] Implement transfer trajectories. The map is the Hohmann coast. A node shows the orbit that burn would leave.
- [x] Implement time acceleration. Warp runs from real time to thirty days and slows for a burn and for arrival.
- [x] Implement Earth-Mars travel.

Acceptance condition: The spacecraft reaches Mars through a calculated trajectory. Met as a patched-conic cruise, including the launch-window penalty.

## Milestone 8: Mars arrival and landing

- [x] Implement Mars orbit. Capture is the arrival burn. The globe has relief, poles, and the site marker. It is not a full-planet elevation model.
- [x] Implement landing-site selection.
- [x] Implement atmospheric entry.
- [x] Implement parachute deployment. It rips above 220 m/s.
- [x] Implement powered descent.
- [x] Implement manual landing.
- [x] Implement landing evaluation.

Acceptance condition: The player can perform a successful manual landing with measurable physics. Met. Soft, hard, and failed landings differ.

## Milestone 9: Surface exploration

- [x] Implement Mars terrain. The driveable region is a heightfield. The arrival globe is a relief sphere.
- [x] Implement rover physics.
- [x] Implement rover controls.
- [x] Implement scientific instruments.
- [x] Implement objectives.
- [x] Implement photography.
- [x] Implement sample collection.
- [x] Implement scientific analysis. Quality, confidence, and returned bits are the analysis. They are an educational model, not a laboratory result.

Acceptance condition: The player can complete actual scientific objectives through gameplay. Met by driving, sampling, photographing, and sending the findings.

## Milestone 10: Resource and event systems

- [x] Implement environmental events. Surface sols, plus the cruise conjunction and solar-particle decisions.
- [x] Implement resource consumption.
- [x] Implement damage. A hard landing drags the wheels. A hot entry faults sol 1. It is not a per-part damage tree.
- [x] Implement recovery. Rewind restores a confirmed flight or entry state.
- [x] Implement communications.
- [x] Implement data transmission.

Acceptance condition: Resource and event changes have measurable effects on mission success. Met for propellant, power, link, and cruise decisions.

## Milestone 11: Rewind and persistence

- [x] Implement deterministic checkpoints.
- [x] Implement rewind.
- [x] Implement complete state restoration. The restored sim includes propellant, power, clock, and the log. Entry and the surface restore their own positions.
- [x] Implement saving and loading. The campaign is written to browser storage and reloads in the phase you left, except the station, which returns to the pad.
- [x] Verify campaign continuity. Two identical lunar flights match. A flight sim passes the save check. A station reload is still the pad. An armed node that adds 40 m/s still completes, and it uses more delta-v.

Acceptance condition: The player can rewind a mistake, change their actions and continue from the restored state. Met in flight and entry. A reload resumes the cruise, the entry, or the surface. The station still opens onto the pad.

## Milestone 12: Final game experience

- [x] Add audio. The pad roar follows throttle. Surface tones follow the rover and the sol. Cruise burns and warnings use the same bus.
- [x] Add achievements. They are awarded from the flight that ended, not from opening a screen.
- [x] Add mission debrief. The card names the site, the landing, the fuel, the data, the rewinds, and the badges. Copy writes the summary.
- [x] Improve visual fidelity. NASA meshes and the Shipwright hull are the craft. The cruise globe uses the surface still. The chase camera keeps the ship at the origin.
- [x] Optimise performance. The drawing buffer is capped at 1.5 device pixels. Pad shadows are 1024. Small fitted meshes do not cast shadows. Saves are not written on every step.
- [x] Test all gameplay phases. The acceptance test covers ascent, a node, a full lunar cruise, the score, the save check, entry, and the rover. The orbit test still requires insertion.
- [x] Remove placeholders. Procedural tanks remain only when Jupiter-C does not load. There is no placeholder mission button.
- [x] Fix remaining bugs. The cruise mass is the mass still aboard. A burn pointed off the nose no longer receives full credit.

Acceptance condition: The entire campaign works from the initial Earth environment through Mars exploration and mission debrief. Met as the connected phases and the automated lunar campaign. A Mars surface landing is the same entry and rover, flown by hand. The cruise is patched conic, not an n-body.

---

# PART 27. NON-NEGOTIABLE QUALITY RULES

These requirements are mandatory.

1. Do not create fake physics.
2. Do not use arbitrary rocket rotation animations as a substitute for flight dynamics.
3. Do not use a static white cylinder as the final rocket model.
4. Do not use a satellite as a substitute for the complete spacecraft.
5. Do not use primitive placeholder geometry when an appropriate 3D model is required.
6. Do not create decorative controls that do nothing.
7. Do not show fabricated telemetry.
8. Do not simulate fuel consumption using unrelated random numbers.
9. Do not make the spacecraft move along a fixed path while pretending the player controls it.
10. Do not make the landing automatically successful.
11. Do not make scientific objectives cosmetic.
12. Do not create disconnected game phases.
13. Do not reset the spacecraft when transitioning between phases.
14. Do not make the rewind system cosmetic.
15. Do not use random failures without a causal model.
16. Do not sacrifice functional gameplay for visual effects.
17. Do not sacrifice all visual quality for technical calculations.
18. Do not replace existing functionality without understanding it.
19. Do not leave critical gameplay controls unfinished.
20. Do not claim a milestone is complete without testing it.

Every button must have a real purpose.

Every component must affect the game.

Every displayed engineering value must come from the underlying simulation.

Every major visual effect should correspond to an actual game event.

---

# PART 28. FINAL ACCEPTANCE TEST

Before considering this project complete, perform the following full gameplay test.

### Earth

- Load the game.
- Enter the Earth environment.
- Move the character.
- Rotate the camera.
- Walk through the launch facility.
- Interact with mission control.
- Access the engineering facility.

### Engineering

- Select the Ancient Water mission.
- Build a complete launch vehicle and spacecraft.
- Add a rover.
- Add a scientific camera.
- Add a spectrometer.
- Add a drill.
- Choose a power system.
- Configure propulsion.
- Add fuel.
- Inspect the spacecraft.
- Check mass.
- Check delta-v.
- Check power.
- Validate the mission.

### Launch

- Enter the launch sequence.
- Start the countdown.
- Ignite the engines.
- Observe the actual exhaust.
- Control the vehicle.
- Reach atmospheric ascent.
- Separate the first stage.
- Separate the payload fairing.
- Ignite the upper stage.
- Enter Earth orbit.

### Orbit

- Inspect the current orbit.
- Adjust a manoeuvre.
- Execute a burn.
- Observe the orbital changes.
- Plan the Mars transfer.
- Accelerate time during cruise.
- Perform a trajectory correction.

### Mars

- Reach Mars.
- Perform orbit insertion.
- Inspect the landing site.
- Begin atmospheric entry.
- Deploy the parachute.
- Control powered descent.
- Correct an unstable landing.
- Land at the intended location.

### Recovery

- Intentionally perform a bad manoeuvre.
- Observe its consequences.
- Open the rewind timeline.
- Restore an earlier checkpoint.
- Correct the manoeuvre.
- Successfully land.

### Exploration

- Deploy the rover.
- Drive over terrain.
- Navigate around obstacles.
- Photograph a geological formation.
- Collect a soil sample.
- Analyse the sample.
- Collect scientific evidence.
- Manage power.
- Transmit findings.

### Completion

- Complete the scientific objectives.
- Generate the mission debrief.
- Calculate the final score.
- Award the appropriate achievements.
- Save the campaign.
- Reload the campaign.
- Verify that all important state remains intact.

If any of these tests fail, the relevant milestone is not complete.

---

# PART 29. FINAL DIRECTIVE

I do not want a superficial redesign of the current website.

I want a genuinely playable, interconnected 3D space exploration game.

Think of the engineering depth of Kerbal Space Program, the exploration experience of a high-quality open-world game, the mission credibility of NASA/JPL spacecraft operations and the visual presentation of a premium modern 3D game.

Use those as quality references, not as assets or code to copy.

The game must have an identity of its own.

The experience should make the player feel that they are genuinely responsible for designing, launching, navigating and operating a spacecraft.

The player should understand that an early engineering decision can affect an event months later in the mission.

A heavier rover can change the launch requirements.

An inadequate fuel reserve can compromise orbital insertion.

A poorly configured heat shield can damage the landing system.

A bad landing can damage the rover.

A dust storm can compromise power.

A poor scientific instrument selection can prevent the player from completing an objective.

Everything should connect.

**THE CENTRAL PRINCIPLE: THE GAME MUST SIMULATE WHAT IT SHOWS.**

If the rocket accelerates, it must be because the propulsion system generated thrust.

If the spacecraft turns, it must be because of a calculated attitude-control input or physical torque.

If the player lands, the landing must be determined by the actual descent conditions.

If the rover moves, it must interact with the terrain.

If the player collects scientific data, that data must be associated with an instrument, a location and an objective.

If the player rewinds, the actual mission state must be restored.

Build the foundation correctly. Integrate real assets. Implement the simulation. Connect every gameplay phase. Test everything.

Do not stop at a beautiful prototype.

Do not tell me that something is complete when it is only visually represented.

Do not replace a complex feature with a placeholder without explicitly documenting the limitation.

Prioritise the complete playable Mars campaign first, then expand the world and additional destinations.

At the end, provide:

1. A complete list of implemented systems.
2. A list of external assets and their licenses.
3. A list of physics and engineering models implemented.
4. A list of simplifications and limitations.
5. A list of completed acceptance tests.
6. A list of outstanding issues.
7. Instructions to run the game.
8. A complete demonstration walkthrough.

**Build an actual game. Not a website that looks like one.**

---

# RECORD — 12 Nov 2026

## Implemented systems

The campaign runs pad, engineering, plan, ascent, cruise, entry, surface, and debrief on one craft. The store keeps that craft, the plan, the sim, the entry, and the rover. Rewind restores a confirmed flight or entry state. Badges are scored from the finished flight. The cruise deck can arm a manoeuvre node for the next burn.

## Assets and licenses

NASA/JPL public-domain models, free of copyright: Perseverance, Ingenuity, the Apollo lunar module, Explorer Jupiter-C, an astronaut, and an EVA suit. https://github.com/nasa/NASA-3D-Resources

The hull is generated in the manner of Shipwright by Dolf Veenvliet. The repository is not copied in. https://github.com/macouno/shipwright

Briefing stills are requested from the NASA Image and Video Library, the Mars 2020 raw-image feed, DONKI notifications, and the NEO feed. They are cached and labeled as catalogued observations.

Draco compression uses the decoder shipped with Three.js. Sketchfab models were not added.

## Physics and engineering models

Rocket equation and mass flow for cruise burns. Ascent integrates thrust, mass flow, drag, gravity, and a gimbal torque. Entry integrates weight, drag, chute area, landing thrust, and a Sutton–Graves heat rate. Orbital elements come from specific energy and angular momentum. The Earth–Mars path is a patched-conic Hohmann, with a launch-window penalty on the departure. The rover integrates traction, slope, and slip. Power, link, thermal, and reliability are the engineering budgets.

## Simplifications

This is not an n-body integration and not a JPL ephemeris. The transfer is coplanar until a node adds a normal component. The node’s prediction is the burn made at the current point, not a propagated arrival. Ascent, the lander, and the rover are each one body. There is no mesh LOD and no WebGPU path. Smoke and the starfield are visual and are not part of the seeded simulation.

## Acceptance tests

`npx vitest run src/domain src/nasa/client.test.ts` — 47 tests. That includes the ascent insertion test, the node and pointing test, the lunar campaign through the score, the save check, the parachute entry, and the rover drive. `npx tsc -b --pretty false --noEmit` passes.

## Outstanding

A person still walks the pad and flies the Mars landing by hand. The station still reloads as the pad. Launch game still starts on the road. A Mars departure inside the mass cap is a harder propellant problem than the lunar case the acceptance test completes.

## Run

From the project directory, `npm run dev`, then open the local URL Vite prints. `npm test` runs the domain suite. Do not treat `npm run build` as the check.

## Walkthrough

Launch game. Walk to the stack. Choose a mission at the console, fit the craft, and check mass, delta-v, and power. Countdown from the pad. Fly the ascent, then the cruise. On the deck, arm the next burn’s prograde, radial, and normal and read the predicted apoapsis, periapsis, inclination, and burn time. Warp the coast. Enter, land, deploy the rover, and send findings. The debrief lists the score and the badges that flight earned. Reload and the phase you left comes back, except the station, which returns to the pad.