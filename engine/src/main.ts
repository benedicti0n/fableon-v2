// Frame driver page for the Adi Parva short (replaces Remotion's <ThreeCanvas> on this CPU-only machine: the same
// world / post chain, rendered on demand by window.renderFrame(f) and read back as JPEG by engine/render.cjs).
// Post chain (bridge short): InkPass (world ink, own pass) -> lens blur pre + main -> [bloom + NEUTRAL tone map + grade],
// MSAA 4. Every pixel-sized parameter is specified at 1080x1920 and scaled with the output height.
import * as THREE from "three";
import { EffectComposer, RenderPass, EffectPass, Pass, BlendFunction, ToneMappingEffect, ToneMappingMode, SMAAEffect, SMAAPreset, EdgeDetectionMode } from "postprocessing";
import { World } from "./world";
import { InkPass, noInkFallback } from "./ink";
import { LensBlur } from "./lensblur";
import { GradeEffect, GRADES, GRADE_STRENGTH, gradeFor } from "./grade";
import { HalationEffect } from "./halation";
import { MaskedBloomEffect } from "./glow";
import { LegacyHalationEffect } from "./legacyHalation";
import { moodRig } from "./look";
import { CHAR } from "./shade";
import { buildStoryboard, Runtime } from "./storyboard/build";
import type { Storyboard } from "./storyboard/types";
import type { Wd } from "./core/anchors";
import { SET_INFO } from "./marks";
import { measureSubjects } from "./measure";
import { KEEPOUT } from "./keepout";
import type { Place } from "./cast";

// Project data is fetched before anything is built. render.cjs serves the project under /project/; a project must
// provide both storyboard.json and words.json — there is no compiled-in timeline any more.
type ProjectData = { words: unknown | null; storyboard: unknown | null };
const loadProject = async (): Promise<ProjectData> => {
  const get = async (name: string) => {
    try { const r = await fetch(`/project/${name}`); return r.ok ? await r.json() : null; } catch { return null; }
  };
  const [words, storyboard] = await Promise.all([get("words.json"), get("storyboard.json")]);
  return { words, storyboard };
};
const PROJECT = await loadProject();

let RT: Runtime;
try {
  if (!PROJECT.storyboard) throw new Error("project has no storyboard.json (run: fableon init <name> --from fixtures/adi-parva)");
  if (!PROJECT.words) throw new Error("project has storyboard.json but no words.json");
  RT = buildStoryboard(PROJECT.storyboard as Storyboard, PROJECT.words as Wd[]);
} catch (e) {
  (window as unknown as Record<string, unknown>).BUILD_ERROR = e instanceof Error ? e.message : String(e);
  (window as unknown as Record<string, unknown>).ready = true;
  throw e;
}

const q = new URLSearchParams(location.search);
const W = +(q.get("w") || 1440), H = +(q.get("h") || 2560), MS = +(q.get("ms") ?? 4);
const OFF = new Set((q.get("off") || "").split(",").filter(Boolean));

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: "high-performance", stencil: false });
renderer.setPixelRatio(1); renderer.setSize(W, H); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
const gl = renderer.getContext();
const dbg = gl.getExtension("WEBGL_debug_renderer_info");
// Reported by the frame driver (`fableon doctor`, render.cjs) so a silent software fallback is visible. Not a visual change.
(window as unknown as Record<string, unknown>).GLINFO = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(40, W / H, 0.15, 1500);
const world = new World();
world.noShafts = OFF.has("shafts");
world.msaa = MS;
world.hideActor = q.get("hide") || "";
scene.add(world.root);
noInkFallback(world.root);

const MEASURE = measureSubjects();

const ink = new InkPass(scene, cam);

