// A monster's page (v3.3): its picture, where it is, and a little minimap of where most of them stand.
// build-data.mjs runs this with every monster and the NPCs it is (where the map puts each one).
//
// npcPictures: LostHQ's renders of the game's NPC models (LostHQ/2004, img/npc_spritesheet.png:
//   256 x 256 cells, one for each NPC by its id in the cache, which is Content's pack/npc.pack id),
//   made smaller (176 x 176: v3.3.2, 112 till then), into npcpics.webp.
// npcPlaces: the minimaps, drawn here from Lost City's own map files the way the game client draws
//   its minimap (Client-TS: ClientBuild, World, Client): each square of ground 4 by 4 pixels, its
//   underlay's colour blended with the ones around it (10 by 10 squares) and its overlay's over it in
//   the overlay's shape; walls white, doors red; the little pictures of trees, rocks and ladders
//   (mapscene) and the round icons of banks, shops and altars (mapfunction); and a yellow dot for each
//   of the monster. Into npcmaps.webp. And where they are in words: the nearest name on the world map
//   (maps/labels.txt), under ground, upstairs, and the Wilderness's levels (its zones, as the server
//   works them out: wilderness_zones, a level every 8 squares north).
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const sharp = createRequire(import.meta.url)('sharp');   // from NODE_PATH / a global install

// ── Pictures ──────────────────────────────────────────────────────────────
// list: [{ id, pack }] (pack: the NPC's id). -> { sheet: PNG/WebP buffer, size, perRow, index: Map id -> cell }
export async function npcPictures({ lostHq, list, size = 176, perRow = 16 }) {
  const { data, info } = await sharp(join(lostHq, 'img/npc_spritesheet.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const CELL = 256, cols = info.width / CELL, rows = info.height / CELL;
  if (!Number.isInteger(cols) || !Number.isInteger(rows)) throw new Error(`npc pictures: the sheet is ${info.width} x ${info.height}, not in cells of ${CELL}`);
  const byPack = new Map(), index = new Map(), cells = [];
  for (const { id, pack } of list) {
    if (pack == null || pack < 0 || pack >= cols * rows) continue;
    if (!byPack.has(pack)) {
      const sx = (pack % cols) * CELL, sy = Math.floor(pack / cols) * CELL;
      const px = Buffer.alloc(CELL * CELL * 4);
      for (let y = 0; y < CELL; y++) data.copy(px, y * CELL * 4, ((sy + y) * info.width + sx) * 4, ((sy + y) * info.width + sx + CELL) * 4);
      let drawn = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i] > 16) drawn++;
      if (drawn < 400) { byPack.set(pack, null); continue; }        // (no render of it)
      const small = await sharp(px, { raw: { width: CELL, height: CELL, channels: 4 } }).resize(size, size, { kernel: 'lanczos3' }).raw().toBuffer();
      byPack.set(pack, cells.length);
      cells.push(small);
    }
    if (byPack.get(pack) != null) index.set(id, byPack.get(pack));
  }
  const sheetRows = Math.max(1, Math.ceil(cells.length / perRow));
  const sheet = Buffer.alloc(perRow * size * sheetRows * size * 4);
  cells.forEach((px, n) => {
    const dx = (n % perRow) * size, dy = Math.floor(n / perRow) * size;
    for (let y = 0; y < size; y++) px.copy(sheet, ((dy + y) * perRow * size + dx) * 4, y * size * 4, (y + 1) * size * 4);
  });
  const out = await sharp(sheet, { raw: { width: perRow * size, height: sheetRows * size, channels: 4 } }).webp({ quality: 88, alphaQuality: 100, effort: 6 }).toBuffer();
  return { sheet: out, size, perRow, count: cells.length, index };
}

