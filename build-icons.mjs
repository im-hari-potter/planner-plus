// The app's own icons, drawn from the game's sprites (LostCityRS/Content, branch 274). build-data.mjs
// runs this after the data; on its own, for the icons alone (the partyhat from the app's items-more.png):
//
//   node build-icons.mjs <Content checkout>
//
// slayer.webp: the game's own Slayer icon, a skull with a dagger through it. It's on the skills tab's
// second sheet (sprites/staticons2.png, after Runecraft's) in rev 274 already, though that skills tab
// only shows it from rev 377 on (Slayer came in 2005). Drawn the way the client draws it, like the other
// skills' icons: magenta is nothing, and black is the client's near black (1).
// tabicons.png (v3.2.1, v3.3): an icon for each tab, 26 x 24 at their own size (never scaled, so never
// blurry), in the frame of the game's own round side icon: the quest list's (sprites/sideicons.png #2),
// a light grey disc in a black ring that's heavier at the bottom right, its star painted out, and a
// symbol drawn on it here pixel by pixel (a magnifying glass, scales, an arrow, a trophy, a bar chart,
// a sword, a money bag, coins).
// gear.webp, rares.webp (v3.3): the Bank and Prices tabs' Gear and Rares buttons: the game's Worn
// Equipment side icon (sideicons #4) and a blue partyhat (its item icon), each cut to what's drawn.

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const sharp = createRequire(import.meta.url)('sharp');   // from NODE_PATH / a global install

