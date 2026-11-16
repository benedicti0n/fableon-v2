// Frame driver page for the Adi Parva short (replaces Remotion's <ThreeCanvas> on this CPU-only machine: the same
// world / post chain, rendered on demand by window.renderFrame(f) and read back as JPEG by engine/render.cjs).
// Post chain (bridge short): InkPass (world ink, own pass) -> lens blur pre + main -> [bloom + NEUTRAL tone map + grade],
// MSAA 4. Every pixel-sized parameter is specified at 1080x1920 and scaled with the output height.
import * as THREE from "three";
import { EffectComposer, RenderPass, EffectPass, BloomEffect, BlendFunction, ToneMappingEffect, ToneMappingMode, SMAAEffect, SMAAPreset, EdgeDetectionMode } from "postprocessing";
import { World } from "./world";
import { InkPass, noInkFallback } from "./ink";
import { LensBlur } from "./lensblur";
import { GradeEffect, GRADES, gradeFor } from "./grade";
import { SHOTS as STORY_SHOTS, TOTAL as STORY_TOTAL, FLASH_AT as STORY_FLASH, layersAt as storyLayersAt, dofAt as storyDofAt, kickCam as storyKickCam, XFADE as STORY_XFADE, KICKS as STORY_KICKS } from "./story";
import { buildStoryboard, Runtime } from "./storyboard/build";
import type { Storyboard } from "./storyboard/types";
import type { Wd } from "./core/anchors";

// Project data is fetched before anything is built. render.cjs serves the project under /project/; when no
// storyboard is present this resolves to {words:null, storyboard:null} and the compiled-in story.ts is used.
type ProjectData = { words: unknown | null; storyboard: unknown | null };
const loadProject = async (): Promise<ProjectData> => {
  const get = async (name: string) => {
    try { const r = await fetch(`/project/${name}`); return r.ok ? await r.json() : null; } catch { return null; }
  };
  const [words, storyboard] = await Promise.all([get("words.json"), get("storyboard.json")]);
  return { words, storyboard };
};
const PROJECT = await loadProject();

// Without a storyboard the compiled-in story.ts is used exactly as before. With one, build the runtime ShotDef[]
// from storyboard + words (legacy:true shots still come from story.ts).
let RT: Runtime = {
  SHOTS: STORY_SHOTS, TOTAL: STORY_TOTAL, FLASH_AT: STORY_FLASH, XFADE: STORY_XFADE,
  layersAt: storyLayersAt, dofAt: storyDofAt, kickCam: storyKickCam, KICKS: STORY_KICKS, JUMP_EVENTS: [],
};
try {
  if (PROJECT.storyboard) {
    if (!PROJECT.words) throw new Error("project has storyboard.json but no words.json");
    RT = buildStoryboard(PROJECT.storyboard as Storyboard, PROJECT.words as Wd[]);
  }
} catch (e) {
  (window as unknown as Record<string, unknown>).BUILD_ERROR = e instanceof Error ? e.message : String(e);
  // Structural snapshot for `fableon diff`; never called during normal renders. It walks the same layers and
// world.update path as renderFrame but captures stage/pose state instead of drawing pixels.
(window as unknown as Record<string, unknown>).DEBUG_STATE = (f: number) => {
  const layers = RT.layersAt(f);
  const d = RT.dofAt(f);
  const states = layers.map((l) => {
    const shot = RT.SHOTS[l.id - 1];
    return { id: l.id, alpha: l.alpha, ...world.debugState(shot, f, cam, scene, H, RT.kickCam) };
  });
  const last = states[states.length - 1] ?? {};
  return { frame: f, layers, dof: { cInf: d.cInf, focus: d.focus ? d.focus(f) : null }, states, ...last };
};
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
scene.add(world.root);
noInkFallback(world.root);

const makeBloom = () => {
  const b = new BloomEffect({ blendFunction: BlendFunction.ADD, intensity: 0.5, luminanceThreshold: 1.0, luminanceSmoothing: 0.2, mipmapBlur: true, levels: 6, radius: 0.6 });
  const mip = b.mipmapBlurPass, setSize = mip.setSize.bind(mip);
  mip.setSize = (w: number, h: number) => setSize(Math.round((960 * w) / Math.max(h, 1)), 960);
  return b;
};
const composer = new EffectComposer(renderer, { multisampling: MS, frameBufferType: THREE.HalfFloatType });
const ink = new InkPass(scene, cam);
const lens = new LensBlur({ maxCoC: 24, nearScale: 1.2 });
const grade = new GradeEffect(GRADES.day, 1);
const preP = new EffectPass(cam, lens.pre), mainP = new EffectPass(cam, lens.main);
composer.addPass(new RenderPass(scene, cam));
if (!OFF.has("ink")) composer.addPass(ink);
if (!OFF.has("lens")) { composer.addPass(preP); composer.addPass(mainP); }
composer.addPass(new EffectPass(cam, ...(OFF.has("bloom") ? [] : [makeBloom()]), new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }), ...(OFF.has("grade") ? [] : [grade])));
// MSAA is the costliest part on the CPU renderer (~3 s/frame at 2K): without it, SMAA on the final image smooths the
// card cut-outs and remaining geometry edges (the world ink lines are already anti-aliased by the ink pass)
if (MS === 0 && !OFF.has("smaa")) { const smaa = new SMAAEffect({ preset: SMAAPreset.HIGH, edgeDetectionMode: EdgeDetectionMode.COLOR }); composer.addPass(new EffectPass(cam, smaa)); }
composer.setSize(W, H);