// ── The game's colours ───────────────────────────────────────────────────
// Pix3D.initColourTable(0.8): a 16-bit HSL (6 bits hue, 3 saturation, 7 lightness) to RGB, gamma and all.
function hslToRgb(hue, saturation, lightness) {
  let r = lightness, g = lightness, b = lightness;
  if (saturation !== 0) {
    const q = lightness < 0.5 ? lightness * (saturation + 1) : lightness + saturation - lightness * saturation;
    const p = lightness * 2 - q;
    let t = hue + 1 / 3; if (t > 1) t--;
    let d = hue - 1 / 3; if (d < 0) d++;
    const ch = x => (x * 6 < 1 ? p + (q - p) * 6 * x : x * 2 < 1 ? q : x * 3 < 2 ? p + (q - p) * (2 / 3 - x) * 6 : p);
    r = ch(t); g = ch(hue); b = ch(d);
  }
  return ((r * 256) | 0) << 16 | ((g * 256) | 0) << 8 | ((b * 256) | 0);
}
function gammaCorrect(rgb, gamma) {
  const c = v => (Math.pow(v / 256, gamma) * 256) | 0;
  return c(rgb >> 16 & 0xff) << 16 | c(rgb >> 8 & 0xff) << 8 | c(rgb & 0xff);
}
const BRIGHTNESS = 0.8;
const COLOUR_TABLE = (() => {
  const t = new Int32Array(65536);
  let n = 0;
  for (let y = 0; y < 512; y++) {
    const hue = ((y / 8) | 0) / 64 + 0.0078125, sat = (y & 7) / 8 + 0.0625;
    for (let x = 0; x < 128; x++) t[n++] = gammaCorrect(hslToRgb(hue, sat, x / 128), BRIGHTNESS);
  }
  return t;
})();
// ClientBuild.getTable, getUCol, getOCol
function getTable(hue, saturation, lightness) {
  if (lightness > 179) saturation = (saturation / 2) | 0;
  if (lightness > 192) saturation = (saturation / 2) | 0;
  if (lightness > 217) saturation = (saturation / 2) | 0;
  if (lightness > 243) saturation = (saturation / 2) | 0;
  return (((hue / 4) | 0) << 10) + (((saturation / 32) | 0) << 7) + ((lightness / 2) | 0);
}
const lightOf = (hsl, light) => Math.min(126, Math.max(2, ((light * (hsl & 0x7f)) / 128) | 0));
const getUCol = (hsl, light) => (hsl & 0xff80) + lightOf(hsl, light);
// FloType.getHsl: a floor's colour as the client keeps it
function floorHsl(rgb) {
  const red = (rgb >> 16 & 0xff) / 256, green = (rgb >> 8 & 0xff) / 256, blue = (rgb & 0xff) / 256;
  const min = Math.min(red, green, blue), max = Math.max(red, green, blue);
  let h = 0, s = 0;
  const l = (min + max) / 2;
  if (min !== max) {
    s = l < 0.5 ? (max - min) / (max + min) : (max - min) / (2 - max - min);
    h = red === max ? (green - blue) / (max - min) : green === max ? (blue - red) / (max - min) + 2 : (red - green) / (max - min) + 4;
  }
  h /= 6;
  const clamp = v => Math.min(255, Math.max(0, v));
  const hue = (h * 256) | 0, saturation = clamp((s * 256) | 0), lightness = clamp((l * 256) | 0);
  const chroma = Math.max(1, (l > 0.5 ? (1 - l) * s * 512 : l * s * 512) | 0);
  return { hue, saturation, lightness, chroma, underlayHue: (h * chroma) | 0 };
}
// The minimap's shapes of an overlay (World.MINIMAP_SHAPE, MINIMAP_ROTATE): 4 by 4, row by row from the north.
const SHAPE = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 1, 1],
  [1, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  [0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1],
  [0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0],
  [1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 0, 1, 1],
  [1, 1, 1, 1, 1, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1],
];
const ROTATE = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [12, 8, 4, 0, 13, 9, 5, 1, 14, 10, 6, 2, 15, 11, 7, 3],
  [15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  [3, 7, 11, 15, 2, 6, 10, 14, 1, 5, 9, 13, 0, 4, 8, 12],
];
const WALL = 0xeeeeee, DOOR = 0xee0000;

