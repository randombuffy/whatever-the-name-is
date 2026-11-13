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

This is a hackathon submission. Third-party terms are in `THIRD_PARTY.md`. NASA imagery remains NASA's. A played trajectory is not an official product.