// ---------- character mask: actor/special cards only, soft alpha coverage, tested against world depth ----------
// The mask is the cards' real alpha at 2x supersampling (downsampled by LinearFilter), so its edge matches the
// MSAA frame without a binary cut or a dilation ring. It is tested against the world-only depth so a card behind a
// trunk has mask 0. The glow passes multiply their source and their added light by (1 - mask).
const MASK_SS = 2;
const charMaskRT = new THREE.WebGLRenderTarget(W * MASK_SS, H * MASK_SS, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: false });
const charMaskScene = new THREE.Scene();
const charMaskGroup = new THREE.Group(); charMaskScene.add(charMaskGroup);
const charMaskMat = (tex: THREE.Texture) => new THREE.ShaderMaterial({
  uniforms: { map: { value: tex }, tDepth: { value: null }, uRes: { value: new THREE.Vector2(W * MASK_SS, H * MASK_SS) } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: "uniform sampler2D map; uniform sampler2D tDepth; uniform vec2 uRes; varying vec2 vUv; void main(){ float sceneD = texture2D(tDepth, gl_FragCoord.xy / uRes).x; if (gl_FragCoord.z > sceneD + 0.0008) discard; float a = texture2D(map, vUv).a; gl_FragColor = vec4(a, a, a, a); }",
  depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false, blending: THREE.NoBlending, transparent: false,
});
const maskMeshes: THREE.Mesh[] = [];
let charMaskFill = false;
function renderCharMask(depthTex: THREE.Texture | null, fill = false) {
  let n = 0;
  for (const a of world.coverageCards.actors) {
    const tex = a.r?.tex;
    if (!tex) continue;
    let m = maskMeshes[n];
    if (!m) { m = new THREE.Mesh(a.mesh.geometry, charMaskMat(tex)); maskMeshes[n] = m; charMaskGroup.add(m); }
    m.geometry = a.mesh.geometry;
    (m.material as THREE.ShaderMaterial).uniforms.map.value = tex;
    (m.material as THREE.ShaderMaterial).uniforms.tDepth.value = depthTex;
    const mat = m.material as THREE.ShaderMaterial;
    if ((mat.blending === THREE.CustomBlending) !== fill) {
      mat.blending = fill ? THREE.CustomBlending : THREE.NoBlending;
      if (fill) { mat.blendEquation = THREE.MaxEquation; mat.blendEquationAlpha = THREE.MaxEquation; mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.OneFactor; }
      mat.needsUpdate = true;
    }
    m.position.copy(a.mesh.position); m.quaternion.copy(a.mesh.quaternion); m.scale.copy(a.mesh.scale);
    m.visible = true; n++;
  }
  for (let i = n; i < maskMeshes.length; i++) maskMeshes[i].visible = false;
  const oldTarget = renderer.getRenderTarget();
  const oldClear = new THREE.Color(); renderer.getClearColor(oldClear); const oldAlpha = renderer.getClearAlpha();
  const oldSpace = renderer.outputColorSpace, oldAuto = renderer.autoClear;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.autoClear = false;
  renderer.setRenderTarget(charMaskRT); renderer.setClearColor(0x000000, 1); renderer.clear(true, false, false); renderer.render(charMaskScene, cam);
  renderer.setRenderTarget(oldTarget); renderer.setClearColor(oldClear, oldAlpha); renderer.outputColorSpace = oldSpace; renderer.autoClear = oldAuto;
}

class CharMaskPass extends Pass {
  active = false;
  fill = false;
  constructor() { super("CharMaskPass"); this.needsSwap = false; }
  render(_renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget) {
    if (!this.active) return;
    renderCharMask(ink.depthTexture ?? inputBuffer.depthTexture ?? null, this.fill);
  }
}
const maskPass = new CharMaskPass();


// ---------- coverage pass: the same frame as flat object IDs ----------
// Separate scene, separate unlit material, no post chain. This path is only used by `fableon frames` and
// `render.cjs coverage`; it never runs during normal renders.
const COV_W = 180, COV_H = 320;
const covCanvas = document.createElement("canvas"); covCanvas.width = COV_W; covCanvas.height = COV_H;
const covCtx = covCanvas.getContext("2d")!;
const covRT = new THREE.WebGLRenderTarget(COV_W, COV_H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat, type: THREE.UnsignedByteType });
const SOLO_W = 72, SOLO_H = 128, SOLO_K = (COV_W * COV_H) / (SOLO_W * SOLO_H);
const covSoloRT = new THREE.WebGLRenderTarget(SOLO_W, SOLO_H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat, type: THREE.UnsignedByteType });
const covScene = new THREE.Scene();
const covStatic = new THREE.Group(); const covDyn = new THREE.Group(); covScene.add(covStatic, covDyn);
const covIds = new Map<string, { i: number; c: [number, number, number] }>();
const covPalette: string[] = [];
const covFor = (id: string) => {
  let v = covIds.get(id);
  if (!v) {
    const i = covIds.size + 1;
    v = { i, c: [((i * 73) % 240) + 8, ((i * 151) % 240) + 8, ((i * 199) % 240) + 8] };
    covIds.set(id, v); covPalette[i] = id;
  }
  return v;
};
const covColor = (id: string) => { const c = covFor(id).c; return new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255); };
const covMat = (id: string, tex?: THREE.Texture) => new THREE.ShaderMaterial({
  uniforms: { map: { value: tex ?? null }, color: { value: covColor(id) }, hasMap: { value: tex ? 1 : 0 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: "uniform sampler2D map; uniform vec3 color; uniform float hasMap; varying vec2 vUv; void main(){ if (hasMap > 0.5 && texture2D(map, vUv).a < 0.5) discard; gl_FragColor = vec4(color, 1.0); }",
  depthTest: true, depthWrite: true, side: THREE.DoubleSide, toneMapped: false, fog: false,
});
const covMeshes: THREE.Mesh[] = [];
const covAdd = (parent: THREE.Object3D, m: THREE.Mesh, id: string, set?: string, pos?: THREE.Vector3) => {
  m.userData.id = id; m.userData.set = set; m.userData.pos = pos ?? m.position.clone();
  parent.add(m); covMeshes.push(m); return m;
};
const covBox = (min: number[], max: number[], id: string, set?: string) => {
  const g = new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  const m = new THREE.Mesh(g, covMat(id)); m.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  m.userData.baseVisible = true; covAdd(covStatic, m, id, set, m.position.clone());
};
const covCyl = (v: any, id: string, set?: string) => {
  const g = new THREE.CylinderGeometry(v.r, v.r, v.y1 - v.y0, 12);
  const m = new THREE.Mesh(g, covMat(id)); m.position.set(v.x, (v.y0 + v.y1) / 2, v.z);
  covAdd(covStatic, m, id, set, m.position.clone());
};
// solid set volumes exported by F1; one ID per volume (the column case)
for (const [set, vols] of Object.entries(KEEPOUT)) for (const v of vols) {
  if (v.kind === "box") covBox(v.min, v.max, `world:${set}.${v.name}`, set); else covCyl(v, `world:${set}.${v.name}`, set);
}
for (const [set, info] of Object.entries(SET_INFO)) for (const m of info.marks) {
  covBox([m.pos[0] - 0.18, m.pos[1], m.pos[2] - 0.18], [m.pos[0] + 0.18, m.pos[1] + 0.36, m.pos[2] + 0.18], `mark:${set}.${m.name}`, set);
}
// ground and water reserved IDs
const covGround = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2), covMat("ground"));
covGround.position.y = 1.5; covAdd(covStatic, covGround, "ground");
const covWater = new THREE.Mesh(new THREE.PlaneGeometry(1400, 40).rotateX(-Math.PI / 2), covMat("water"));
covWater.position.y = 0.25; covAdd(covStatic, covWater, "water");
const covSkyId = "sky";
const covDistance = (p: THREE.Vector3) => cam.position.distanceTo(p);
const covProject = (p: [number, number, number]) => {
  const v = new THREE.Vector3(...p).project(cam);
  return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
};
const covHead = (p: Place) => {
  const m = MEASURE[p.measure ?? "adult"] ?? MEASURE.adult;
  const sc = p.scale ?? 1, top = p.y + (p.seated ? m.seated : m.standing) * sc, chin = top - m.head * sc, eye = p.y + (p.seated ? m.eyeSeated : m.eye) * sc;
  const hw = m.head * 0.35 * sc;
  const l = covProject([p.x - hw, top, p.z]), r = covProject([p.x + hw, top, p.z]);
  const t = covProject([p.x, top, p.z]), b = covProject([p.x, chin, p.z]);
  const e = covProject([p.x, eye, p.z]);
  // Normalised screen box: the old direct projection could invert x0/x1 when the card was mirrored or past the
  // camera plane, which made left/right edge checks miss real cuts.
  return {
    headBox: { x0: Math.min(l.x, r.x), y0: Math.min(t.y, b.y), x1: Math.max(l.x, r.x), y1: Math.max(t.y, b.y) },
    eye: e, chin: b,
  };
};
function covAddDynamicPiece(obj: THREE.Object3D, id: string) {
  if (!obj.visible) return;
  const clone = obj.clone(true);
  clone.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.material = covMat(id); m.userData.id = id; } });
  const pos = new THREE.Vector3(); obj.getWorldPosition(pos);
  clone.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.userData.pos = pos.clone(); covMeshes.push(m); } });
  covDyn.add(clone);
}
function coverageFrame(f: number, opts: any = {}) {
  const t0 = performance.now();
  const shot = RT.SHOTS.find((s) => f >= s.a && f < s.b);
  if (!shot) return { frame: f, ms: 0, shot: null, ids: [], people: [], subjects: {} };
  world.update(shot, f, cam, scene, H, RT.kickCam);
  covDyn.clear(); covMeshes.length = 0;
  for (const m of covStatic.children) { const mesh = m as THREE.Mesh; if (mesh.userData.set) mesh.visible = shot.sets.includes(mesh.userData.set); else mesh.visible = true; }
  covGround.visible = !shot.sets.includes("naga"); covWater.visible = !shot.sets.includes("naga");
  const items: any[] = [];
  const addItem = (id: string, kind: string, pos: THREE.Vector3, p?: Place) => {
    const col = covFor(id).c;
    const item: any = { id, kind, color: col, pos: pos.toArray(), distance: covDistance(pos) };
    if (p?.person) Object.assign(item, { measure: p.measure, seated: !!p.seated, person: true, ...covHead(p) });
    items.push(item);
    return item;
  };
  addItem("sky", "sky", new THREE.Vector3(cam.position.x, cam.position.y, cam.position.z));
  for (const m of covStatic.children) { const mesh = m as THREE.Mesh; if (mesh.visible && mesh.userData.id && !["ground", "water", "sky"].includes(mesh.userData.id)) addItem(mesh.userData.id, "world", mesh.position.clone()); }
  for (const id of ["ground", "water"]) { const mesh = covStatic.children.find((m) => (m as THREE.Mesh).userData.id === id) as THREE.Mesh; if (mesh?.visible) addItem(id, id, mesh.position.clone()); }
  for (let i = 0; i < world.coverageCards.actors.length; i++) {
    const a = world.coverageCards.actors[i], p = world.coverageCards.places[i]; const tex = a.r?.tex;
    if (!tex) continue;
    const mesh = new THREE.Mesh(a.mesh.geometry, covMat(p.id ?? `actor#${i}`, tex));
    mesh.position.copy(a.mesh.position); mesh.quaternion.copy(a.mesh.quaternion); mesh.scale.copy(a.mesh.scale); mesh.visible = true;
    covAdd(covDyn, mesh, p.id ?? `actor#${i}`, undefined, mesh.position.clone());
    addItem(p.id ?? `actor#${i}`, p.person ? "person" : "actor", mesh.position, p);
  }
  for (let i = 0; i < world.coverageCards.fxs.length; i++) {
    const x = world.coverageCards.fxs[i], p = x.p as any; const tex = (x.mesh.material as THREE.MeshBasicMaterial)?.map as THREE.Texture | undefined;
    if (!tex || String(p.key ?? '').startsWith('blob|')) continue;
    const mesh = new THREE.Mesh(x.mesh.geometry, covMat(p.id ?? `fx#${i}`, tex));
    mesh.position.copy(x.mesh.position); mesh.quaternion.copy(x.mesh.quaternion); mesh.scale.copy(x.mesh.scale);
    covAdd(covDyn, mesh, p.id ?? `fx#${i}`, undefined, mesh.position.clone());
    addItem(p.id ?? `fx#${i}`, "effect", mesh.position);
  }
  const dyn = world.sets.dyn as any;
  for (const [id, obj] of Object.entries(dyn)) covAddDynamicPiece(obj as THREE.Object3D, id);
  // dynamic set pieces IDs are added as one item each
  for (const id of Object.keys(dyn)) { const obj = dyn[id] as THREE.Object3D; if (obj.visible !== false) { const pos = new THREE.Vector3(); obj.getWorldPosition(pos); if (!items.some((x) => x.id === id)) addItem(id, "setPiece", pos); } }
  const oldSpace = renderer.outputColorSpace; renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  const oldClear = new THREE.Color(); renderer.getClearColor(oldClear); const oldAlpha = renderer.getClearAlpha();
  renderer.setClearColor(covColor(covSkyId), 1);
  renderer.setRenderTarget(covRT); renderer.clear(); renderer.render(covScene, cam);
  const raw = new Uint8Array(COV_W * COV_H * 4); renderer.readRenderTargetPixels(covRT, 0, 0, COV_W, COV_H, raw);
  const colorKey = (r: number, g: number, b: number) => `${r},${g},${b}`;
  const byColor = new Map<string, string>(); for (const [id, v] of covIds) byColor.set(colorKey(v.c[0], v.c[1], v.c[2]), id);
  byColor.set(colorKey(covFor(covSkyId).c[0], covFor(covSkyId).c[1], covFor(covSkyId).c[2]), covSkyId);
  const stats = new Map<string, any>();
  const at = (id: string) => { let s = stats.get(id); if (!s) { s = { id, pixels: 0, x0: 1, y0: 1, x1: 0, y1: 0, distance: Infinity }; stats.set(id, s); } return s; };
  for (let yy = 0; yy < COV_H; yy++) for (let xx = 0; xx < COV_W; xx++) {
    const o = (yy * COV_W + xx) * 4, id = byColor.get(colorKey(raw[o], raw[o + 1], raw[o + 2]));
    if (!id) continue;
    const s = at(id), top = 1 - (yy + 1) / COV_H;
    s.pixels++; s.x0 = Math.min(s.x0, xx / COV_W); s.x1 = Math.max(s.x1, (xx + 1) / COV_W); s.y0 = Math.min(s.y0, top); s.y1 = Math.max(s.y1, top + 1 / COV_H);
  }
  for (const item of items) { const s = stats.get(item.id); if (s) s.distance = Math.min(s.distance, item.distance); }
  const ids = [...stats.values()].map((s) => ({ ...s, bbox: { x0: s.x0, y0: s.y0, x1: s.x1, y1: s.y1 } }));
  // Headwear (buns, crowns, turbans, hair) is not in the rig measure. For each person, find the topmost ID pixel
  // inside the head's horizontal band and above the eye point; that is the silhouette top used by edge checks.
  const people = items.filter((i) => i.person);
  for (const p of people) {
    const hb = p.headBox; if (!hb) continue;
    const pad = Math.max(0.008, (hb.x1 - hb.x0) * 0.18);
    const x0 = hb.x0 - pad, x1 = hb.x1 + pad;
    let top = hb.y0;
    for (let yy = 0; yy < COV_H; yy++) {
      const y = 1 - (yy + 1) / COV_H;
      if (y < p.eye.y - 0.01) break;
      for (let xx = 0; xx < COV_W; xx++) {
        const x = (xx + 0.5) / COV_W;
        if (x < x0 || x > x1) continue;
        const o = (yy * COV_W + xx) * 4;
        if (byColor.get(colorKey(raw[o], raw[o + 1], raw[o + 2])) === p.id) { top = Math.min(top, y); break; }
      }
    }
    hb.y0 = top;
  }
  const request = [...new Set([...(opts.subjects ?? []), ...(opts.over ? [opts.over] : []), ...(opts.with ?? []), ...(opts.edge ?? [])])];
  const visible: Record<string, number> = {};
  for (const id of request) {
    for (const m of covMeshes) m.visible = m.userData.id === id;
    renderer.setRenderTarget(covSoloRT); renderer.clear(); renderer.render(covScene, cam);
    const solo = new Uint8Array(SOLO_W * SOLO_H * 4); renderer.readRenderTargetPixels(covSoloRT, 0, 0, SOLO_W, SOLO_H, solo);
    const c = covFor(id).c, r = c[0], g = c[1], b = c[2]; let n = 0;
    for (let o = 0; o < solo.length; o += 4) if (Math.abs(solo[o] - r) <= 2 && Math.abs(solo[o + 1] - g) <= 2 && Math.abs(solo[o + 2] - b) <= 2) n++;
    const hit = stats.get(id)?.pixels ?? 0; visible[id] = n ? Math.min(1, hit / (n * SOLO_K)) : 0;
  }
  for (const m of covMeshes) m.visible = true;
  renderer.setRenderTarget(null); renderer.setClearColor(oldClear, oldAlpha); renderer.outputColorSpace = oldSpace;
  let png = "";
  if (opts.png) { const img = covCtx.createImageData(COV_W, COV_H); for (let y = 0; y < COV_H; y++) for (let x = 0; x < COV_W; x++) { const o = ((COV_H - 1 - y) * COV_W + x) * 4, q = (y * COV_W + x) * 4; img.data[q] = raw[o]; img.data[q + 1] = raw[o + 1]; img.data[q + 2] = raw[o + 2]; img.data[q + 3] = 255; } covCtx.putImageData(img, 0, 0); png = covCanvas.toDataURL("image/png"); }
  return { frame: f, shot: shot.id, ms: performance.now() - t0, ids, people, subjects: visible, items, png };
}
(window as unknown as Record<string, unknown>).coverageFrame = coverageFrame;

