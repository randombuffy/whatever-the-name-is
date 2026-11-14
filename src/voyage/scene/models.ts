// Registry of external 3D models (Sketchfab, NASA 3D Resources, etc.).
//
// Leave an entry out and the game keeps using the procedural vehicle from Vehicles.tsx,
// so the site never breaks if a file is missing or fails to load.
//
// How to add one:
//   1. Download the model (Sketchfab: "Download 3D Model" -> glTF / GLB, needs a free login).
//   2. Put the .glb in  public/models/  (so it is served at /models/<name>.glb).
//   3. Add an entry below. `size` is the longest side in scene units (the procedural
//      lander is about 8 units wide/tall). `rotation` fixes models that arrive lying down
//      or facing the wrong way. The model is auto-centred and its base is set to y = 0.
//   4. Fill in `credit` exactly as the model page states. CC-BY needs visible attribution;
//      CC-BY-NC is not allowed for commercial use; check "AI/ML" and "editorial" notes.

export type ModelKey = 'lander' | 'aeroshell' | 'rover';

export interface ModelCredit {
  title: string;
  author: string;
  license: string; // e.g. "CC-BY-4.0", "CC0", "NASA media usage guidelines"
  sourceUrl: string;
}

export interface ModelSpec {
  url: string;
  size: number;
  rotation?: [number, number, number]; // radians, applied before centring
  offset?: [number, number, number]; // scene units, applied after centring
  // Where the descent engines sit on a lander model, so the exhaust plumes line up.
  engines?: { y: number; radius: number };
  credit: ModelCredit;
}

export const MODELS: Partial<Record<ModelKey, ModelSpec>> = {
  // lander: {
  //   url: '/models/lander.glb',
  //   size: 8,
  //   rotation: [0, 0, 0],
  //   engines: { y: 1.55, radius: 1.05 },
  //   credit: { title: '<model title>', author: '<author>', license: 'CC-BY-4.0', sourceUrl: 'https://sketchfab.com/3d-models/<slug>' },
  // },
  // aeroshell: { url: '/models/aeroshell.glb', size: 7, rotation: [Math.PI / 2, 0, 0], credit: { ... } },
  // rover: { url: '/models/rover.glb', size: 3, credit: { ... } },
};

// Feed this to a "Credits" panel or footer.
export const modelCredits = (): ModelCredit[] =>
  (Object.values(MODELS) as (ModelSpec | undefined)[]).flatMap((spec) => (spec ? [spec.credit] : []));