// ── Configs ──────────────────────────────────────────────────────────────
function parseConfig(text) {
  const blocks = new Map();
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    const head = line.match(/^\[([^\]]+)\]$/);
    if (head) { cur = {}; blocks.set(head[1], cur); continue; }
    if (!cur) continue;
    const eq = line.indexOf('=');
    if (eq > 0) cur[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return blocks;
}
const readPack = async path => new Map((await readFile(path, 'utf8')).split(/\r?\n/).filter(l => /^\d+=/.test(l)).map(l => [Number(l.slice(0, l.indexOf('='))), l.slice(l.indexOf('=') + 1)]));

// A sprite sheet's cells (magenta is nothing), each cut to what's drawn: [{ w, h, px }]
async function spriteCells(content, sheet) {
  const [cw, ch] = (await readFile(join(content, `sprites/meta/${sheet}.opt`), 'ascii')).trim().split('x').map(Number);
  const { data, info } = await sharp(join(content, `sprites/${sheet}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = [];
  for (let cy = 0; cy + ch <= info.height; cy += ch) for (let cx = 0; cx + cw <= info.width; cx += cw) {
    let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
    const at = (x, y) => ((cy + y) * info.width + cx + x) * 4;
    const on = (x, y) => { const i = at(x, y); return data[i + 3] > 0 && !(data[i] === 255 && data[i + 1] === 0 && data[i + 2] === 255); };
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (on(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 < 0) { out.push(null); continue; }
    const w = x1 - x0 + 1, h = y1 - y0 + 1, px = new Int32Array(w * h).fill(-1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x0 + x, y0 + y)) { const i = at(x0 + x, y0 + y); px[y * w + x] = data[i] << 16 | data[i + 1] << 8 | data[i + 2]; }
    out.push({ w, h, px });
  }
  return out;
}

// ── The map ──────────────────────────────────────────────────────────────
// A square of the map (maps/m<mx>_<mz>.jm2): for each level, its ground (underlay, overlay, its shape
// and rotation) and its locs (id, shape, rotation).
function readSquare(text) {
  const ground = [0, 1, 2, 3].map(() => ({ u: new Uint8Array(4096), o: new Uint8Array(4096), s: new Uint8Array(4096), r: new Uint8Array(4096) }));
  const locs = [[], [], [], []];
  let part = '';
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('====')) { part = line.replace(/=/g, '').trim(); continue; }
    const m = /^(\d) (\d+) (\d+): (.*)$/.exec(line);
    if (!m) continue;
    const level = Number(m[1]), x = Number(m[2]), z = Number(m[3]);
    if (level > 3 || x > 63 || z > 63) continue;
    if (part === 'MAP') {
      const g = ground[level], i = x * 64 + z;
      for (const tok of m[4].trim().split(/\s+/)) {
        if (tok[0] === 'u') g.u[i] = Number(tok.slice(1));
        else if (tok[0] === 'o') { const [id, shape = 0, rot = 0] = tok.slice(1).split(';').map(Number); g.o[i] = id; g.s[i] = shape; g.r[i] = rot; }
      }
    } else if (part === 'LOC') {
      const [id, shape = 10, rot = 0] = m[4].trim().split(/\s+/).map(Number);
      locs[level].push([x, z, id, shape, rot]);
    }
  }
  return { ground, locs };
}

// Where a place is, in words: the nearest name on the world map within 100 squares (a town, a castle;
// more than 20 squares away, which way from it), else a kingdom's within 300; under ground, upstairs,
// and the Wilderness's level there.
const COMPASS = ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east'];
function placeNamer(labels, wildZones) {
  const named = labels.filter(l => !/\(due /.test(l.name));
  const near = (x, z) => {
    let best = null;
    for (const l of named) {
      const d = Math.hypot(l.x - x, l.z - z);
      if (d > (l.size >= 2 ? 300 : 100)) continue;
      const score = l.size >= 2 ? d + 1000 : d;      // (a town's name before a kingdom's)
      if (!best || score < best.score) best = { l, d, score };
    }
    if (!best) return null;
    if (best.l.size >= 2 || best.d <= 20) return { name: best.l.name, region: best.l.size >= 2 };
    const way = COMPASS[Math.round(Math.atan2(z - best.l.z, x - best.l.x) / (Math.PI / 4) + 8) % 8];
    return { name: best.l.name, way };
  };
  const wildLevel = (level, x, z) => {
    for (const [a, b] of wildZones) if (level >= a.level && level <= b.level && x >= a.x && x <= b.x && z >= a.z && z <= b.z) return Math.floor((z - a.z) / 8) + 1;
    return 0;
  };
  return ([level, x, z]) => {
    const under = z >= 6400;
    return { near: near(x, under ? z - 6400 : z), under, up: level > 0, wild: wildLevel(level, x, z) };
  };
}
// "North of Lumbridge", "Under Edgeville", "Underground, west of Coal Trucks", "Wilderness level 41–42"…
function placeText({ near, under, up, lo, hi }) {
  const wild = hi ? `Wilderness level ${lo === hi ? lo : `${lo}–${hi}`}` : '';
  let text;
  if (!near) text = under ? 'Underground, off the world map' : 'Off the world map';
  else if (hi && near.name === 'Wilderness') text = under ? `Underground, ${wild}` : wild;
  else {
    const at = near.way ? `${near.way} of ${near.name}` : near.name;
    text = under ? (near.way ? `Underground, ${at}` : `Under ${at}`) : at[0].toUpperCase() + at.slice(1);
    if (wild) text += `, ${wild}`;
  }
  // (upstairs: on a floor above the ground; under ground and off the world map the levels are the map's own business)
  return text + (up && near && !under ? ' (upstairs)' : '');
}

// list: [{ id, spawns: [[level, x, z], …] }]
// -> { sheet, cell: { w, h }, perRow, index: Map id -> cell, where: Map id -> [[place, count]], windows: Map id -> { x, z, level } }
export async function npcPlaces({ content, list, W = 48, H = 36, perRow = 8 }) {
  // Floors: flo.pack's ids (1 up in the map files: 0 is none), their colours or textures.
  // (every config file the server packs: scripts/floors, and what's still in scripts/_unpack)
  const configs = async ext => {
    const out = new Map();
    for (const f of (await readdir(join(content, 'scripts'), { recursive: true })).filter(f => f.endsWith(ext))) {
      for (const [name, c] of parseConfig(await readFile(join(content, 'scripts', f), 'utf8'))) {
        if (out.has(name)) throw new Error(`npc maps: two configs called ${name}`);
        out.set(name, c);
      }
    }
    return out;
  };
  const floIds = await readPack(join(content, 'pack/flo.pack'));
  const floCfg = await configs('.flo');
  const texIds = new Map([...(await readPack(join(content, 'pack/texture.pack')))].map(([id, name]) => [name, id]));
  // (a texture's colour on the minimap: Pix3D.getTextureAverage, the average of its palette, gamma 0.8 then 1.4)
  const texAverage = new Map();
  const textureColour = async name => {
    if (texAverage.has(name)) return texAverage.get(name);
    const { data, info } = await sharp(join(content, `textures/${name}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const pal = new Set();
    for (let i = 0; i < info.width * info.height * 4; i += 4) if (data[i + 3]) pal.add(data[i] << 16 | data[i + 1] << 8 | data[i + 2]);
    let r = 0, g = 0, b = 0;
    for (const c of pal) { const v = gammaCorrect(c, BRIGHTNESS); r += v >> 16 & 0xff; g += v >> 8 & 0xff; b += v & 0xff; }
    const n = pal.size + 1;                      // (the palette's first colour, transparent, is black)
    const rgb = gammaCorrect(((r / n) | 0) << 16 | ((g / n) | 0) << 8 | ((b / n) | 0), 1.4) || 1;
    texAverage.set(name, rgb);
    return rgb;
  };
  const FLOOR = [];                              // map file id -> { under: hsl parts } or { over: rgb | 0 }
  for (const [id, name] of floIds) {
    const c = floCfg.get(name);
    if (!c) throw new Error(`npc maps: floor ${name} has no config`);
    const colour = c.colour != null ? Number(c.colour) : 0;
    const f = { name, overlay: c.overlay === 'yes', hsl: floorHsl(colour) };
    if (c.texture) {
      if (!texIds.has(c.texture)) throw new Error(`npc maps: floor ${name}'s texture ${c.texture} isn't packed`);
      f.over = await textureColour(c.texture);
    } else if (colour === 0xff00ff) f.over = 0;
    else f.over = COLOUR_TABLE[getUCol(getTable(f.hsl.hue, f.hsl.saturation, f.hsl.lightness), 96)];
    FLOOR[id + 1] = f;
  }
  // Locs: their pictures, icons and whether a wall of theirs is a door
  const locIds = await readPack(join(content, 'pack/loc.pack'));
  const locCfg = await configs('.loc');
  const LOC = new Map();
  for (const [id, name] of locIds) {
    const c = locCfg.get(name);
    if (!c) continue;
    const ops = [1, 2, 3, 4, 5].some(k => c[`op${k}`]);
    LOC.set(id, {
      scene: c.mapscene != null ? Number(c.mapscene) : -1, func: c.mapfunction != null ? Number(c.mapfunction) : -1,
      active: c.active ? c.active === 'yes' : ops, w: Number(c.width || 1), l: Number(c.length || 1),
    });
  }
  const scenes = await spriteCells(content, 'mapscene'), funcs = await spriteCells(content, 'mapfunction'), dots = await spriteCells(content, 'mapdots');
  const dot = dots[1];                           // (an NPC's: yellow)
  // The world map's names, and the Wilderness's zones
  const labels = (await readFile(join(content, 'maps/labels.txt'), 'utf8')).split(/\r?\n/).filter(l => l.startsWith('=')).map(l => {
    const [name, x, z, size] = l.slice(1).split(',');
    return { name: name.replace(/\//g, ' ').replace(/\s+/g, ' ').trim(), x: Number(x), z: Number(z), size: Number(size) };
  });
  const zoneText = await readFile(join(content, 'scripts/areas/area_wilderness/configs/wilderness_zones.dbrow'), 'utf8');
  const coord = s => { const [level, mx, mz, x, z] = s.split('_').map(Number); return { level, x: mx * 64 + x, z: mz * 64 + z }; };
  const wildZones = [...zoneText.matchAll(/^data=coord_pair,(\S+),(\S+)\s*$/gm)].map(m => [coord(m[1]), coord(m[2])]);
  if (wildZones.length < 2) throw new Error('npc maps: the Wilderness zones read differently now');
  const levelRule = await readFile(join(content, 'scripts/areas/area_wilderness/scripts/wilderness_levels.rs2'), 'utf8');
  if (!/return \(calc\(\(coordz\(\$coord\) - coordz\(\$coord1\)\)\/8 \+ 1\)\);/.test(levelRule)) throw new Error('npc maps: the Wilderness\'s levels are worked out differently now');
  const placeOf = placeNamer(labels, wildZones);

  // The map squares, read as they're needed
  const squares = new Map();
  const squareAt = async (mx, mz) => {
    const k = `${mx}_${mz}`;
    if (!squares.has(k)) {
      let sq = null;
      try { sq = readSquare(await readFile(join(content, `maps/m${mx}_${mz}.jm2`), 'utf8')); } catch { sq = null; }
      squares.set(k, sq);
    }
    return squares.get(k);
  };
  const groundAt = (level, x, z) => {
    const sq = squares.get(`${x >> 6}_${z >> 6}`);
    if (!sq) return null;
    const g = sq.ground[level], i = (x & 63) * 64 + (z & 63);
    return { u: g.u[i], o: g.o[i], s: g.s[i], r: g.r[i] };
  };

  // One window of the map, W by H squares from (x0, z0) at a level, with dots: RGB, 4 pixels a square.
  async function render(x0, z0, level, spots) {
    for (let mx = (x0 - 5) >> 6; mx <= (x0 + W + 5) >> 6; mx++) for (let mz = (z0 - 5) >> 6; mz <= (z0 + H + 5) >> 6; mz++) await squareAt(mx, mz);
    const PW = W * 4, PH = H * 4, img = new Int32Array(PW * PH);         // (0: black)
    const put = (x, y, rgb) => { if (x >= 0 && y >= 0 && x < PW && y < PH) img[y * PW + x] = rgb; };
    const sprite = (s, left, top) => { if (!s) return; for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.px[y * s.w + x] >= 0) put(left + x, top + y, s.px[y * s.w + x]); };
    const col = x => (x - x0) * 4, row = z => (z0 + H - 1 - z) * 4;
    // the ground: the underlay blended over 10 by 10 squares (ClientBuild: x - 4 to x + 5, z - 4 to z + 5)
    for (let x = x0; x < x0 + W; x++) for (let z = z0; z < z0 + H; z++) {
      const g = groundAt(level, x, z);
      if (!g || (!g.u && !g.o)) continue;
      let underlay = 0;
      if (g.u) {
        let hue = 0, sat = 0, lig = 0, com = 0, tot = 0;
        for (let dx = -4; dx <= 5; dx++) for (let dz = -4; dz <= 5; dz++) {
          const n = groundAt(level, x + dx, z + dz);
          const f = n?.u && FLOOR[n.u];
          if (!f) continue;
          hue += f.hsl.underlayHue; sat += f.hsl.saturation; lig += f.hsl.lightness; com += f.hsl.chroma; tot++;
        }
        if (tot) underlay = COLOUR_TABLE[getUCol(getTable(((hue * 256) / com) | 0, (sat / tot) | 0, (lig / tot) | 0), 96)];
      }
      const over = g.o ? FLOOR[g.o]?.over ?? 0 : 0;
      const shape = g.o ? SHAPE[g.s + 1] : SHAPE[1], rot = ROTATE[g.o ? g.r & 3 : 0];
      const px = col(x), py = row(z);
      for (let k = 0; k < 16; k++) {
        const on = shape[rot[k]] !== 0;
        if (over) put(px + (k & 3), py + (k >> 2), on ? over : underlay);
        else if (on && underlay) put(px + (k & 3), py + (k >> 2), underlay);
      }
    }
    // walls and doors, the pictures of trees and rocks, then the icons
    const icons = [];
    for (let mx = x0 >> 6; mx <= (x0 + W) >> 6; mx++) for (let mz = z0 >> 6; mz <= (z0 + H) >> 6; mz++) {
      const sq = squares.get(`${mx}_${mz}`);
      if (!sq) continue;
      for (const [lx, lz, id, shape, rot] of sq.locs[level]) {
        const x = mx * 64 + lx, z = mz * 64 + lz;
        if (x < x0 - 4 || x >= x0 + W + 4 || z < z0 - 4 || z >= z0 + H + 4) continue;
        const loc = LOC.get(id);
        if (!loc) continue;
        const px = col(x), py = row(z);
        if (loc.func >= 0) icons.push([px + 2, py + 2, loc.func]);
        if (loc.scene >= 0) {
          const s = scenes[loc.scene];
          if (s) sprite(s, px + (((loc.w * 4 - s.w) / 2) | 0), row(z + loc.l - 1) + (((loc.l * 4 - s.h) / 2) | 0));
          continue;
        }
        const rgb = loc.active ? DOOR : WALL;
        const line = side => { for (let k = 0; k < 4; k++) put(px + [0, k, 3, k][side], py + [k, 0, k, 3][side], rgb); };
        if (shape === 0 || shape === 2) line(rot);
        if (shape === 2) line((rot + 1) & 3);         // (an L: the next side round too)
        if (shape === 3) put(px + [0, 3, 3, 0][rot], py + [0, 0, 3, 3][rot], rgb);
        if (shape === 9) for (let k = 0; k < 4; k++) put(px + k, py + (rot === 0 || rot === 2 ? 3 - k : k), rgb);
      }
    }
    for (const [x, y, f] of icons) sprite(funcs[f], x - 7, y - 7);
    for (const [x, z] of spots) sprite(dot, col(x) + 2 - (dot.w >> 1), row(z) + 2 - (dot.h >> 1));
    return img;
  }

  const index = new Map(), where = new Map(), windows = new Map(), cells = [], odd = [];
  for (const { id, spawns } of list) {
    if (!spawns?.length) continue;
    // in words: each place, with how many there
    const counts = new Map();
    for (const s of spawns) {
      const p = placeOf(s);
      const key = JSON.stringify([p.near, p.under, p.up, !!p.wild]);
      const c = counts.get(key) || counts.set(key, { ...p, n: 0, lo: Infinity, hi: 0 }).get(key);
      c.n++;
      if (p.wild) { c.lo = Math.min(c.lo, p.wild); c.hi = Math.max(c.hi, p.wild); }
    }
    for (const c of counts.values()) if (c.hi > 60) odd.push(`${id}: Wilderness level ${c.lo}–${c.hi}, by the server's zones`);
    where.set(id, [...counts.values()].sort((a, b) => b.n - a.n).map(c => [placeText(c), c.n]));
    // the map: the window with the most of them in it
    let best = null;
    for (const [, cx, cz] of spawns) {
      const x0 = cx - (W >> 1), z0 = cz - (H >> 1);
      const inside = spawns.filter(([, x, z]) => x >= x0 && x < x0 + W && z >= z0 && z < z0 + H);
      if (!best || inside.length > best.inside.length) best = { x0, z0, inside };
    }
    // (centred on what's in it)
    const xs = best.inside.map(s => s[1]), zs = best.inside.map(s => s[2]);
    const x0 = Math.round((Math.min(...xs) + Math.max(...xs)) / 2) - (W >> 1), z0 = Math.round((Math.min(...zs) + Math.max(...zs)) / 2) - (H >> 1);
    const levels = new Map();
    for (const [l] of best.inside) levels.set(l, (levels.get(l) || 0) + 1);
    const level = [...levels].sort((a, b) => b[1] - a[1])[0][0];
    const spots = spawns.filter(([l, x, z]) => l === level && x >= x0 && x < x0 + W && z >= z0 && z < z0 + H).map(([, x, z]) => [x, z]);
    const img = await render(x0, z0, level, spots);
    index.set(id, cells.length);
    windows.set(id, { x: x0, z: z0, level, shown: spots.length });
    cells.push(img);
  }
  const PW = W * 4, PH = H * 4, rows = Math.max(1, Math.ceil(cells.length / perRow));
  const sheet = Buffer.alloc(perRow * PW * rows * PH * 3);
  cells.forEach((img, n) => {
    const dx = (n % perRow) * PW, dy = Math.floor(n / perRow) * PH;
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      const v = img[y * PW + x], o = ((dy + y) * perRow * PW + dx + x) * 3;
      sheet[o] = v >> 16 & 0xff; sheet[o + 1] = v >> 8 & 0xff; sheet[o + 2] = v & 0xff;
    }
  });
  const raw = { raw: { width: perRow * PW, height: rows * PH, channels: 3 } };
  return { sheet: await sharp(sheet, raw).webp({ quality: 90, effort: 6, smartSubsample: true }).toBuffer(), raw: () => sharp(sheet, raw), cell: { w: PW, h: PH }, perRow, index, where, windows, odd };
}