const out = document.createElement("canvas"); out.width = W; out.height = H;
const g2 = out.getContext("2d")!;
const fwd = new THREE.Vector3(), fpt = new THREE.Vector3();

const PROF: Record<string, number> = {};
(window as unknown as Record<string, unknown>).PROF = PROF;
const drawShot = (id: number, f: number) => {
  const s = RT.SHOTS[id - 1];
  let t0 = performance.now();
  const target = world.update(s, f, cam, scene, H, RT.kickCam);
  PROF.update = performance.now() - t0; t0 = performance.now();
  noInkFallback(world.root);
  const d = RT.dofAt(f);
  cam.getWorldDirection(fwd);
  if (d.focus) fpt.set(...d.focus(f)); else fpt.copy(target);
  lens.focus = Math.max(0.3, fpt.sub(cam.position).dot(fwd));
  lens.cInf = d.cInf;
  // the lens passes cost a lot on the CPU renderer: skip them on sharp shots
  preP.enabled = mainP.enabled = d.cInf > 0.25;
  gradeFor(grade, s.light);
  composer.render();
  { const gl = renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); }
  PROF.render = performance.now() - t0;
};

(window as unknown as Record<string, unknown>).TOTAL = RT.TOTAL;
(window as unknown as Record<string, unknown>).renderFrame = (f: number, quality = 0.94) => {
  const layers = RT.layersAt(f);
  g2.globalAlpha = 1;
  layers.forEach((l, i) => {
    drawShot(l.id, f);
    const t2 = performance.now();
    g2.globalAlpha = i ? l.alpha : 1;
    g2.drawImage(renderer.domElement, 0, 0);
    PROF.blit = performance.now() - t2;
  });
  const flash = f >= RT.FLASH_AT && f < RT.FLASH_AT + 4 ? [1, 0.75, 0.45, 0.2][f - RT.FLASH_AT] : 0;
  if (flash > 0) { g2.globalAlpha = flash; g2.fillStyle = "#ffffff"; g2.fillRect(0, 0, W, H); }
  g2.globalAlpha = 1;
  const t1 = performance.now();
  const url = out.toDataURL("image/jpeg", quality);
  PROF.encode = performance.now() - t1;
  return url;
};
(window as unknown as Record<string, unknown>).shotOf = (f: number) => RT.layersAt(f).map((l) => l.id);
(window as unknown as Record<string, unknown>).SHOTLIST = RT.SHOTS.map((s) => [s.id, s.a, s.b, s.light, s.sets.join("+")]);
(window as unknown as Record<string, unknown>).QA = {
  shots: RT.SHOTS.map((s) => ({ id: s.id, a: s.a, b: s.b })), flash: [RT.FLASH_AT, RT.FLASH_AT + 4],
  xfade: RT.SHOTS.filter((s) => RT.XFADE[s.id]).map((s) => [s.a - RT.XFADE[s.id] / 2, s.a + RT.XFADE[s.id] / 2]),
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
// Structural snapshot for `fableon diff`; never called during normal renders. It walks the same layers and
// world.update path as renderFrame but captures stage/pose state instead of drawing pixels.
(window as unknown as Record<string, unknown>).DEBUG_STATE = (f: number) => {
  const layers = RT.layersAt(f);
  const d = RT.dofAt(f);
  const states = layers.map((l) => {
    const shot = RT.SHOTS[l.id - 1];
    return { id: l.id, alpha: l.alpha, ...world.debugState(shot, f, cam, scene, H, RT.kickCam) };
  });
  const last = states[states.length - 1] ?? {};
  return { frame: f, layers, dof: { cInf: d.cInf, focus: d.focus ? d.focus(f) : null }, states, ...last };
};
(window as unknown as Record<string, unknown>).ready = true;
