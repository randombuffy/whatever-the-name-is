import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { NOISE_GLSL } from './glsl';
import { EARTH_RADIUS, LAUNCH_LAT, LAUNCH_LON, SUN_DIRECTION } from './approachLive';

// Same mapping as SpaceScene.latLonToVector. Duplicated so this file does not
// import the scene that imports it.
function latLonToVector(lat: number, lon: number, radius: number) {
  const u = (lon + 180) / 360;
  const v = (90 - lat) / 180;
  const phi = u * Math.PI * 2;
  const theta = v * Math.PI;
  return new THREE.Vector3(-radius * Math.cos(phi) * Math.sin(theta), radius * Math.cos(theta), radius * Math.sin(phi) * Math.sin(theta));
}

// Earth colour is NASA's public-domain Blue Marble (land, ocean, ice), with the
// same equirectangular layout as the Mars globe: 180°W at the left edge.
// A painted stand-in shows until that image loads, or if it cannot.
// Lighting, ocean glint, haze and clouds are drawn in shaders: a visual model, not measured data.
// This globe is the Earth seen from space during the transit. The launch itself is in LaunchSite.

const EARTH_BASE = `${import.meta.env?.BASE_URL ?? '/'}textures/earth/`;

const SITE = latLonToVector(LAUNCH_LAT, LAUNCH_LON, 1).normalize();
const ALIGN_Q = new THREE.Quaternion().setFromUnitVectors(SITE, new THREE.Vector3(0, 1, 0.08).normalize());

export function alignEarth(group: THREE.Object3D) {
  // Turn the launch coast toward the camera as the transit begins.
  group.quaternion.copy(ALIGN_Q);
}

// ---------- Earth surface ----------

const earthVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vPosO;
  void main() {
    vUv = uv;
    vPosO = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const earthFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uSun;
  uniform float uRadius;
  uniform float uScale;
  uniform int uOctaves;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vPosO;
  ${NOISE_GLSL}
  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vPosW);
    vec3 L = normalize(uSun);
    vec3 albedo = texture2D(uMap, vUv).rgb;

    // Water is darker and bluer than land or ice in Blue Marble.
    float blueness = albedo.b - max(albedo.r, albedo.g);
    float ocean = smoothstep(0.008, 0.05, blueness) * (1.0 - smoothstep(0.18, 0.34, albedo.g));

    // Fine detail that only shows close up, so the map does not look soft at launch height.
    vec3 p = vPosO / uRadius;
    float dist = length(cameraPosition - vPosW) / max(uScale, 0.0001);
    float near = 1.0 - smoothstep(uRadius * 0.25, uRadius * 1.1, dist);
    if (near > 0.001) {
      float d = fbm(p * 260.0, uOctaves);
      float d2 = vnoise(p * 1400.0);
      float landDetail = 0.8 + 0.42 * (d * 0.75 + d2 * 0.25);
      float waterDetail = 0.94 + 0.12 * vnoise(p * 700.0);
      albedo *= mix(1.0, mix(landDetail, waterDetail, ocean), near);
    }

    float ndl = dot(N, L);
    float day = smoothstep(-0.08, 0.25, ndl);
    float diffuse = clamp(ndl * 0.92 + 0.08, 0.0, 1.0) * day;
    vec3 sunColour = vec3(1.0, 0.95, 0.88) * 2.4;
    // A warm band where the sun is low.
    vec3 lowSun = mix(vec3(1.0, 0.72, 0.55), vec3(1.0), smoothstep(0.0, 0.25, ndl));
    vec3 colour = albedo * diffuse * sunColour * lowSun;

    // Sun glint on water.
    vec3 H = normalize(L + V);
    float nh = max(dot(N, H), 0.0);
    float glint = (pow(nh, 90.0) * 1.6 + pow(nh, 14.0) * 0.08) * ocean * day;
    colour += vec3(1.0, 0.93, 0.8) * glint * 2.0;

    // Air: blue haze toward the limb, lit only on the day side.
    float nv = max(dot(N, V), 0.0);
    float limb = pow(1.0 - nv, 2.6);
    vec3 sky = vec3(0.28, 0.52, 1.0);
    float skyLit = smoothstep(-0.2, 0.45, ndl);
    colour = mix(colour, sky * skyLit * 1.25 * lowSun, clamp(limb * 0.75 + 0.06 * skyLit, 0.0, 0.85));

    // Faint night side so the dark hemisphere is not pure black.
    colour += albedo * 0.012;

    gl_FragColor = vec4(colour, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// ---------- clouds ----------

const cloudFragment = /* glsl */ `
  uniform vec3 uSun;
  uniform vec3 uSite;
  uniform float uTime;
  uniform float uRadius;
  uniform float uScale;
  uniform int uOctaves;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec3 vPosO;
  ${NOISE_GLSL}
  void main() {
    vec3 p = normalize(vPosO);
    vec3 drift = vec3(uTime * 0.006, 0.0, uTime * 0.002);
    float warp = fbm(p * 3.0 + drift, uOctaves);
    float n = fbm(p * 7.5 + warp * 2.2 + drift * 1.5, uOctaves + 1);
    n = n * 0.8 + fbm(p * 22.0 + warp, 3) * 0.2;
    // Fewer clouds over the dry subtropics, more near the equator and mid-latitudes.
    float lat = abs(p.y);
    float threshold = 0.5 + 0.07 * smoothstep(0.22, 0.42, lat) * (1.0 - smoothstep(0.5, 0.62, lat));
    float dist = length(cameraPosition - vPosW) / max(uScale, 0.0001);
    float near = 1.0 - smoothstep(uRadius * 0.25, uRadius * 1.1, dist);
    n += (vnoise(p * 90.0) - 0.5) * 0.12 * near;
    float cover = smoothstep(threshold, threshold + 0.16, n);
    // Keep the sky over the pad clear so the launch is visible.
    cover *= 1.0 - smoothstep(0.9935, 0.9995, dot(p, normalize(uSite)));

    vec3 N = normalize(vNormalW);
    vec3 L = normalize(uSun);
    float ndl = dot(N, L);
    float lit = smoothstep(-0.1, 0.5, ndl);
    vec3 lowSun = mix(vec3(1.0, 0.8, 0.68), vec3(1.0), smoothstep(0.0, 0.25, ndl));
    vec3 colour = vec3(1.0) * (0.03 + lit * 1.9) * lowSun;
    float alpha = cover * 0.82;
    gl_FragColor = vec4(colour, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// ---------- atmosphere rim ----------

const earthAtmosphereVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
const earthAtmosphereFragment = /* glsl */ `
  uniform vec3 uSun;
  uniform float uStrength;
  uniform float uMax;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float d = clamp(-dot(vNormal, vView) / uMax, 0.0, 1.0);
    float ndl = dot(vNormal, normalize(uSun));
    float lit = smoothstep(-0.25, 0.5, ndl);
    float glow = pow(d, 1.6) * lit * uStrength;
    // Blue on the day side, a thin warm edge at the terminator.
    vec3 tint = mix(vec3(1.0, 0.52, 0.3), vec3(0.42, 0.66, 1.0), smoothstep(-0.05, 0.3, ndl));
    gl_FragColor = vec4(tint * glow, glow);
    #include <colorspace_fragment>
  }
