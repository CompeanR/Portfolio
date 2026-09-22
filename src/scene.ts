import * as THREE from "three";

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform vec2 uPointer;
  varying float vHeight;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
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

  float height(vec2 p) {
    float t = uTime * 0.18;
    float swell = sin(p.x * 0.55 + t * 1.6) * 0.22 + sin(p.y * 0.8 - t * 1.1) * 0.16;
    float ripple = noise(p * 0.9 + t) * 0.32 + noise(p * 2.2 - t * 0.7) * 0.12 + noise(p * 5.0 + t * 1.3) * 0.04;
    float d = distance(p, uPointer);
    float touch = exp(-d * d * 0.12) * 0.45;
    return swell + ripple + touch;
  }

  void main() {
    vUv = uv;
    vec3 p = position;
    float e = 0.12;
    float h = height(p.xy);
    float hx = height(p.xy + vec2(e, 0.0));
    float hy = height(p.xy + vec2(0.0, e));
    p.z = h;
    vHeight = h;
    vNormal = normalize(vec3(h - hx, h - hy, e));
    vWorld = p;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform vec3 uSun;
  uniform vec3 uSky;
  uniform vec3 uSunPos;
  uniform vec3 uCamPos;
  varying float vHeight;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec2 vUv;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 toSun = normalize(uSunPos - vWorld);
    vec3 toCam = normalize(uCamPos - vWorld);
    float diffuse = clamp(dot(n, toSun), 0.0, 1.0);
    float spec = pow(clamp(dot(n, normalize(toSun + toCam)), 0.0, 1.0), 90.0);
    float fresnel = pow(1.0 - clamp(dot(n, toCam), 0.0, 1.0), 3.0);

    float h = smoothstep(-0.5, 0.8, vHeight);
    vec3 col = mix(uDeep, uShallow, h * 0.55 + diffuse * 0.25);
    col = mix(col, uFoam, fresnel * 0.12);
    col += uSun * spec * 0.6;
    float haze = smoothstep(0.7, 1.0, vUv.y);
    col = mix(col, uSky, haze * 0.85);
    float fade = smoothstep(0.0, 0.3, vUv.y);
    gl_FragColor = vec4(col, fade);
    #include <colorspace_fragment>
  }
`;

export function mountScene(canvas: HTMLCanvasElement): () => void {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, -9.5, 4.2);
  camera.lookAt(0, 4, 0.6);

  const uniforms = {
    uTime: { value: 0 },
    uPointer: { value: new THREE.Vector2(40, 40) },
    uDeep: { value: new THREE.Color("#0b4558") },
    uShallow: { value: new THREE.Color("#3a8ea1") },
    uFoam: { value: new THREE.Color("#d8e6e2") },
    uSky: { value: new THREE.Color("#0f4b5e") },
    uSun: { value: new THREE.Color("#f2a63a") },
    uSunPos: { value: new THREE.Vector3(5.5, 14, 3) },
    uCamPos: { value: camera.position },
  };

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 30, 180, 130),
    new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true }),
  );
  scene.add(water);

  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 64),
    new THREE.MeshBasicMaterial({ color: "#f2a63a" }),
  );
  sun.position.set(5.5, 14, 3);
  sun.lookAt(camera.position);
  scene.add(sun);

  const haloCanvas = document.createElement("canvas");
  haloCanvas.width = haloCanvas.height = 256;
  const ctx = haloCanvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(128, 128, 40, 128, 128, 128);
  grad.addColorStop(0, "rgba(242, 166, 58, 0.55)");
  grad.addColorStop(0.5, "rgba(200, 84, 30, 0.18)");
  grad.addColorStop(1, "rgba(200, 84, 30, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(haloCanvas), transparent: true, depthWrite: false, depthTest: false }),
  );
  halo.scale.setScalar(9);
  halo.renderOrder = 1;
  halo.position.copy(sun.position);
  scene.add(halo);

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2(2, 2);
  const targetPointer = new THREE.Vector2(40, 40);
  const targetTilt = new THREE.Vector2();

  const onMove = (e: PointerEvent) => {
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(water)[0];
    if (hit) targetPointer.set(hit.point.x, hit.point.y);
    targetTilt.set(ndc.x, ndc.y);
  };
  const onLeave = () => targetPointer.set(40, 40);

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerleave", onLeave);
  window.addEventListener("resize", resize);
  resize();

  const clock = new THREE.Clock();
  let raf = 0;
  const tick = () => {
    uniforms.uTime.value = clock.getElapsedTime();
    uniforms.uPointer.value.lerp(targetPointer, 0.08);
    camera.position.x += (targetTilt.x * 0.6 - camera.position.x) * 0.04;
    camera.position.z += (4.2 + targetTilt.y * 0.35 - camera.position.z) * 0.04;
    camera.lookAt(0, 4, 0.6);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };
  tick();

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerleave", onLeave);
    window.removeEventListener("resize", resize);
    renderer.dispose();
  };
}
