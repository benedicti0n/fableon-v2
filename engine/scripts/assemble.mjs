// Concatenate the per-shot clips in shot order and mux the final mix (-map 0:v:0 -map 1:a:0).
// usage: node engine/scripts/assemble.mjs --project <dir>
//   expects <project>/shots.json, <project>/render/seg_XX.mp4, <project>/audio/mix.wav
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const i = args.indexOf('--project');
if (i < 0 || !args[i + 1]) { console.error('assemble.mjs: missing --project <dir>'); process.exit(1); }
const P = resolve(args[i + 1]);
const render = join(P, 'render');
mkdirSync(render, { recursive: true });
const shots = JSON.parse(readFileSync(join(P, 'shots.json'), 'utf8'));
writeFileSync(join(render, 'concat.txt'), shots.map(([id]) => `file 'seg_${String(id).padStart(2, '0')}.mp4'\n`).join(''));

const run = (cmd, argv) => {
  const r = spawnSync(cmd, argv, { stdio: 'inherit' });
  if (r.error) { console.error(`${cmd}: ${r.error.message}`); process.exit(1); }
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', join(render, 'concat.txt'), '-c', 'copy', join(render, 'video_noaudio.mp4')]);
run('ffmpeg', ['-y', '-v', 'error', '-i', join(render, 'video_noaudio.mp4'), '-i', join(P, 'audio', 'mix.wav'), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-movflags', '+faststart', '-shortest', join(P, 'final.mp4')]);
run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height,nb_frames,r_frame_rate:format=duration', '-of', 'compact', join(P, 'final.mp4')]);
