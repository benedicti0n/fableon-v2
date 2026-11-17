"""Measure the acceptance metrics of a mix: exact picture length and integrated loudness (BS.1770-4).
usage: python tests/audio_metrics.py <mix.wav>   -> JSON on stdout
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "audio"))
from dsp import SR, integrated, read_wav, true_peak  # noqa: E402

x, sr = read_wav(sys.argv[1])
print(json.dumps({"duration": round(x.shape[1] / sr, 4), "sample_rate": sr, "loudness": round(float(integrated(x)), 3), "true_peak": round(float(true_peak(x)), 3)}))