const makeBloom = () => {
  const b = new MaskedBloomEffect({ blendFunction: BlendFunction.ADD, intensity: 0.5, luminanceThreshold: 1.0, luminanceSmoothing: 0.2, mipmapBlur: true, levels: 6, radius: 0.6 });
  const mip = b.mipmapBlurPass, setSize = mip.setSize.bind(mip);
  mip.setSize = (w: number, h: number) => setSize(Math.round((960 * w) / Math.max(h, 1)), 960);
  return b;
};
const composer = new EffectComposer(renderer, { multisampling: MS, frameBufferType: THREE.HalfFloatType });
const lens = new LensBlur({ maxCoC: 24, nearScale: 1.2 });
const gradeLegacy = new GradeEffect(GRADES.day, 1), gradeLook = new GradeEffect(GRADES.day, 1);
const halationLegacy = new LegacyHalationEffect(), halationLook = new HalationEffect();
const bloomLegacy = OFF.has("bloom") ? null : makeBloom(), bloomLook = OFF.has("bloom") ? null : makeBloom();
const preP = new EffectPass(cam, lens.pre), mainP = new EffectPass(cam, lens.main);
composer.addPass(new RenderPass(scene, cam));
if (!OFF.has("ink")) composer.addPass(ink);
composer.addPass(maskPass);
if (!OFF.has("lens")) { composer.addPass(preP); composer.addPass(mainP); }
const legacyPass = new EffectPass(cam, ...(bloomLegacy ? [bloomLegacy] : []), ...(OFF.has("halation") ? [] : [halationLegacy]), new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }), ...(OFF.has("grade") ? [] : [gradeLegacy]));
const lookPass = new EffectPass(cam, ...(bloomLook ? [bloomLook] : []), ...(OFF.has("halation") ? [] : [halationLook]), new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }), ...(OFF.has("grade") ? [] : [gradeLook]));
composer.addPass(legacyPass);
composer.addPass(lookPass);
// MSAA is the costliest part on the CPU renderer (~3 s/frame at 2K): without it, SMAA on the final image smooths the
// card cut-outs and remaining geometry edges (the world ink lines are already anti-aliased by the ink pass)
if (MS === 0 && !OFF.has("smaa")) { const smaa = new SMAAEffect({ preset: SMAAPreset.HIGH, edgeDetectionMode: EdgeDetectionMode.COLOR }); composer.addPass(new EffectPass(cam, smaa)); }
composer.setSize(W, H);
halationLegacy.setSize(W, H); halationLook.setSize(W, H);

