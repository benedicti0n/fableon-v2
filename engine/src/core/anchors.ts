// Word anchors on the narration timeline, parameterised by the project's words.json so the interpreter and story.ts
// cannot drift. Moved verbatim from story.ts.
export type Wd = { w: string; a: number; b: number; line: number };
export const norm = (s: string) => s.toLowerCase().replace(/[^a-z']/g, "");

export const makeAnchors = (words: Wd[], fps = 30, tailFrames = 36) => {
  /** frame where `word` (the nth such word) of script line `line` starts */
  const A = (line: number, word: string, nth = 0) => {
    const c = words.filter((w) => w.line === line && norm(w.w) === norm(word));
    if (!c[nth]) throw new Error(`no word ${line}:${word}`);
    return Math.max(0, Math.round(c[nth].a * fps));
  };
  const END = words.length ? Math.round(words[words.length - 1].b * fps) : 0;
  const TOTAL = END + tailFrames;
  /** cuts land 2 frames before the word */
  const K = (line: number, word: string, nth = 0) => Math.max(0, A(line, word, nth) - 2);
  const T = (f: number) => f / fps;
  return { A, K, END, TOTAL, T };
};
