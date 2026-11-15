import { driver, type Config } from 'driver.js'
import 'driver.js/dist/driver.css'
import '../styles/tutorial.css'

const baseConfig: Config = {
  showProgress: true,
  animate: true,
  allowClose: true,
  popoverClass: 'nasa-tour-popover',
  nextBtnText: 'Next →',
  prevBtnText: '← Back',
  doneBtnText: 'Understood',
}

/** Step-by-step tutorial for the Pad / Launch Complex ground walkthrough */
export function startPadTutorial(): void {
  const d = driver({
    ...baseConfig,
    steps: [
      {
        element: '.field-stage',
        popover: {
          title: 'Launch Complex 39A',
          description: 'Welcome Commander! You are standing on the launch grounds. Walk with WASD or arrows, hold Shift to sprint, Space to jump, and drag or move mouse to look around.',
          side: 'bottom',
          align: 'center',
        },
      },
      {
        element: '.field-hud',
        popover: {
          title: 'Guidance & Beacon',
          description: 'Follow the yellow guidance arrows towards Martian Cats to accept campaigns, or approach the launch pad tower to board your flight stack.',
          side: 'top',
          align: 'start',
        },
      },
      {
        element: '.field-keys',
        popover: {
          title: 'Facility Controls',
          description: 'Press [E] to interact with consoles, open doors, or board vehicles. Press [V] to toggle camera views (first-person, chase, aerial).',
          side: 'top',
          align: 'center',
        },
      },
    ],
  })
  d.drive()
}

/** Step-by-step tutorial for Spacecraft Hangar Design */
export function startDesignTutorial(): void {
  const d = driver({
    ...baseConfig,
    steps: [
      {
        element: '.catalog',
        popover: {
          title: 'Component Catalog',
          description: 'Filter flight-certified subsystems: avionics buses, bipropellant tanks, rocket engines, solar arrays, high-gain antennas, and landing gear.',
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '.assembly',
        popover: {
          title: 'Vehicle Manifest',
          description: 'Review installed hardware, dry mass, propellant loads, power budgets, and delta-V capabilities in real time.',
          side: 'left',
          align: 'start',
        },
      },
      {
        element: '.stack-view',
        popover: {
          title: '3D Spacecraft Canvas',
          description: 'Inspect your extruded airframe, thermal tiles, and mounted instruments. Orbit, pan, and zoom to examine structural integrity.',
          side: 'bottom',
          align: 'center',
        },
      },
      {
        element: '.hangar-actions',
        popover: {
          title: 'Plan the flight',
          description: 'When the stack checks out, use Plan the flight to set the window and burns.',
          side: 'top',
          align: 'center',
        },
      },
    ],
  })
  d.drive()
}

/** Step-by-step tutorial for Mission Flight Planning */
export function startPlanTutorial(): void {
  const d = driver({
    ...baseConfig,
    steps: [
      {
        element: '.choice-row',
        popover: {
          title: 'Orbital Capture Strategy',
          description: 'Choose your destination capture mode: Aerocapture uses atmospheric drag to slow down without propellant, while Propulsive Capture requires dedicated burn delta-V.',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '.side.right',
        popover: {
          title: 'Trajectory & Science Margins',
          description: 'Tune launch departure windows, reserve propellant margins, scientific instrument duty cycle, and targeted landing sites.',
          side: 'left',
          align: 'start',
        },
      },
      {
        element: '.burns',
        popover: {
          title: 'Manoeuvre Burn Sequence',
          description: 'Review each scheduled burn in your trajectory sequence from Earth departure through target capture and descent.',
          side: 'top',
          align: 'start',
        },
      },
      {
        element: '.plan-launch',
        popover: {
          title: 'Commit to Flight',
          description: 'Check cost against total mission budget and press Launch to enter the countdown and blast off!',
          side: 'top',
          align: 'end',
        },
      },
    ],
  })
  d.drive()
}

/** Step-by-step tutorial for Flight Deck / Interplanetary Cruise */
export function startCruiseTutorial(): void {
  const d = driver({
    ...baseConfig,
    steps: [
      {
        element: '.deck-top',
        popover: {
          title: 'Time Warp & Flight Rate',
          description: 'Accelerate the simulation rate across the interplanetary coast (up to 10,000x) or pause to evaluate trajectory corrections.',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '.journey',
        popover: {
          title: 'Trajectory & Orbit Intercept',
          description: 'Monitor relative arrival velocity, Sphere of Influence ingress, One-Way Light Time comms delay, and encounter countdown.',
          side: 'left',
          align: 'start',
        },
      },
      {
        element: '.deck-bottom',
        popover: {
          title: 'Flight Telemetry',
          description: 'Track heliocentric velocity, apoapsis/periapsis altitudes, propellant reserves, power margins, and communication link gain.',
          side: 'top',
          align: 'center',
        },
      },
      {
        element: '.deck-side',
        popover: {
          title: 'Engine Throttle & SAS',
          description: 'Adjust throttle for orbital insertion and trajectory burns. Enable attitude lock SAS for guidance stability.',
          side: 'right',
          align: 'end',
        },
      },
    ],
  })
  d.drive()
}

/** Step-by-step tutorial for Atmospheric Entry, Descent & Landing (EDL) */
export function startLandingTutorial(): void {
  const d = driver({
    ...baseConfig,
    steps: [
      {
        element: '.field-stage',
        popover: {
          title: 'Planetary EDL Interface',
          description: 'Control hypersonic entry attitude into the Martian atmosphere. Use aerodynamic drag and thermal heat shields to bleed orbital kinetic energy.',
          side: 'bottom',
          align: 'center',
        },
      },
      {
        element: '.cluster',
        popover: {
          title: 'Descent Telemetry',
          description: 'Monitor vertical descent velocity, radar altitude, heat shield plasma temperatures, and dynamic pressure (Max-Q).',
          side: 'top',
          align: 'start',
        },
      },
      {
        element: '.group',
        popover: {
          title: 'Terminal Descent & Retro-propulsion',
          description: 'Throttle terminal landing thrusters to achieve a soft touchdown (< 3 m/s) at your designated coordinates.',
          side: 'top',
          align: 'end',
        },
      },
    ],
  })
  d.drive()
}

/** Step-by-step tutorial for Surface Exploration & Outpost Civilization */
export function startSurfaceTutorial(): void {
  const d = driver({
    ...baseConfig,
    steps: [
      {
        element: '.field-stage',
        popover: {
          title: 'Planetary Surface Operations',
          description: 'Touchdown confirmed! Explore the Martian landscape in the NASA Perseverance rover or disembark on EVA in your astronaut spacesuit.',
          side: 'bottom',
          align: 'center',
        },
      },
      {
        element: '.surface-top',
        popover: {
          title: 'Rover / EVA Mode',
          description: 'Press [F] to mount or dismount the rover. Use [E] to drill and collect rock samples. Deploy the Ingenuity helicopter for aerial scouting.',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '.camp-bar, .outpost-btn',
        popover: {
          title: 'Civilization & Outpost Building',
          description: 'Expand your landed base into a permanent civilization colony! Construct crew habitats, MOXIE life support, solar/nuclear power arrays, and greenhouses.',
          side: 'top',
          align: 'center',
        },
      },
    ],
  })
  d.drive()
}
