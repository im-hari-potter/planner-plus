// (v3.6.1) Paints a pretend screenshot of a casket's reward window for the tests, the way the client draws it (see
// cluereader.js): the game's scene, the window's scroll behind its slots (its model, if_trail_scroll: the same
// pixels each time; scroll: false leaves the scene behind them), each reward's icon in its slot of the 3 by 2 grid,
// and stack numbers in the p11 font, black one pixel down and right, then yellow. Things in the inventory too, if
// asked, to be left alone.
import { readFileSync } from 'node:fs';
import { decodePng } from './testpng.mjs';
import { CLUE_READ, PUZZLES } from './cluedata.js';
import { drawString } from './bankfake.mjs';

export const clueAtlas = decodePng(readFileSync(new URL('./clueicons.png', import.meta.url)));
// (v3.6.2) the puzzle boxes' pieces: a row a picture (b, c, d), pieces 1 to 24 across
export const puzzleAtlas = decodePng(readFileSync(new URL('./puzzles.png', import.meta.url)));

// items: [{ icon (a CLUE_READ.icons slug), count, stack }] in the window's slots in order; x, y: its first slot
// (the game canvas has it at 243, 93); inventory: [{ slot, icon, count }] in the side panel's grid at 569, 213
export function fakeReward({ items, width = 765, height = 503, x = CLUE_READ.window.x, y = CLUE_READ.window.y, inventory = [], brightness = 1, seed = 1, scroll = true }) {
  const img = { width, height, data: Buffer.alloc(width * height * 4) };
  const set = (px, py, c) => {
    if (px < 0 || py < 0 || px >= width || py >= height) return;
    const p = (py * width + px) * 4;
    img.data[p] = c >> 16; img.data[p + 1] = (c >> 8) & 255; img.data[p + 2] = c & 255; img.data[p + 3] = 255;
  };
  // a grassy scene, a little uneven, and the side panel's stone
  let r = seed;
  const rnd = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r; };
  for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
    if (px >= 553) set(px, py, (px * 3 + py) % 11 ? 0x3e3529 : 0x4a4035);
    else set(px, py, [0x3f6b23, 0x46752a, 0x385f1f, 0x4d7a30][rnd() % 4]);
  }
  const curve = c => (brightness === 1 ? c : Math.round(256 * Math.pow(c / 256, brightness)));
  const bent = c => (curve(c >> 16) << 16) | (curve((c >> 8) & 255) << 8) | curve(c & 255);
  if (items.length && scroll) {
    for (let py = y - 22; py < y + 64 + 34; py++) for (let px = x - 26; px < x + 96 + 26; px++) set(px, py, bent([0xc7b28a, 0xbfa97f, 0xcdb994][(px * 7 + py * 13) % 3]));
  }
  const paint = (icon, sx, sy, count, stack) => {
    const n = CLUE_READ.icons.findIndex(e => e.slug === icon);
    if (n < 0) throw new Error(`no icon ${icon}`);
    const ox = (n % CLUE_READ.perRow) * 32, oy = Math.floor(n / CLUE_READ.perRow) * 32;
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
      const p = ((oy + j) * clueAtlas.width + ox + i) * 4;
      if (!clueAtlas.data[p + 3]) continue;
      let c = (clueAtlas.data[p] << 16) | (clueAtlas.data[p + 1] << 8) | clueAtlas.data[p + 2];
      if (c !== 1 && c !== 0x302020) c = (curve(c >> 16) << 16) | (curve((c >> 8) & 255) << 8) | curve(c & 255);
      set(sx + i, sy + j, c);
    }
    if (count !== 1 || stack) {
      drawString(String(count), sx + 1, sy + 10, 0x000000, set, null);
      drawString(String(count), sx, sy + 9, 0xffff00, set, null);
    }
  };
  items.forEach((it, k) => paint(it.icon, x + (k % 3) * 32, y + Math.floor(k / 3) * 32, it.count ?? 1, it.stack));
  for (const it of inventory) paint(it.icon, 569 + (it.slot % 4) * 42, 213 + Math.floor(it.slot / 4) * 36, it.count ?? 1, it.stack);
  return img;
}

// (v3.6.2) A pretend screenshot of a puzzle box's puzzle (trail_puzzle.if): the scene, the box's back behind the grid,
// and each piece (cells: 25, a piece 1 to 24 or 0 for the gap) in its slot of 5 by 5, 32 pixels and 5 apart; x, y its
// first slot (175, 58 on the canvas). cover: slots something's in front of (a square of the scene's colours).
export function fakePuzzle({ letter = 'b', cells, width = 765, height = 503, x = PUZZLES.window.x, y = PUZZLES.window.y, brightness = 1, seed = 1, cover = [], inventory = [] }) {
  const img = fakeReward({ items: [], width, height, brightness, seed, inventory });
  const set = (px, py, c) => {
    if (px < 0 || py < 0 || px >= width || py >= height) return;
    const p = (py * width + px) * 4;
    img.data[p] = c >> 16; img.data[p + 1] = (c >> 8) & 255; img.data[p + 2] = c & 255; img.data[p + 3] = 255;
  };
  const curve = c => (brightness === 1 ? c : Math.round(256 * Math.pow(c / 256, brightness)));
  const bent = c => (curve(c >> 16) << 16) | (curve((c >> 8) & 255) << 8) | curve(c & 255);
  const { pitchX, pitchY } = PUZZLES.window;
  for (let py = y - 16; py < y + 4 * pitchY + 32 + 16; py++) for (let px = x - 16; px < x + 4 * pitchX + 32 + 16; px++) set(px, py, bent([0x5a3d22, 0x4f351d, 0x634428][(px * 5 + py * 11) % 3]));
  const row = ['b', 'c', 'd'].indexOf(letter);
  cells.forEach((piece, at) => {
    if (!piece) return;
    const sx = x + (at % 5) * pitchX, sy = y + Math.floor(at / 5) * pitchY;
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
      const p = ((row * 32 + j) * puzzleAtlas.width + (piece - 1) * 32 + i) * 4;
      if (!puzzleAtlas.data[p + 3]) continue;
      let c = (puzzleAtlas.data[p] << 16) | (puzzleAtlas.data[p + 1] << 8) | puzzleAtlas.data[p + 2];
      if (c !== 1 && c !== 0x302020) c = bent(c);
      set(sx + i, sy + j, c);
    }
  });
  for (const at of cover) {
    const sx = x + (at % 5) * pitchX, sy = y + Math.floor(at / 5) * pitchY;
    for (let j = 4; j < 36; j++) for (let i = 4; i < 36; i++) set(sx + i - 4, sy + j - 4, 0xeeeeee);
  }
  return img;
}
