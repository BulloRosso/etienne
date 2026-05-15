/**
 * Tiny dependency-free PNG generator for placeholder machine images.
 *
 * Produces 500×400 PNGs with a light-gray background, a colored top
 * stripe to distinguish the three machines at a glance, and a centered
 * text label in white-on-stripe.
 *
 * Uses Node's built-in zlib + a hand-crafted PNG IDAT chunk. No sharp,
 * no canvas, no native deps. The user replaces these with real photos.
 */

import { deflateSync } from 'node:zlib';

const WIDTH = 500;
const HEIGHT = 400;
const STRIPE_HEIGHT = 80;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const BG: Rgb = { r: 236, g: 239, b: 241 }; // light gray (matches dashboard bg)
const TEXT_BG_TEXT: Rgb = { r: 255, g: 255, b: 255 }; // white text on stripe

function crc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}
const CRC_TABLE = crc32Table();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = (CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8)) >>> 0;
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/**
 * Build raw RGB pixels for a single machine placeholder.
 * `topStripeColor` is the top-stripe color; the rest is light-gray.
 * `label` is rendered as a coarse 5×7-cell text band centered in the stripe.
 */
function buildPixels(topStripeColor: Rgb, label: string): Buffer {
  const bytesPerRow = WIDTH * 3 + 1; // +1 for filter byte
  const buf = Buffer.alloc(bytesPerRow * HEIGHT);

  for (let y = 0; y < HEIGHT; y++) {
    const rowStart = y * bytesPerRow;
    buf[rowStart] = 0; // filter: None
    const inStripe = y < STRIPE_HEIGHT;
    const color = inStripe ? topStripeColor : BG;
    for (let x = 0; x < WIDTH; x++) {
      const off = rowStart + 1 + x * 3;
      buf[off]     = color.r;
      buf[off + 1] = color.g;
      buf[off + 2] = color.b;
    }
  }

  // Render the label inside the stripe using a tiny 5x7 bitmap font.
  drawText(buf, bytesPerRow, label, /* startX */ 16, /* startY */ 24, TEXT_BG_TEXT);
  return buf;
}

/** Write a single pixel into the (filtered) row buffer. */
function setPixel(buf: Buffer, bytesPerRow: number, x: number, y: number, c: Rgb): void {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
  const off = y * bytesPerRow + 1 + x * 3;
  buf[off]     = c.r;
  buf[off + 1] = c.g;
  buf[off + 2] = c.b;
}

/** Minimal 5×7 ASCII font for the placeholder label. */
const FONT_5X7: Record<string, string[]> = {
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '.XXX.', '.....', '.....', '.....'],
  '0': ['.XXX.', 'X...X', 'X..XX', 'X.X.X', 'XX..X', 'X...X', '.XXX.'],
  '1': ['..X..', '.XX..', '..X..', '..X..', '..X..', '..X..', '.XXX.'],
  '3': ['XXXX.', '....X', '....X', '.XXX.', '....X', '....X', 'XXXX.'],
  '5': ['XXXXX', 'X....', 'XXXX.', '....X', '....X', 'X...X', '.XXX.'],
  '7': ['XXXXX', '....X', '...X.', '..X..', '.X...', '.X...', '.X...'],
  'A': ['.XXX.', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
  'B': ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X...X', 'X...X', 'XXXX.'],
  'C': ['.XXX.', 'X...X', 'X....', 'X....', 'X....', 'X...X', '.XXX.'],
  'D': ['XXXX.', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'XXXX.'],
  'E': ['XXXXX', 'X....', 'X....', 'XXXX.', 'X....', 'X....', 'XXXXX'],
  'H': ['X...X', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'],
  'I': ['XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', 'XXXXX'],
  'L': ['X....', 'X....', 'X....', 'X....', 'X....', 'X....', 'XXXXX'],
  'M': ['X...X', 'XX.XX', 'X.X.X', 'X...X', 'X...X', 'X...X', 'X...X'],
  'N': ['X...X', 'XX..X', 'X.X.X', 'X..XX', 'X...X', 'X...X', 'X...X'],
  'P': ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X....', 'X....', 'X....'],
  'Q': ['.XXX.', 'X...X', 'X...X', 'X...X', 'X.X.X', 'X..X.', '.XX.X'],
  'R': ['XXXX.', 'X...X', 'X...X', 'XXXX.', 'X.X..', 'X..X.', 'X...X'],
  'S': ['.XXXX', 'X....', 'X....', '.XXX.', '....X', '....X', 'XXXX.'],
  'T': ['XXXXX', '..X..', '..X..', '..X..', '..X..', '..X..', '..X..'],
  'U': ['X...X', 'X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.XXX.'],
  'V': ['X...X', 'X...X', 'X...X', 'X...X', 'X...X', '.X.X.', '..X..'],
  'X': ['X...X', 'X...X', '.X.X.', '..X..', '.X.X.', 'X...X', 'X...X'],
};

function drawText(buf: Buffer, bytesPerRow: number, text: string, startX: number, startY: number, color: Rgb): void {
  const SCALE = 4; // cell scale: each font pixel = 4×4 image pixels
  const SPACING = 2; // pixels between chars
  let cx = startX;
  for (const ch of text.toUpperCase()) {
    const glyph = FONT_5X7[ch] ?? FONT_5X7[' '];
    for (let gy = 0; gy < 7; gy++) {
      const row = glyph![gy]!;
      for (let gx = 0; gx < 5; gx++) {
        if (row[gx] !== 'X') continue;
        for (let dy = 0; dy < SCALE; dy++) {
          for (let dx = 0; dx < SCALE; dx++) {
            setPixel(buf, bytesPerRow, cx + gx * SCALE + dx, startY + gy * SCALE + dy, color);
          }
        }
      }
    }
    cx += 5 * SCALE + SPACING;
  }
}

function pngFromPixels(pixels: Buffer): Buffer {
  // PNG signature
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8]  = 8; // bit depth
  ihdr[9]  = 2; // color type RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const idat = deflateSync(pixels);
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', iend),
  ]);
}

/** Public API: build the 3 machine placeholders. */
export function buildPlaceholderPngs(): Array<{ filename: string; buffer: Buffer }> {
  return [
    {
      filename: 'cnc-5ax.png',
      buffer: pngFromPixels(buildPixels({ r: 25, g: 118, b: 210 }, 'CNC-5AX')), // blue
    },
    {
      filename: 'deburr-hand.png',
      buffer: pngFromPixels(buildPixels({ r: 251, g: 140, b: 0 }, 'DEBURR HAND')), // orange
    },
    {
      filename: 'qa-insp.png',
      buffer: pngFromPixels(buildPixels({ r: 67, g: 160, b: 71 }, 'QA INSP')), // green
    },
  ];
}
