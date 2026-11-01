import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { openBrowser, selectComposition, renderStill, renderMedia } from '@remotion/renderer';

const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(root, 'out');
await mkdir(output, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.join(root, 'film.jsx'), publicDir: path.join(root, 'generated/public'), outDir: path.join(root, 'generated/bundle') });
const gl = process.env.REMOTION_GL || (process.platform === 'darwin' ? 'angle' : 'swangle');
const concurrency = Number(process.env.VIDEO_CONCURRENCY || (process.platform === 'darwin' ? 4 : 2));
const browser = await openBrowser('chrome', { chromiumOptions: { gl } });
try {
  const composition = await selectComposition({ serveUrl, id: 'CoffeeRunTrailer', puppeteerInstance: browser });
  if (process.argv.includes('--stills')) {
    for (const frame of [45, 225, 390, 493, 695, 900, 990, 1080, 1170, 1220]) {
      await renderStill({ composition, serveUrl, puppeteerInstance: browser, frame, output: path.join(output, `frame-${frame}.png`), imageFormat: 'png' });
      console.log(`Still ${frame} ready`);
    }
  } else {
    const rangeFlag = process.argv.find(a => a.startsWith('--frames='));
    const frameRange = rangeFlag ? rangeFlag.split('=')[1].split('-').map(Number) : undefined;
    let last = -1;
    await renderMedia({ composition, serveUrl, puppeteerInstance: browser, codec: 'h264', crf: 18,
      concurrency, x264Preset: 'fast', pixelFormat: 'yuv420p', frameRange,
      outputLocation: path.join(output, frameRange ? 'render-probe.mp4' : 'picture.mp4'),
      onProgress: ({ progress, renderedFrames }) => {
        const percent = Math.floor(progress * 100);
        if (percent >= last + 5) { console.log(`${percent}% · ${renderedFrames} frames`); last = percent; }
      },
    });
  }
} finally { await browser.close({ silent: true }); }
