#!/bin/bash
# concat the per-shot clips in shot order and mux the final mix (-map 0:v:0 -map 1:a:0)
# usage: engine/scripts/assemble.sh <project_dir>   (expects <project>/shots.json, <project>/render/seg_XX.mp4, <project>/audio/mix.wav)
set -e
P="$(cd "$1" && pwd)"
python3 -c "
import json; L=json.load(open('$P/shots.json'))
open('$P/render/concat.txt','w').write(''.join(f\"file 'seg_{i:02d}.mp4'\\n\" for i, *_ in L))"
ffmpeg -y -v error -f concat -safe 0 -i "$P/render/concat.txt" -c copy "$P/render/video_noaudio.mp4"
ffmpeg -y -v error -i "$P/render/video_noaudio.mp4" -i "$P/audio/mix.wav" -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 320k -ar 48000 -movflags +faststart -shortest "$P/final.mp4"
ffprobe -v error -show_entries stream=codec_name,width,height,nb_frames,r_frame_rate:format=duration -of compact "$P/final.mp4"
