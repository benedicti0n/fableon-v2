// Word anchors on the narration timeline, parameterised by the project's words.json. Moved verbatim from the legacy
// timeline; word matching uses the repo-wide Unicode normaliser.
import { normalizeWord } from "../../../shared/words.mjs";

export type Wd = { w: string; a: number; b: number; line: number };
export const norm = normalizeWord;

export const makeAnchors = (words: Wd[], fps = 30, tailFrames = 36) => {
  /** frame where `word` (the nth such word) of script line `line` starts */
  const A = (line: number, word: string, nth = 0) => {
    const c = words.filter((w) => w.line === line && norm(w.w) === norm(word));
    if (!c[nth]) throw new Error(`no word ${line}:${word}`);
    return Math.max(0, Math.round(c[nth].a * fps));
  };
  /** frame where the word at 0-based `index` of script line `line` starts (12:4 form) */
  const AW = (line: number, index: number) => {
    const c = words.filter((w) => w.line === line);
    if (!c[index]) throw new Error(`no word index ${line}:${index}`);
    return Math.max(0, Math.round(c[index].a * fps));
  };
  const END = words.length ? Math.round(words[words.length - 1].b * fps) : 0;
  const TOTAL = END + tailFrames;
  /** cuts land 2 frames before the word */
  const K = (line: number, word: string, nth = 0) => Math.max(0, A(line, word, nth) - 2);
  const T = (f: number) => f / fps;
  return { A, AW, K, END, TOTAL, T };
};
