# Voice QA

- file: `voice.wav`, 48000 Hz, 65.250 s
- -16.00 LUFS, true peak -3.41 dBTP, 0 clipped sample(s)
- bandwidth (99.9% energy): 14708 Hz
- lead-in 0.000 s, tail after last word 0.040 s
- digital silence (<-60 dBFS): 4.09 s (6.3%); 0 digital-zero runs
- perceptual pauses (<-45 dBFS): 10.35 s (15.9%), 19 pauses
- deliberate pauses (>=0.45 s): 3; guard violations: 0
- fragment-final pitch falls: 2; line-final falls (natural): 4

Verdict: PASS

- WARN: 2 natural intra-line pitch fall(s)
- WARN: perceptual pauses 15.9% (natural prosody; digital silence is 6.3%)
- WARN: bandwidth 14708 Hz is below 15 kHz

| pause | before | after | seconds | guard |
|---|---|---|---:|---|
| 1.02 | ने | अपना | 0.18 | ok |
| 5.38 | लिया | एकचक्र | 0.61 | ok |
| 7.71 | था | बकासुर | 0.14 | ok |
| 11.95 | था | गाँव | 0.21 | ok |
| 16.78 | थी | बुरी | 0.20 | ok |
| 22.83 | भेजूंगी | कुंती | 0.26 | ok |
| 25.69 | इसमें | दावत | 0.15 | ok |
| 27.88 | जाकर | राक्षस | 0.12 | ok |
| 30.23 | गया | बकासुर | 0.26 | ok |
| 36.27 | इंसान | आखिर | 0.15 | ok |
| 37.24 | कौन | दरअसल | 0.30 | ok |
| 39.80 | था | उसने | 0.12 | ok |
| 44.29 | दी | यह | 0.28 | ok |
| 50.10 | जाए | भीम | 0.64 | ok |
| 52.88 | को | घसीटकर | 0.20 | ok |
| 55.54 | दिया | सुबह | 0.13 | ok |
| 57.76 | गए | गाँव | 0.60 | ok |
| 59.12 | ने | खुशी | 0.27 | ok |
| 59.92 | से | त्योहार | 0.13 | ok |