`;

// ---------- textures ----------

function createEarthPaint() {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const toX = (lon: number) => ((lon + 180) / 360) * width;
  const toY = (lat: number) => ((90 - lat) / 180) * height;
  ctx.fillStyle = '#0d2c55';
  ctx.fillRect(0, 0, width, height);
  const blob = (lon: number, lat: number, rx: number, ry: number, color: string) => {
    for (const offset of [-360, 0, 360]) {
      const x = toX(lon + offset);
      const y = toY(lat);
      const sx = (rx / 360) * width;
      const sy = (ry / 180) * height;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, sy / Math.max(0.001, sx));
      const fill = ctx.createRadialGradient(0, 0, 0, 0, 0, sx);
      fill.addColorStop(0, color);
      fill.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(0, 0, sx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };
  const land = 'rgba(86, 110, 58, 0.92)';
  const dry = 'rgba(170, 138, 84, 0.9)';
  [
    [-100, 45, 28, 18], [-90, 15, 16, 14], [-62, -10, 14, 22],
    [20, 8, 18, 22], [25, -22, 12, 14], [45, 25, 14, 10],
    [80, 45, 36, 18], [100, 35, 22, 14], [110, 60, 24, 12],
    [135, -25, 14, 10],
  ].forEach(([lon, lat, rx, ry]) => blob(lon, lat, rx, ry, land));
  [[20, 22, 16, 10], [45, 25, 12, 8], [70, 28, 14, 8]].forEach(([lon, lat, rx, ry]) => blob(lon, lat, rx, ry, dry));
  ctx.fillStyle = 'rgba(236, 240, 244, 0.95)';
  ctx.fillRect(0, 0, width, toY(78));
  ctx.fillRect(0, toY(-78), width, height - toY(-78));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function useSmallScreen() {
  const gl = useThree((state) => state.gl);
  return useMemo(() => gl.capabilities.maxTextureSize < 2048 || window.matchMedia('(max-width: 800px), (max-height: 500px)').matches, [gl]);
}

function useEarthMap() {
  const gl = useThree((state) => state.gl);
  const small = useSmallScreen();
  const painted = useMemo(() => createEarthPaint(), []);
  const [map, setMap] = useState<THREE.Texture | null>(null);
  useEffect(() => () => { painted?.dispose(); }, [painted]);
  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.loadAsync(`${EARTH_BASE}earth-color-${small ? '1k' : '2k'}.jpg`)
      .then((texture) => {
        if (cancelled) { texture.dispose(); return; }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(16, gl.capabilities.getMaxAnisotropy());
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        setMap(texture);
      })
      .catch(() => { /* painted stand-in remains */ });
    return () => { cancelled = true; };
  }, [gl, small]);
  useEffect(() => () => { map?.dispose(); }, [map]);
  return map ?? painted;
}

export function EarthLaunch() {
  const color = useEarthMap();
  const small = useSmallScreen();
  const earthMesh = useRef<THREE.Mesh>(null);
  const octaves = small ? 4 : 5;
  const earthMaterial = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: earthVertex,
    fragmentShader: earthFragment,
    uniforms: {
      uMap: { value: null as THREE.Texture | null },
      uSun: { value: SUN_DIRECTION.clone() },
      uRadius: { value: EARTH_RADIUS },
      uScale: { value: 1 },
      uOctaves: { value: octaves },
    },
  }), [octaves]);
  const cloudMaterial = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: earthVertex,
    fragmentShader: cloudFragment,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uSun: { value: SUN_DIRECTION.clone() },
      uSite: { value: SITE.clone() },
      uTime: { value: 0 },
      uRadius: { value: EARTH_RADIUS },
      uScale: { value: 1 },
      uOctaves: { value: octaves },
    },
  }), [octaves]);
  const atmosphere = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: earthAtmosphereVertex,
    fragmentShader: earthAtmosphereFragment,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide,
    uniforms: {
      uSun: { value: SUN_DIRECTION.clone() },
      uStrength: { value: 1.25 },
      uMax: { value: Math.sqrt(1 - 1 / (1.03 * 1.03)) },
    },
  }), []);
  useEffect(() => { earthMaterial.uniforms.uMap.value = color; }, [earthMaterial, color]);
  useEffect(() => () => { atmosphere.dispose(); earthMaterial.dispose(); cloudMaterial.dispose(); }, [atmosphere, earthMaterial, cloudMaterial]);
  const scaleVec = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock }) => {
    cloudMaterial.uniforms.uTime.value = clock.getElapsedTime();
    // The group is scaled down during the transit; the close-up detail should follow.
    if (earthMesh.current) {
      earthMesh.current.getWorldScale(scaleVec);
      earthMaterial.uniforms.uScale.value = scaleVec.x;
      cloudMaterial.uniforms.uScale.value = scaleVec.x;
    }
  });
  return (
    <group>
      <mesh ref={earthMesh} material={earthMaterial}>
        <sphereGeometry args={[EARTH_RADIUS, 256, 160]} />
      </mesh>
      <mesh scale={1.011} material={cloudMaterial}>
        <sphereGeometry args={[EARTH_RADIUS, 128, 80]} />
      </mesh>
      <mesh scale={1.03} material={atmosphere}>
        <sphereGeometry args={[EARTH_RADIUS, 96, 64]} />
      </mesh>
    </group>
  );
}
