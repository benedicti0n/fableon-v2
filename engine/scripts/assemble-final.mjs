// Assemble the final video from cached shot/transition pieces with frame-exact trims.
// usage: node engine/scripts/assemble-final.mjs --project <dir> --pieces <json> --audio <wav> --out <mp4>
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const project = resolve(arg('--project') ?? '.');
const piecesFile = arg('--pieces');
const audio = resolve(arg('--audio') ?? `${project}/audio/mix.wav`);
const out = resolve(arg('--out') ?? `${project}/final.mp4`);
if (!piecesFile) { console.error('assemble-final: missing --pieces'); process.exit(1); }
const pieces = JSON.parse(readFileSync(piecesFile, 'utf8'));
if (!pieces.length) { console.error('assemble-final: no pieces'); process.exit(1); }

const inputs = [];
const filters = [];
pieces.forEach((p, i) => {
  inputs.push('-i', p.file);
  filters.push(`[${i}:v]trim=start_frame=${Math.max(0, p.start)}:end_frame=${Math.max(1, p.end)},setpts=PTS-STARTPTS[v${i}]`);
});
const audioIndex = pieces.length;
filters.push(`${pieces.map((_, i) => `[v${i}]`).join('')}concat=n=${pieces.length}:v=1:a=0[vout]`);
const ff = [
  '-y', '-v', 'error', ...inputs,
  '-i', audio,
  '-filter_complex', filters.join(';'),
  '-map', '[vout]', '-map', `${audioIndex}:a:0`,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-pix_fmt', 'yuv420p', '-r', '30',
  '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
  '-c:a', 'aac', '-b:a', '320k', '-ar', '48000',
  '-movflags', '+faststart', '-shortest', out,
];
const r = spawnSync('ffmpeg', ff, { stdio: 'inherit' });
if (r.error) { console.error(`assemble-final: ${r.error.message}`); process.exit(1); }
process.exit(r.status ?? 1);
