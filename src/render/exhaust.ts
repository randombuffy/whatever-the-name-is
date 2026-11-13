import * as THREE from 'three'

/**
 * Exhaust shader from simply-nu-zu-a's Space Exploration ascent scene.
 * White throat, shock diamonds, and a fading column. Power is throttle.
 * https://github.com/simply-nu-zu-a/Space-Exploration
 */

const FIRE_VERT = `
  varying vec2 vUv;
  uniform float uTime;
  void main() {
    vUv = uv;
    vec3 pos = position;
    float flutter = sin(pos.x * 4.5 - uTime * 28.0) * (pos.x / -10.481) * 0.06;
    pos.y += flutter;
    pos.z += flutter * 0.75;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

const FIRE_FRAG = `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uFlamePower;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  void main() {
    if (uFlamePower <= 0.01) discard;
    float u = clamp(vUv.x, 0.0, 1.0);
    float v = clamp(vUv.y, 0.0, 1.0);
    float radial = pow(clamp(1.0 - abs(v - 0.5) * 2.0, 0.0, 1.0), 1.35);
    vec2 flowUv = vec2(u * 14.0 - uTime * 24.0, v * 6.0);
    float n1 = noise(flowUv);
    float n2 = noise(flowUv * 2.1 + vec2(-uTime * 9.0, uTime * 5.0));
    float turbulence = (n1 * 0.65 + n2 * 0.35) - 0.5;
    float shock = clamp(sin(u * 26.0 - uTime * 4.0), 0.0, 1.0) * smoothstep(0.75, 0.08, u);
    float flicker = 0.92 + 0.08 * sin(uTime * 50.0 + u * 12.0);
    float uDistorted = clamp(u + turbulence * 0.14 * (0.25 + 0.75 * u), 0.0, 1.0);
    vec3 cCore = vec3(1.0, 1.0, 1.0);
    vec3 cYellow = vec3(1.0, 0.92, 0.38);
    vec3 cOrange = vec3(1.0, 0.44, 0.03);
    vec3 cRed = vec3(0.88, 0.14, 0.01);
    vec3 cDark = vec3(0.32, 0.04, 0.01);
    vec3 flameColor;
    if (uDistorted < 0.12) flameColor = mix(cCore, cYellow, uDistorted / 0.12);
    else if (uDistorted < 0.38) flameColor = mix(cYellow, cOrange, (uDistorted - 0.12) / 0.26);
    else if (uDistorted < 0.72) flameColor = mix(cOrange, cRed, (uDistorted - 0.38) / 0.34);
    else flameColor = mix(cRed, cDark, (uDistorted - 0.72) / 0.28);
    flameColor += shock * vec3(0.45, 0.38, 0.20) * (1.0 - abs(v - 0.5) * 2.0);
    float alpha = radial * (1.0 - smoothstep(0.60, 1.0, uDistorted)) * flicker * uFlamePower;
    float coreGlow = 1.0 + (1.0 - smoothstep(0.0, 0.35, u)) * 2.2 * radial;
    gl_FragColor = vec4(flameColor * coreGlow * 1.6, clamp(alpha, 0.0, 1.0));
  }
`

export function makeFlame(length = 9.4, width = 1.35): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFlamePower: { value: 0 } },
    vertexShader: FIRE_VERT,
    fragmentShader: FIRE_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(length, width), material)
  mesh.rotation.z = -Math.PI / 2
  mesh.visible = false
  mesh.name = 'plume'
  return mesh
}

export function setFlame(mesh: THREE.Mesh, power: number, time: number): void {
  const material = mesh.material
  if (!(material instanceof THREE.ShaderMaterial)) return
  material.uniforms.uTime.value = time
  material.uniforms.uFlamePower.value = power
  mesh.visible = power > 0.04
}