const out = document.createElement("canvas"); out.width = W; out.height = H;
const g2 = out.getContext("2d")!;
const fwd = new THREE.Vector3(), fpt = new THREE.Vector3();

const PROF: Record<string, number> = {};
(window as unknown as Record<string, unknown>).PROF = PROF;
const drawShot = (id: number, f: number) => {
  const s = RT.SHOTS[id - 1];
  let t0 = performance.now();
  const target = world.update(s, f, cam, scene, H, RT.kickCam);
  if (s.look?.skinNeutral) { CHAR.uCharTint.value.set(1, 1, 1); CHAR.uCharShade.value = 1; CHAR.uGrad.value = 0; CHAR.uFill.value = 0; }
  PROF.update = performance.now() - t0; t0 = performance.now();
  const lookOn = !!s.look;
  charMaskFill = !!s.look?.maskFill;
  maskPass.fill = charMaskFill;
  maskPass.active = lookOn;
  legacyPass.enabled = !lookOn; lookPass.enabled = lookOn;
  if (bloomLegacy) bloomLegacy.setCharMask(charMaskRT.texture, W, H, false);
  if (bloomLook) bloomLook.setCharMask(charMaskRT.texture, W, H, lookOn);
  halationLook.on = lookOn;
  halationLook.setCharMask(charMaskRT.texture, W, H, lookOn);
  noInkFallback(world.root);
  const d = RT.dofAt(f);
  cam.getWorldDirection(fwd);
  if (d.focus) fpt.set(...d.focus(f)); else fpt.copy(target);
  lens.focus = Math.max(0.3, fpt.sub(cam.position).dot(fwd));
  lens.cInf = d.cInf;
  preP.enabled = mainP.enabled = d.cInf > 0.25;
  const rig = moodRig(s.look?.mood);
  if (s.look && rig) {
    halationLook.intensity = (s.look.glow ?? rig.glow.intensity) * (s.look.glowScale ?? 1);
    halationLook.threshold = rig.glow.threshold;
    halationLook.tint = rig.glow.tint;
    halationLook.radius = Math.max(4, Math.round(rig.glow.radius * H / 1080));
  } else halationLook.intensity = 0;
  gradeFor(gradeLegacy, s.light);
  gradeLegacy.setCharMask(charMaskRT.texture, W, H, false);
  gradeLegacy.protect = 0;
  gradeFor(gradeLook, s.look && rig ? rig.grade : s.light);
  gradeLook.setLegacy(GRADES[s.light], s.look?.skinNeutral ? 0 : (GRADE_STRENGTH[s.light] ?? 1));
  gradeLook.setLook({ exposure: s.look?.exposure ?? 0, warmth: s.look?.warmth ?? 0, vignette: s.look?.vignette ?? 1, haze: s.look?.haze ?? 1 });
  gradeLook.setCharMask(charMaskRT.texture, W, H, lookOn);
  gradeLook.protect = lookOn ? 1 : 0;
  composer.render();
  { const gl = renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); }
  PROF.render = performance.now() - t0;
};