// One cell of a sprite sheet, as RGBA: magenta and what's see-through are nothing (alpha 0).
async function cellOf(content, sheet, size, index, { nearBlack = false } = {}) {
  const cell = (await readFile(join(content, `sprites/meta/${sheet}.opt`), 'ascii')).trim();
  if (cell !== `${size}x${size}`) throw new Error(`sprites/${sheet}.png is in cells of ${cell} now, not ${size}x${size}`);
  const { data, info } = await sharp(join(content, `sprites/${sheet}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const perRow = info.width / size, sx = (index % perRow) * size, sy = Math.floor(index / perRow) * size;
  const px = Buffer.alloc(size * size * 4);
  let drawn = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const f = ((sy + y) * info.width + sx + x) * 4, t = (y * size + x) * 4;
    if (!data[f + 3] || (data[f] === 0xff && data[f + 1] === 0 && data[f + 2] === 0xff)) continue;
    // (the client draws black as its near black, 1: the skills' icons have that)
    px[t] = data[f]; px[t + 1] = data[f + 1]; px[t + 2] = nearBlack ? data[f + 2] || (data[f] || data[f + 1] ? 0 : 1) : data[f + 2]; px[t + 3] = 0xff;
    drawn++;
  }
  if (drawn < 30) throw new Error(`sprites/${sheet}.png: icon ${index} is empty`);
  return px;
}

// An RGBA picture cut to what's drawn in it.
function trim(px, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const W = x1 - x0 + 1, H = y1 - y0 + 1, out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) px.copy(out, y * W * 4, ((y0 + y) * w + x0) * 4, ((y0 + y) * w + x1 + 1) * 4);
  return { px: out, width: W, height: H };
}
const webp = ({ px, width, height }) => sharp(px, { raw: { width, height, channels: 4 } }).webp({ lossless: true }).toBuffer();

// The tab icons' symbols: 17 rows of 17, drawn at (6, 6) of the 30 x 30 frame; '.' leaves the frame.
const PAL = {
  K: [0, 1, 1], w: [255, 255, 255],
  l: [176, 216, 240], L: [104, 156, 206], B: [52, 96, 156],
  h: [150, 96, 40], H: [92, 54, 20],
  y: [248, 228, 110], g: [214, 176, 52], d: [140, 104, 12], Y: [255, 240, 150],
  r: [222, 44, 44], R: [130, 14, 14], p: [246, 112, 100],
  E: [140, 226, 112], G: [64, 178, 56], D: [20, 96, 20],
  s: [232, 232, 238], m: [160, 160, 170], M: [96, 96, 106],
  q: [110, 130, 255], b: [40, 64, 222], n: [18, 30, 128],
};
const SYMBOLS = {
  lookup: [
    '.................',
    '....KKKKK........',
    '..KKwwlllKK......',
    '..KwwlllllLK.....',
    '.KwlllllllLLK....',
    '.KwlllllllLLK....',
    '.KlllllllLLLK....',
    '.KllllllLLLLK....',
    '.KLlllLLLLLBK....',
    '..KLLLLLLLBK.....',
    '..KKBLLLLBKKK....',
    '....KKKKKKhhHK...',
    '..........KhhHK..',
    '...........KhhHK.',
    '............KhHK.',
    '.............KK..',
    '.................',
  ],
  compare: [
    '........K........',
    '.......KyK.......',
    '........d........',
    '.KKKKKKKyKKKKKKK.',
    '.KyyyyyyyyyyyyyK.',
    '.KKdKKKKgKKKKdKK.',
    '..K.K...g...K.K..',
    '.K...K..g..K...K.',
    'K.....K.g.K.....K',
    'KyyyyyK.g.KyyyyyK',
    '.KgggK..g..KgggK.',
    '..KKK...g...KKK..',
    '........g........',
    '.......KgK.......',
    '.....KKydgKK.....',
    '....KyyyggddK....',
    '.....KKKKKKK.....',
  ],
  gains: [
    '........K........',
    '.......KEK.......',
    '......KEEGK......',
    '.....KEEGGGK.....',
    '....KEEGGGGDK....',
    '...KEEGGGGGGDK...',
    '..KEEGGGGGGGGDK..',
    '..KKKKEGGGDKKKK..',
    '.....KEGGGDK.....',
    '.....KEGGGDK.....',
    '.....KEGGGDK.....',
    '.....KEGGGDK.....',
    '.....KEGGGDK.....',
    '.....KEGGDDK.....',
    '.....KKKKKKK.....',
    '.................',
    '.................',
  ],
  leaders: [
    '.................',
    '.................',
    '..KKKKKKKKKKKKK..',
    '.KKwyyyyyyyyggKK.',
    'K.KwyyyyyyyyggK.K',
    'K.KyyyyyyyyyggK.K',
    'K.KyyyyyyyyyggK.K',
    '.KKyyyyyyyyggdKK.',
    '..KKyyyyyyyggKK..',
    '...KKyyyyyggKK...',
    '.....KKyygKK.....',
    '.......KygK......',
    '.......KygK......',
    '......KyyggK.....',
    '....KKyyyggdKK...',
    '....KKKKKKKKKK...',
    '.................',
  ],
  // (the game's Stats side icon, its bar chart, in the round frame: red, green, blue)
  goals: [
    '.................',
    '.................',
    '..K....KKKK......',
    '..K....EEEEK.....',
    '..K....GGGDK.....',
    '..K....GGGDK.....',
    '..KKKKKGGGDK.....',
    '..KppppGGGDK.....',
    '..KrrrRGGGDKKKKK.',
    '..KrrrRGGGDqqqqK.',
    '..KrrrRGGGDbbbnK.',
    '..KrrrRGGGDbbbnK.',
    '..KrrrRGGGDbbbnK.',
    '..KrrrRGGGDbbbnK.',
    '..KKKKKKKKKKKKKK.',
    '.................',
    '.................',
  ],
  npcs: [
    '.................',
    '.............K...',
    '...........KKsK..',
    '..........KssmMK.',
    '.........KssmMK..',
    '........KssmMMK..',
    '...K...KssmMMK...',
    '..KdK.KssmMMK....',
    '.KygdKssmMMK.....',
    '..KygdsmMMK......',
    '...KygdMMK.......',
    '...KhhgdK........',
    '..KhhHygdK.......',
    '.KhhHKKygdK......',
    '.KhHK..KyK.......',
    '..KK....K........',
    '.................',
  ],
  bank: [
    '........K........',
    '.....KKKyKKK.....',
    '....KyyyyyggK....',
    '...KyyKKyKKdgK...',
    '...KygK.yK.KK....',
    '...KygKKyK.......',
    '....KyyyygKKK....',
    '.....KKKyyyggK...',
    '.......KyKKdgK...',
    '...KK..KyK.KdgK..',
    '...KygKKyKKKdgK..',
    '....KyyyygggdK...',
    '.....KKKgKKKK....',
    '........K........',
    '.................',
    '.................',
    '.................',
  ],
  // (two stacks of coins)
  prices: [
    '.................',
    '.................',
    '.................',
    '...KKKKK.........',
    '..KYyyyyK........',
    '..KdgggdK........',
    '..KYyyyyK.KKKKK..',
    '..KdgggdKKYyyyyK.',
    '..KYyyyyKKdgggdK.',
    '..KdgggdKKYyyyyK.',
    '..KYyyyyKKdgggdK.',
    '..KdgggdKKYyyyyK.',
    '..KYyyyyKKdgggdK.',
    '..KdgggdK.KKKKK..',
    '...KKKKK.........',
    '.................',
    '.................',
  ],
};
// (the sheet's order: the tabs')
const TAB_ORDER = ['lookup', 'compare', 'gains', 'leaders', 'goals', 'npcs', 'bank', 'prices'];

// partyhat: the blue partyhat's 32 x 32 item icon, RGBA.
export async function appIcons(content, { partyhat }) {
  const slayer = await cellOf(content, 'staticons2', 25, 1, { nearBlack: true });
  await writeFile('slayer.webp', await webp({ px: slayer, width: 25, height: 25 }));

  // The frame: the quest list's side icon, the black of its ring kept, the rest light grey.
  const F = 30, quest = await cellOf(content, 'sideicons', F, 2);
  const at = (x, y) => (y * F + x) * 4;
  const ring = i => quest[i + 3] && ((quest[i] === 0 && quest[i + 1] === 1 && quest[i + 2] === 1) || (quest[i] === 12 && quest[i + 1] === 11 && quest[i + 2] === 10));
  const frame = Buffer.alloc(F * F * 4);
  let rings = 0;
  for (let i = 0; i < F * F * 4; i += 4) {
    if (!quest[i + 3]) continue;
    if (ring(i)) { frame.set(quest.subarray(i, i + 4), i); rings++; } else frame.set([190, 192, 194, 255], i);
  }
  if (rings < 60) throw new Error('sprites/sideicons.png: icon 2 is no longer the quest list\'s round one');
  const draw = (name, rows) => {
    if (rows.length !== 17 || rows.some(r => r.length !== 17)) throw new Error(`tab icons: ${name} isn't 17 x 17`);
    const px = Buffer.from(frame);
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const i = at(6 + x, 6 + y);
      if (!frame[i + 3] || ring(i)) throw new Error(`tab icons: ${name} has a pixel on the ring or outside it at ${x},${y}`);
      px.set([...PAL[ch], 255], i);
    }));
    return px;
  };
  // (the sheet's cells: x 2..27, y 3..26 of the 30 x 30)
  const CW = 26, CH = 24, OX = 2, OY = 3;
  const sheet = Buffer.alloc(TAB_ORDER.length * CW * CH * 4);
  TAB_ORDER.forEach((name, k) => {
    const px = draw(name, SYMBOLS[name]);
    for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) {
      if (!px[at(x, y) + 3]) continue;
      const X = x - OX, Y = y - OY;
      if (X < 0 || X >= CW || Y < 0 || Y >= CH) throw new Error(`tab icons: ${name} is drawn outside its cell at ${x},${y}`);
      px.copy(sheet, ((Y * TAB_ORDER.length * CW) + k * CW + X) * 4, at(x, y), at(x, y) + 4);
    }
  });
  const tabs = await sharp(sheet, { raw: { width: TAB_ORDER.length * CW, height: CH, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
  await writeFile('tabicons.png', tabs);

  const gear = trim(await cellOf(content, 'sideicons', F, 4), F, F);
  await writeFile('gear.webp', await webp(gear));
  const rares = trim(partyhat, 32, 32);
  await writeFile('rares.webp', await webp(rares));
  // (style.css asks for the sheet stamped with what's in it, so a browser never keeps an old one)
  const stamp = createHash('sha1').update(tabs).digest('hex').slice(0, 10);
  console.log(`slayer.webp: the game's Slayer icon (staticons2 #1); tabicons.png: ${TAB_ORDER.join(', ')} (${CW} x ${CH}; style.css: tabicons.png?v=${stamp}); gear.webp ${gear.width} x ${gear.height} (sideicons #4); rares.webp ${rares.width} x ${rares.height} (a blue partyhat)`);
}

// On its own: the partyhat from the app's own sheet.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const content = process.argv[2];
  if (!content) { console.error('usage: node build-icons.mjs <LostCityRS/Content checkout>'); process.exit(1); }
  const { ITEMS, ICONS_PER_ROW, ICON_SIZE } = await import('./gamedata.js');
  const it = ITEMS.blue_partyhat;
  const { data, info } = await sharp(it.more ? 'items-more.png' : 'items.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const partyhat = Buffer.alloc(ICON_SIZE * ICON_SIZE * 4);
  const sx = (it.icon % ICONS_PER_ROW) * ICON_SIZE, sy = Math.floor(it.icon / ICONS_PER_ROW) * ICON_SIZE;
  for (let y = 0; y < ICON_SIZE; y++) data.copy(partyhat, y * ICON_SIZE * 4, ((sy + y) * info.width + sx) * 4, ((sy + y) * info.width + sx + ICON_SIZE) * 4);
  await appIcons(content, { partyhat });
}
