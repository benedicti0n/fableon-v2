# Round-2 delivery auditions — Savitri (Hindi)

Sample excerpt (with delivery marks):

- **hook** राजकुमारी ने मौत को बहस में हरा दिया।
  - gloss: A princess argued Death into a corner.
  - delivery: {"tone":"deadpan","pauseBefore":0.4,"emphasis":["मौत"]}
- **setting** सावित्री ने पति खुद चुना, नारद ने एक ही कमी बताई।
  - gloss: Savitri chose her own husband; Narada named the one defect.
  - delivery: {"tone":"matter-of-fact","pauseBefore":0.25,"emphasis":["एक"]}
- **action** सत्यवान साल भर में मरने वाला था, फिर भी उसने हाँ कह दी।
  - gloss: Satyavan was going to die within a year, and she still said yes.
  - delivery: {"tone":"warm","pauseBefore":0.3,"emphasis":["हाँ"]}
- **deadpan** अच्छी खबर: यम ने कोई भी वरदान माँगने दिया।
  - gloss: Good news: Yama let her ask for any boon.
  - delivery: {"tone":"deadpan","pauseBefore":0.5,"pauses":[{"after":"खबर","s":0.25}],"emphasis":["कोई भी"]}
- **deadpan** बुरी खबर: उसने अपने पति की जान नहीं माँगी।
  - gloss: Bad news: she did not ask for her husband’s life.
  - delivery: {"tone":"deadpan","pauseBefore":0.5,"pauses":[{"after":"खबर","s":0.25}],"emphasis":["जान"]}
- **twist** यम ने सौ बेटों का वरदान दिया, भूल गया कि बेटों को बाप चाहिए।
  - gloss: Yama granted a hundred sons, forgetting they need a father.
  - delivery: {"tone":"mock-serious","pauseBefore":0.4,"emphasis":["बाप"]}

Variants: **default** = normal tone settings; **expressive** = stability 0.25 / style 0.35; **clean** = Callum × v3 with no delivery marks (control).
Pauses before punchlines are inserted locally for exact timing; in-line pauses use the model tag/break. Emphasis is an ellipsis (v3) or 0.12 s break (v2).

| file | voice | model | variant | characters | cost | duration |
|---|---|---|---|---:|---:|---:|
| eleven-multilingual-v2__callum__default.mp3 | Callum | eleven_multilingual_v2 | default | 584 | $0.0467 | 32.44 s |
| eleven-multilingual-v2__callum__expressive.mp3 | Callum | eleven_multilingual_v2 | expressive | 584 | $0.0467 | 33.70 s |
| eleven-v3__callum__default.mp3 | Callum | eleven_v3 | default | 378 | $0.0302 | 32.43 s |
| eleven-v3__callum__expressive.mp3 | Callum | eleven_v3 | expressive | 378 | $0.0302 | 32.99 s |
| eleven-v3__george__default.mp3 | George | eleven_v3 | default | 378 | $0.0302 | 27.07 s |
| eleven-v3__george__expressive.mp3 | George | eleven_v3 | expressive | 378 | $0.0302 | 26.43 s |
| eleven-v3__callum__clean.mp3 | Callum | eleven_v3 | clean | 285 | $0.0228 | 25.20 s |

Total: 7 takes, 2965 characters, $0.2372.

Listen to the round2 mp3s and choose voice + model + variant. Do not commit the mp3s.