(window as unknown as Record<string, unknown>).TOTAL = RT.TOTAL;
const renderComposite = (f: number) => {
  const layers = RT.layersAt(f);
  g2.globalAlpha = 1;
  layers.forEach((l, i) => {
    drawShot(l.id, f);
    const t2 = performance.now();
    g2.globalAlpha = i ? l.alpha : 1;
    g2.drawImage(renderer.domElement, 0, 0);
    PROF.blit = performance.now() - t2;
  });
  let flash = 0;
  for (const f0 of RT.FLASHES) if (f >= f0 && f < f0 + 4) flash = Math.max(flash, [1, 0.75, 0.45, 0.2][f - f0]);
  if (flash > 0) { g2.globalAlpha = flash; g2.fillStyle = "#ffffff"; g2.fillRect(0, 0, W, H); }
  g2.globalAlpha = 1;
  return out;
};
// Solo shot render for the final segment cache: one shot only, no crossfade layers and no flash.
// The final assembler supplies transitions as separate globally-composited clips.
(window as unknown as Record<string, unknown>).renderShot = (id: number, f: number, quality = 0.94) => {
  const t1 = performance.now();
  drawShot(id, f);
  g2.globalAlpha = 1;
  g2.drawImage(renderer.domElement, 0, 0);
  const url = out.toDataURL("image/jpeg", quality);
  PROF.encode = performance.now() - t1;
  return url;
};
(window as unknown as Record<string, unknown>).renderFrame = (f: number, quality = 0.94) => {
  const t1 = performance.now();
  const url = renderComposite(f).toDataURL("image/jpeg", quality);
  PROF.encode = performance.now() - t1;
  return url;
};
(window as unknown as Record<string, unknown>).renderFramePNG = (f: number) => {
  const t1 = performance.now();
  const url = renderComposite(f).toDataURL("image/png");
  PROF.encode = performance.now() - t1;
  return url;
};
(window as unknown as Record<string, unknown>).renderMask = (f: number) => {
  const shot = RT.SHOTS.find((s) => f >= s.a && f < s.b);
  if (!shot) return "";
  drawShot(shot.id, f);
  const RW = W * MASK_SS, RH = H * MASK_SS;
  const raw = new Uint8Array(RW * RH * 4);
  renderer.readRenderTargetPixels(charMaskRT, 0, 0, RW, RH, raw);
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d")!; const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let sum = 0;
    for (let sy = 0; sy < MASK_SS; sy++) for (let sx = 0; sx < MASK_SS; sx++) {
      const ix = x * MASK_SS + sx, iy = (H - 1 - y) * MASK_SS + sy;
      sum += raw[(iy * RW + ix) * 4];
    }
    const v = Math.round(sum / (MASK_SS * MASK_SS));
    const q = (y * W + x) * 4; img.data[q] = v; img.data[q + 1] = v; img.data[q + 2] = v; img.data[q + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL("image/png");
};
(window as unknown as Record<string, unknown>).shotOf = (f: number) => RT.layersAt(f).map((l) => l.id);
(window as unknown as Record<string, unknown>).SHOTLIST = RT.SHOTS.map((s) => [s.id, s.a, s.b, s.light, s.sets.join("+")]);
(window as unknown as Record<string, unknown>).QA = {
  shots: RT.SHOTS.map((s) => ({ id: s.id, a: s.a, b: s.b })), flash: [RT.FLASH_AT, RT.FLASH_AT + 4], flashes: RT.FLASHES.map((f) => [f, f + 4]),
  xfade: RT.SHOTS.filter((s) => RT.XFADE[s.id]).map((s) => [Math.round(s.a - RT.XFADE[s.id] / 2), Math.round(s.a + RT.XFADE[s.id] / 2)]),
  planned: RT.KICKS.map(([f]) => [f, f + 8]),
};
const camJumps = () => {
  const out: number[] = [];
  for (const s of RT.SHOTS) for (let f = s.a + 1; f < s.b; f++) {
    const c0 = s.cam(f - 1), c1 = s.cam(f);
    const d = Math.hypot(c1.pos[0] - c0.pos[0], c1.pos[1] - c0.pos[1], c1.pos[2] - c0.pos[2]) + Math.hypot(c1.look[0] - c0.look[0], c1.look[1] - c0.look[1], c1.look[2] - c0.look[2]);
    if (d > 0.25) out.push(f);
  }
  return out;
};
(window as unknown as Record<string, unknown>).camJumps = camJumps;
(window as unknown as Record<string, unknown>).EVENTS = [...new Set([...camJumps(), ...RT.JUMP_EVENTS])].sort((a, b) => a - b);
// Authoring metadata: marks/front/bounds per set, scenery keep-out volumes and measured subject sizes. Exported by
// `render.cjs catalog`; not used by normal renders.
(window as unknown as Record<string, unknown>).CATALOG_INFO = { sets: SET_INFO, keepout: KEEPOUT, measure: measureSubjects() };
(window as unknown as Record<string, unknown>).ready = true;
