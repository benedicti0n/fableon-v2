// Deterministic framing solver: semantic camera key + measured subjects + keep-out volumes -> v1 camera key.
// Rules and constants are documented in docs/AUTHORING.md.
const DEG = Math.PI / 180;
import { BANDS } from './composition.js';
export const ASPECT = 9 / 16;

export const SIZE = {
  close: { fov: 37, span: "close", rate: 0.003, dof: 13, eyeLine: 0.4 },
  medium: { fov: 39, span: "medium", rate: 0.0025, dof: 11, eyeLine: 0.4 },
  full: { fov: 41, span: "full", rate: 0.0022, dof: 8, eyeLine: 0.5 },
  wide: { fov: 45, span: "wide", rate: 0.002, dof: 0, eyeLine: 0.5 },
  establishing: { fov: 48, span: "establishing", rate: 0.0018, dof: 0, eyeLine: 0.5 },
  insert: { fov: 35, span: "insert", rate: 0.0025, dof: 11, eyeLine: 0.5 },
};

export const fovH = (vfov, aspect = ASPECT) => (2 * Math.atan(Math.tan((vfov * DEG) / 2) * aspect)) / DEG;
export const fitDistance = (spanV, spanH, vfov, aspect = ASPECT) => Math.max(
  spanV / (2 * Math.tan((vfov * DEG) / 2)),
  spanH / (2 * Math.tan((fovH(vfov, aspect) * DEG) / 2)),
  0.5,
);

const pointInside = (p, v) => v.kind === "box"
  ? p[0] >= v.min[0] && p[0] <= v.max[0] && p[1] >= v.min[1] && p[1] <= v.max[1] && p[2] >= v.min[2] && p[2] <= v.max[2]
  : p[1] >= v.y0 && p[1] <= v.y1 && (p[0] - v.x) ** 2 + (p[2] - v.z) ** 2 <= v.r ** 2;

export const insideKeepout = (p, keepout) => (keepout ?? []).find((v) => pointInside(p, v)) ?? null;

export function blocked(from, to, keepout) {
  for (let i = 1; i < 50; i++) {
    const t = i / 50, p = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t];
    const v = insideKeepout(p, keepout);
    if (v && !pointInside(to, v)) return v;
  }
  return null;
}

const subjBox = (s) => {
  const m = s.measure, scale = s.scale ?? 1, h = (s.seated ? m.seated : m.standing) * scale, half = m.halfWidth * scale;
  const ps = s.samples?.length ? s.samples : [s.pos];
  const y0 = Math.min(...ps.map((p) => p[1])), y1 = Math.max(...ps.map((p) => p[1])) + h;
  return {
    h, half, y: y0, eye: ps[0][1] + (s.seated ? m.eyeSeated : m.eye) * scale,
    x0: Math.min(...ps.map((p) => p[0])) - half, x1: Math.max(...ps.map((p) => p[0])) + half,
    z0: Math.min(...ps.map((p) => p[2])) - half, z1: Math.max(...ps.map((p) => p[2])) + half, y0, y1,
  };
};

const unionBox = (subjects) => {
  const boxes = subjects.map(subjBox);
  return {
    x0: Math.min(...boxes.map((b) => b.x0)), x1: Math.max(...boxes.map((b) => b.x1)),
    y0: Math.min(...boxes.map((b) => b.y0)), y1: Math.max(...boxes.map((b) => b.y1)),
    z0: Math.min(...boxes.map((b) => b.z0)), z1: Math.max(...boxes.map((b) => b.z1)),
  };
};

const sideOffset = { front: 0, left: -30, right: 30, frontLeft: -15, frontRight: 15 };

