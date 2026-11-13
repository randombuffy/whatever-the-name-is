# Info

Mission Control is the NASA Space Apps piece in this repository. The job it took is a simple one and a hard one: a mission is a set of limits, and the spacecraft you accept those limits with is the spacecraft you have to fly.

You do not pick a destination and watch a film of it. You close mass, propellant, power, the radio link, heat, and the budget. Then that same craft leaves the pad, coasts, enters, and has to live on the ground. The ledger in the hangar is the ledger in the flight. If the tank is short, the burn stops. If the antenna is small, the bits do not come home.

The four scenarios are Lunar reconnaissance, Mars pathfinder, Europa explorer, and Asteroid survey. The Moon is the short lesson, where a low-gain antenna fails the link before anything else does. Mars is the long one: a patched-conic transfer, a real entry, and a surface you walk. Europa is the power lesson, because sunlight at Jupiter is a thin fraction of the rating at Earth. The asteroid is the link and the debris lesson. None of these is a JPL ephemeris, and the screen does not pretend otherwise. Days, mass, and money are educational limits. NASA's catalogs are shown as catalogs.

## What was checked

On 13 November 2026 the key in `.env` (`VITE_NASA_API_KEY`) was sent to the feeds this game uses. The value stays in that file. `.env` is gitignored. Do not paste the key into a commit, a doc, or a screenshot of a JSON link. NASA echoes it back inside pagination URLs.

| Feed | What the game uses it for | Result |
| --- | --- | --- |
| `api.nasa.gov` NEO feed, called the way the briefing calls it | Asteroid count on the asteroid scenario | HTTP 200. The window returned 42 objects. Hourly ceiling on this key: 2000. |
| `api.nasa.gov` DONKI flare notifications, last 30 days | A solar note on the briefing | HTTP 200. The list was empty. The key was accepted. There is nothing to print until a flare notice exists. |
| `images-api.nasa.gov` | A titled still for the briefing | HTTP 200. This feed does not take the key. |
| Mars 2020 raw-image feed | One Perseverance frame | HTTP 200. This feed does not take the key. |
| APOD | Not used | HTTP 500 from NASA. Ignored. |

A 30-day NEO query is a different request from the game's, and NASA rejects it. The feed allows about a week. The client does not send that range. It asks for the default window, and that call succeeded.

`DEMO_KEY` still works as the fallback, and it is rate limited hard. A failed request does not stop the flight. The briefing keeps the text bundled with the mission. Answers are checked, cached in the browser for twelve hours, and labelled with where they came from.

## What the data is allowed to do

The image, the rover frame, the flare note, and the object count are captions. They are not the trajectory, the weather of this flight, or the landing site. DONKI does not dim the arrays. The NEO count does not move the asteroid. A Perseverance frame is labelled as a NASA/JPL raw image, not as the picture this crew just took.

The numbers that do move the craft are local. Delta-v is the rocket equation. Ascent integrates thrust, mass flow, drag, and gravity. Entry integrates drag, lift, the chute, and landing thrust against an exponential atmosphere. Cruise burns spend propellant inside a patched-conic script: a Hohmann from a 300 km parking orbit, not a Horizons file. The path on the map is a schematic, and the panel says so.

## The Mars surface

The ground you walk after a Mars landing is the settlement terrain: Jezero by default, with Utopia and Elysium when the site calls for them. Colour, grain, rocks, and the peach sky follow that heightfield. The photographed square that used to stand in for it is not the ground anymore.

The camp is not there when the gear touches. The bar across the top is the sequence: landing, habitat, life support, power, food, survival, report. Each module appears when you place it, and the ones with a body stop you. The rover parks beside the ship. Landing confirmed stays up for five seconds.

The Moon's landing scan was removed. It was three copies of one heavy mesh, and the flight does not need it. A lunar surface, if you fly that scenario, uses the generated ground. The Moon as a planet on the cruise is a separate model and it is still aboard.

## Run

Node 22 or newer.

```bash
npm install
npm run dev
```

Vite serves http://localhost:5173/. `npm test` runs the engineering checks. `npm run build` typechecks and writes `dist/`.

Copy `.env.example` to `.env` if you want your own key from https://api.nasa.gov/. Without one, the game still runs.

## The challenge, as this game runs it

The Space Apps brief for this submission is a mission you design and then survive. The Mars notes in that brief are in the flight, not as a second simulator beside it.

Entry speaks the Mars 2020 order from the altitude the ship is actually at: cruise stage off, de-spin, balance masses, entry interface, guidance, heading alignment, straighten up and fly right, parachute, heat shield, terrain match, backshell, throttle down, wheels, touchdown and flyaway. The forces under that are drag, lift, gravity, the chute, and thrust. The words are the callouts. They are not a second animation.

On the surface the deck shows battery, wheel condition, whether the link is open, and the sol. Dust cuts the charge. Night heaters draw power when the rover is not on a constant source. A sharp hit tears the wheels down and the rover slows. Under 15% the rover stops and asks: keep exploring, and it freezes for a −50, or sleep and keep the battery. On a blackout sol it asks: blast the signal through the hill and spend a fifth of the battery for nothing, or wait for the orbiter and take +30 when the pass arrives. Light time is why those are choices at all. You do not drive the rover from Earth in real time.

Correct the path spends 30 m/s of propellant on a Mars cruise. Accept the drift leaves the error in, cuts the science, and adds 70 m/s to capture. The coast shows that debt until arrival starts. Auto-fix sits on the top bar of design and plan whenever a hard hold is open, because a button buried in a side sheet is how a ship gets launched broken.

This is a hackathon submission. Third-party terms are in `THIRD_PARTY.md`. NASA imagery remains NASA's. A played trajectory is not an official product.
