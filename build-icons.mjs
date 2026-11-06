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
// a "$", coins, a sword, a skull). In the tabs' order (v3.3.2: NPCs last). (v3.5.2) Bank's "$" is the bank's
// minimap icon's (sprites/mapfunction.png #5) drawn again at this size, pixel by pixel, as the minimap draws
// it: no outline, its edge gold on the upper left, its bright face, its dark gold under and right of each
// stroke and down the bar's right, and the disc's grey shadow a pixel down and right of it all. (v3.3.2's was
// that icon's own "$" made bigger by drawing some rows and columns twice, which looked soft; v3.5.1's a "$" of
// its own outlined in black.) DPS's (Gear's, v3.5, after Prices) is the sword NPCs had;
// NPCs' is the Slayer master's skull from the minimap (mapfunction #51 from rev 377 on, the
// [slayer_master_icon] loc's; not in rev 274, so its yellows are written here), light on the left.
// gear.webp, rares.webp (v3.3): the Bank and Prices tabs' Gear and Rares buttons: the game's Worn
// Equipment side icon (sideicons #4) and a blue partyhat (its item icon), each cut to what's drawn.
// (v3.3.2) Gear's figure 4 pixels shorter in the legs (4 of the 8 rows they're the same for), so it's
// 24 tall like the skills' icons and Rares, and clear of a button's gold line.

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
  // (v3.5.1) the bank's minimap golds, its face, its edge and its dark (bankGolds checks them against the icon;
  // v3.5.2: and its shadow's grey, f), and the Slayer master's minimap yellows (rev 377's mapfunction #51): its
  // light side, the rest, its nose
  a: [232, 209, 78], c: [176, 159, 65], e: [117, 100, 3], f: [159, 159, 159],
  u: [248, 255, 157], U: [244, 252, 114], z: [241, 254, 38],
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
  // (a sword: NPCs' until v3.5.1, DPS's since)
  gear: [
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
  // (v3.5.1) the Slayer master's skull, as the minimap has it: its eyes, its nose, its teeth
  npcs: [
    '.................',
    '.................',
    '.....KKKKKKK.....',
    '...KKuuuuuUUKK...',
    '..KuuuuuuuUUUUK..',
    '.KuuuuuuuUUUUUUK.',
    '.KuuuuuuUUUUUUUK.',
    '.KuuuuuuUUUUUUUK.',
    '.KuKKKKuUUKKKKUK.',
    '.KuKKKKuzUKKKKUK.',
    '.KuuKKuzzzUKKUUK.',
    '.KKuuuUzzzUUUUKK.',
    '..KKuuUUUUUUUKK..',
    '...KuKUKUKUKUK...',
    '...KuKUKUKUKUK...',
    '....KKKKKKKKK....',
    '.................',
  ],
  // (v3.5.2) the bank's "$", as the minimap draws it: c its edge, a its face, e its dark, f the shadow on the disc
  bank: [
    '.................',
    '.......ccc.......',
    '.....cccacccc....',
    '....ccaaaaaaef...',
    '....caaeaeeeef...',
    '....caaeaeffff...',
    '....caaeaeee.....',
    '....ccaaaaaeef...',
    '.....cccaeaaef...',
    '.......caeaaef...',
    '........aeaaef...',
    '........aeaaef...',
    '....ccccaeaaef...',
    '....caaaaaaeef...',
    '....ceeeaeeeff...',
    '.....ffeeef......',
    '........fff......',
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
const TAB_ORDER = ['lookup', 'compare', 'gains', 'leaders', 'goals', 'bank', 'prices', 'gear', 'npcs'];

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
  // (v3.5.1) bankGolds: the "$" of the bank's minimap icon is in just the three golds Bank's is drawn in
  // (the rest of that icon is greys: its disc, its ring, its shadow)
  const map = await cellOf(content, 'mapfunction', 15, 5), golds = new Set();
  for (let i = 0; i < map.length; i += 4) {
    const [r, g, b] = map.subarray(i, i + 3);
    if (map[i + 3] && !(r === g && g === b)) golds.add(`${r},${g},${b}`);
  }
  const bankGolds = ['a', 'c', 'e'].map(ch => PAL[ch].join());
  if (golds.size !== 3 || bankGolds.some(k => !golds.has(k))) throw new Error(`sprites/mapfunction.png: icon 5 (the bank's) is in the golds ${[...golds].join(' / ')} now, not ${bankGolds.join(' / ')}`);
  // (v3.5.2: and the grey of its shadow)
  let shadow = 0;
  for (let i = 0; i < map.length; i += 4) if (map[i + 3] && map.subarray(i, i + 3).join() === PAL.f.join()) shadow++;
  if (shadow < 5) throw new Error(`sprites/mapfunction.png: icon 5 (the bank's) has no shadow in ${PAL.f.join()} now`);
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

  // (Gear: its legs 4 pixels shorter, v3.3.2: rows 21 to 24 left out of the 8 the same, 17 to 24)
  const worn = trim(await cellOf(content, 'sideicons', F, 4), F, F);
  const row = y => worn.px.subarray(y * worn.width * 4, (y + 1) * worn.width * 4);
  if (worn.width !== 25 || worn.height !== 28 || [18, 19, 20, 21, 22, 23, 24].some(y => !row(y).equals(row(17)))) {
    throw new Error(`sprites/sideicons.png: icon 4 (Worn Equipment) isn't the one this knows: ${worn.width} x ${worn.height}, its legs not rows 17 to 24`);
  }
  const keep = [...Array(worn.height).keys()].filter(y => y < 21 || y > 24);
  const gear = { px: Buffer.concat(keep.map(row)), width: worn.width, height: keep.length };
  const gearFile = await webp(gear);
  await writeFile('gear.webp', gearFile);
  const rares = trim(partyhat, 32, 32);
  await writeFile('rares.webp', await webp(rares));
  // (style.css asks for the sheet, and Gear's icon (v3.3.2), stamped with what's in them, so a browser never
  // keeps an old one at the old size)
  const stamp = buf => createHash('sha1').update(buf).digest('hex').slice(0, 10);
  console.log(`slayer.webp: the game's Slayer icon (staticons2 #1); tabicons.png: ${TAB_ORDER.join(', ')} (${CW} x ${CH}; style.css: tabicons.png?v=${stamp(tabs)}); gear.webp ${gear.width} x ${gear.height} (sideicons #4; style.css: gear.webp?v=${stamp(gearFile)}); rares.webp ${rares.width} x ${rares.height} (a blue partyhat)`);
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