export function solveCamera({ key, subjects, setInfo, keepout = [], aspect = ASPECT, over = null, toLook = null, context = [] }) {
  const size = key.size ?? "medium";
  const cfg = SIZE[size];
  if (!cfg) throw new Error(`unknown camera size "${size}"`);
  if (!subjects.length && size !== "establishing") throw new Error(`camera on "${key.at}" has no subjects`);
  const vfov0 = key.fov ?? cfg.fov;
  const primary = subjects[0];
  const pb = primary ? subjBox(primary) : null;
  const band = BANDS[size] ?? BANDS.medium;
  const targetMetric = (band.min + band.max) / 2;
  const metricWorld = primary ? (band.metric === 'head' ? primary.measure.head : primary.measure.standing) * (primary.scale ?? 1) : 1;
  const targetDistance = metricWorld / (2 * targetMetric * Math.tan((vfov0 * DEG) / 2));
  const ob = over ? subjBox(over) : null;
  const box = subjects.length ? unionBox(subjects) : null;
  const target = size === "establishing"
    ? [(setInfo.bounds.min[0] + setInfo.bounds.max[0]) / 2, (setInfo.bounds.min[1] + setInfo.bounds.max[1]) / 2, (setInfo.bounds.min[2] + setInfo.bounds.max[2]) / 2]
    : size === "wide"
      ? [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, (box.z0 + box.z1) / 2]
      : [primary.kind === 'mark' ? primary.pos[0] : (pb.x0 + pb.x1) / 2, primary.kind === 'mark' ? primary.pos[1] : pb.eye, primary.kind === 'mark' ? primary.pos[2] : (pb.z0 + pb.z1) / 2];
  let spanV, spanH;
  if (size === "establishing") { spanV = setInfo.bounds.max[1] - setInfo.bounds.min[1]; spanH = setInfo.bounds.max[0] - setInfo.bounds.min[0]; }
  else if (size === "insert") { spanV = 0.8; spanH = 0.8; }
  else { spanV = 2 * targetDistance * Math.tan((vfov0 * DEG) / 2); spanH = spanV * aspect; }
  const baseAngle = (primary?.view ?? setInfo.front ?? 0) + (sideOffset[key.side ?? "front"] ?? 0);
  const angleY = key.angle ?? "eye";
  const eyeY = primary ? (primary.kind === 'mark' ? primary.pos[1] : pb.eye) : target[1];
  const waistY = primary ? primary.pos[1] + 0.45 * pb.h : target[1];
  const highY = primary ? primary.pos[1] + Math.max(2.5, Math.min(4, 0.8 * pb.h)) : target[1] + 3;
  const overheadY = primary ? primary.pos[1] + 8 : target[1] + 8;
  const camY = angleY === "low" ? waistY : angleY === "high" ? highY : angleY === "overhead" ? overheadY : eyeY;
  let vfov = vfov0, distance = size === 'establishing' ? fitDistance(spanV * 1.1, spanH * 1.1, vfov, aspect) : targetDistance * 1.03;
  if (size !== 'establishing' && subjects.length) {
    const b = unionBox(subjects);
    const width = Math.max(b.x1 - b.x0, b.z1 - b.z0);
    const groupDist = width / (2 * Math.tan((vfov * DEG) / 2) * aspect);
    if (groupDist > distance) distance = groupDist;
    const metricNow = metricWorld / (2 * distance * Math.tan((vfov * DEG) / 2));
    if (metricNow < band.floor) throw new Error(`group too wide for a vertical frame (${width.toFixed(2)} m); fix: split into keys, use pan, curve the row or reduce spacing`);
  }
  if (context.length && primary) {
    const pb0 = subjBox(primary);
    const cx = (pb0.x0 + pb0.x1) / 2, cz = (pb0.z0 + pb0.z1) / 2;
    const rx = Math.cos((baseAngle * Math.PI) / 180), rz = -Math.sin((baseAngle * Math.PI) / 180);
    let need = distance;
    for (const c of context) {
      const cb = subjBox(c);
      // Context behind the subject is already inside the frame; only the lateral (screen-right) offset
      // needs a wider camera. Treating x/z offsets as lateral made a forest fire 38 m behind its
      // subject look impossible to frame.
      const dx = (cb.x0 + cb.x1) / 2 - cx, dz = (cb.z0 + cb.z1) / 2 - cz;
      const lateral = Math.abs(dx * rx + dz * rz);
      need = Math.max(need, lateral / (Math.tan((vfov * DEG) / 2) * aspect));
    }
    if (need > distance) {
      distance = need;
      const metricNow = metricWorld / (2 * distance * Math.tan((vfov * DEG) / 2));
      if (metricNow < band.floor) throw new Error(`cannot frame ${context.map((c) => c.id).join('+')} at size ${size}; fix: choose a wider size or split the key`);
    }
  }
  let yawOffset = 0, raised = 0, closer = false;
  const lookBase = () => {
    const ly = size === 'insert' && primary?.kind === 'mark' ? primary.pos[1] : size === "close" || size === "medium" ? (primary ? pb.eye - (0.5 - cfg.eyeLine) * spanV : target[1]) : size === "full" ? (primary ? primary.pos[1] + 0.5 * pb.h : target[1]) : target[1];
    return [target[0], ly, target[2]];
  };
  const cameraAt = (yaw, dist, y) => {
    const a = (baseAngle + yaw) * DEG;
    const horiz = angleY === "overhead" ? Math.max(1.2, dist * 0.15) : angleY === "high" ? dist * 0.8 : dist;
    return [target[0] + Math.sin(a) * horiz, y, target[2] + Math.cos(a) * horiz];
  };
  const checks = () => {
    if (!subjects.length) return true;
    return subjects.every((s) => {
      const b = subjBox(s), ps = s.samples?.length ? s.samples : [s.pos];
      return ps.every((p) => {
        const head = [p[0], p[1] + b.h, p[2]], chest = [p[0], p[1] + 0.65 * b.h, p[2]];
        return !blocked(camera, head, keepout) && !blocked(camera, chest, keepout);
      });
    });
  };
  let camera = cameraAt(0, distance, camY);
  let overBox = null;
  if (over && primary) {
    let dx = over.pos[0] - primary.pos[0], dz = over.pos[2] - primary.pos[2];
    let sep = Math.hypot(dx, dz);
    if (sep < 0.01) { const a = baseAngle * DEG; dx = Math.sin(a); dz = Math.cos(a); sep = 1; }
    dx /= sep; dz /= sep;
    const overHead = (over.measure.head ?? 0.4) * (over.scale ?? 1);
    const tanOver = (metricWorld / targetMetric - overHead / 0.24) / (2 * sep);
    if (tanOver > 0.02) {
      vfov = (2 * Math.atan(tanOver)) / DEG;
      const dOver = overHead / (2 * 0.24 * tanOver), dPrim = dOver + sep;
      const u = key.side === 'left' ? 0.2 : 0.8;
      const right = [-dz, 0, dx];
      const shift = (u - 0.5) * 2 * dOver * tanOver * aspect;
      const baseCam = [(pb.x0 + pb.x1) / 2 + dx * dPrim + right[0] * shift, 0, (pb.z0 + pb.z1) / 2 + dz * dPrim + right[2] * shift];
      const look = lookBase();
      let best = null;
      for (let y = -0.3; y <= 2.5; y += 0.1) {
        const cc = [baseCam[0], over.pos[1] + ob.h + y, baseCam[2]];
        const f = [look[0] - cc[0], look[1] - cc[1], look[2] - cc[2]]; const fl = Math.hypot(...f) || 1; f[0] /= fl; f[1] /= fl; f[2] /= fl;
        const rr = [-f[2], 0, f[0]]; const rl = Math.hypot(...rr) || 1; rr[0] /= rl; rr[2] /= rl;
        const up2 = [rr[1] * f[2] - rr[2] * f[1], rr[2] * f[0] - rr[0] * f[2], rr[0] * f[1] - rr[1] * f[0]];
        const project = (pnt) => { const v = [pnt[0] - cc[0], pnt[1] - cc[1], pnt[2] - cc[2]]; const zc = v[0] * f[0] + v[1] * f[1] + v[2] * f[2]; if (zc <= 0) return null; const x = v[0] * rr[0] + v[1] * rr[1] + v[2] * rr[2], yv = v[0] * up2[0] + v[1] * up2[1] + v[2] * up2[2]; return { x: (x / zc / (tanOver * aspect) + 1) / 2, y: (1 - yv / zc / tanOver) / 2 }; };
        const top = project([over.pos[0], over.pos[1] + (over.seated ? over.measure.seated : over.measure.standing) * (over.scale ?? 1), over.pos[2]]);
        const chin = project([over.pos[0], over.pos[1] + (over.seated ? over.measure.seated : over.measure.standing) * (over.scale ?? 1) - overHead, over.pos[2]]);
        if (!top || !chin) continue;
        const center = (top.y + chin.y) / 2, bad = Math.abs(center - 0.74) + (top.x < 0 || top.x > 1 ? 1 : 0);
        if (!best || bad < best.bad) best = { bad, cc, top, chin, center };
      }
      camera = best?.cc ?? [baseCam[0], over.pos[1] + ob.h + 0.4, baseCam[2]];
      overBox = best ? { top: best.top, chin: best.chin, center: best.center } : null;
    } else {
      const camDist = Math.max(distance, sep + 0.9);
      camera = [(pb.x0 + pb.x1) / 2 + dx * camDist, over.pos[1] + ob.h + 0.2, (pb.z0 + pb.z1) / 2 + dz * camDist];
    }
  }
  let attempts = 0;
  const trySpot = (yaw, dist, y, fov) => {
    attempts++;
    camera = cameraAt(yaw, dist, y);
    vfov = fov; distance = dist;
    return !insideKeepout(camera, keepout) && checks();
  };
  // The over composition is solved geometrically; do not replace it with the generic fallback just because a
  // keep-out ray grazes a trunk. The measured blocker check reports real occluders afterwards.
  const startOk = over ? !insideKeepout(camera, keepout) : trySpot(0, distance, camY, vfov);
  if (!startOk) {
    let ok = false;
    for (const yaw of [15, -15, 30, -30]) if (!ok) { yawOffset = yaw; ok = trySpot(yaw, distance, camY, vfov); }
    if (!ok) { yawOffset = 0; raised = 1; ok = trySpot(0, distance, camY + 1, vfov); }
    if (!ok) {
      closer = true;
      const d2 = distance * 0.85, f2 = (2 * Math.atan(Math.tan((vfov * DEG) / 2) / 0.85)) / DEG;
      ok = trySpot(0, d2, camY + 1, f2);
    }
    if (!ok) throw new Error(`no clear view of ${subjects.map((s) => s.id).join('+')} at ${key.at}`);
  }
  const look = lookBase();
  if (over && primary) {
    // Two-plane rule: the over actor sits in one lower third; put the primary subject in the upper part of the
    // opposite side. Shift the look point laterally until the primary lands on that side.
    const desired = key.side === 'left' ? 0.80 : 0.20;
    const projectU = (p) => {
      const f = [look[0] - camera[0], look[1] - camera[1], look[2] - camera[2]];
      const fl = Math.hypot(...f) || 1; f[0] /= fl; f[1] /= fl; f[2] /= fl;
      const right = [-f[2], 0, f[0]], rl = Math.hypot(...right) || 1; right[0] /= rl; right[2] /= rl;
      const v = [p[0] - camera[0], p[1] - camera[1], p[2] - camera[2]];
      const z = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
      if (z <= 0) return 0.5;
      const x = v[0] * right[0] + v[1] * right[1] + v[2] * right[2];
      return 0.5 + x / z / (2 * Math.tan((vfov * DEG) / 2) * aspect);
    };
    const p = [target[0], pb.eye, target[2]];
    for (let i = 0; i < 4; i++) {
      const u = projectU(p); if (Math.abs(u - desired) < 0.01) break;
      const f = [look[0] - camera[0], 0, look[2] - camera[2]], fl = Math.hypot(f[0], f[2]) || 1;
      const right = [-f[2] / fl, 0, f[0] / fl];
      const span = 2 * Math.hypot(p[0] - camera[0], p[2] - camera[2]) * Math.tan((vfov * DEG) / 2) * aspect;
      const shift = -(desired - u) * span;
      look[0] += right[0] * shift; look[2] += right[2] * shift;
    }
  }
  if (key.third) {
    const f = [look[0] - camera[0], 0, look[2] - camera[2]], fl = Math.hypot(f[0], f[2]) || 1;
    const right = [-f[2] / fl, 0, f[0] / fl], shift = (key.third === 'left' ? 1 : -1) * spanH / 6;
    look[0] += right[0] * shift; look[2] += right[2] * shift;
  }
  // projected eye-line fraction, useful in tests and reports
  const fwd = [look[0] - camera[0], look[1] - camera[1], look[2] - camera[2]];
  const fl = Math.hypot(...fwd) || 1; fwd[0] /= fl; fwd[1] /= fl; fwd[2] /= fl;
  const right = [-fwd[2], 0, fwd[0]]; const rl = Math.hypot(...right) || 1; right[0] /= rl; right[2] /= rl;
  const up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
  const eye = primary ? [primary.pos[0] - camera[0], pb.eye - camera[1], primary.pos[2] - camera[2]] : [0, 0, 0];
  const zc = eye[0] * fwd[0] + eye[1] * fwd[1] + eye[2] * fwd[2];
  const yc = eye[0] * up[0] + eye[1] * up[1] + eye[2] * up[2];
  const eyeLine = zc > 0 ? 0.5 - 0.5 * (yc / zc) / Math.tan((vfov * DEG) / 2) : 0.5;
  const move = key.move ?? "push";
  const rate = move === "hold" ? 0.0015 : cfg.rate;
  const type = move === "tiltUp" || move === "tiltDown" || move === "pan" ? "tilt" : "dolly";
  const push = move === "glide" || move === "crane"
    ? { from: key.at, rate: 0 }
    : { from: key.at, rate, ...(key.punch ? { punch: 0.006, punchAt: key.punch } : {}) };
  const out = {
    type, pos: camera, look, fov: vfov, roll: ((key.roll ?? 0) * DEG),
    push, subjects: subjects.map((s) => s.id),
    ...(over ? { over: over.id } : {}),
    ...(key.cut ? { cut: true } : {}),
    ...(move === "glide" || move === "crane" ? { dur: Math.round((key.glide ?? 0.8) * 30) } : {}),
    ...(type === "tilt" ? { lookTo: toLook ?? [look[0], look[1] + (move === "tiltUp" ? spanV : -spanV), look[2]], tiltDur: Math.round((key.glide ?? 1.2) * 30) } : {}),
  };
  return { key: out, debug: { attempts, yawOffset, raised, closer, eyeLine, distance, spanV, spanH, vfov, fovH: fovH(vfov, aspect), dof: cfg.dof, primary: primary?.id, primaryHeight: primary ? metricWorld / (2 * distance * Math.tan((vfov * DEG) / 2)) : null, over: overBox } };
}
