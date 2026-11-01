import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, mkdtemp, copyFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { get } from 'node:http';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import express from 'express';
import sharp from 'sharp';
import { readGlb, shareTextures, prepareAssets } from '../scripts/prepare-assets.mjs';
import { compressedAssets, preferredCompression } from '../server/assets.js';

const source = new URL('../public/assets/', import.meta.url);
function viewBytes(model, index) {
  const view = model.document.bufferViews[index];
  return model.binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
}

test('shared-texture GLBs retain all original geometry, animations, materials, and exact image bytes', async () => {
  for (const name of (await readdir(source)).filter(name => name.endsWith('.glb'))) {
    const original = readGlb(await readFile(new URL(name, source)));
    const output = shareTextures(await readFile(new URL(name, source)));
    const optimized = readGlb(output.bytes);
    for (const key of ['meshes', 'nodes', 'animations', 'skins', 'materials', 'textures', 'scenes']) assert.deepEqual(optimized.document[key], original.document[key], `${name}: ${key}`);
    for (const [i, accessor] of original.document.accessors.entries()) {
      if (accessor.bufferView === undefined) continue;
      assert.deepEqual(viewBytes(optimized, optimized.document.accessors[i].bufferView), viewBytes(original, accessor.bufferView), `${name}: accessor ${i}`);
    }
    for (const [i, image] of original.document.images.entries()) {
      assert.deepEqual(output.textures.get(optimized.document.images[i].uri), viewBytes(original, image.bufferView), `${name}: image ${i}`);
    }
    assert.ok(output.bytes.length < original.binary.length + 1000000);
  }
});

test('production assets negotiate Brotli/gzip, report decoded sizes, and preserve identity downloads', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'coffee-assets-'));
  let server;
  try {
    const modelFiles = (await readdir(source)).filter(name => name.endsWith('.glb'));
    for (const name of modelFiles) await copyFile(new URL(name, source), path.join(directory, name));
    const script = 'export const message = "The office is ready";';
    const style = 'body { background: #4b6457; }';
    await writeFile(path.join(directory, 'scene-abcD_123.js'), script);
    await writeFile(path.join(directory, 'index-abcD_123.css'), style);
    const stats = await prepareAssets(directory);
    assert.ok(stats.downloadBytes < stats.sourceBytes);
    const decoded = new Map();
    for (const name of modelFiles) {
      const before = readGlb(await readFile(new URL(name, source)));
      const after = readGlb(await readFile(path.join(directory, name)));
      for (const [index, image] of before.document.images.entries()) {
        const uri = after.document.images[index].uri;
        if (!decoded.has(uri)) decoded.set(uri, await sharp(await readFile(path.join(directory, uri))).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
        const expected = await sharp(viewBytes(before, image.bufferView)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        assert.deepEqual(decoded.get(uri), expected, `${name}: optimized image ${index} must retain every pixel`);
      }
    }
    const original = await readFile(path.join(directory, 'chair.glb'));
    const manifest = JSON.parse(await readFile(path.join(directory, 'model-manifest.json'), 'utf8'));
    assert.match(manifest.chair, /^\/assets\/chair-[a-f0-9]{20}\.glb$/);
    const app = express();
    app.use(compressedAssets(directory)); app.use(express.static(directory));
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const port = server.address().port;
    function request(encoding, extra = {}, filename = '/chair.glb') {
      return new Promise((resolve, reject) => {
        get({ hostname: '127.0.0.1', port, path: filename, headers: { 'Accept-Encoding': encoding, ...extra } }, response => {
          const chunks = []; response.on('data', chunk => chunks.push(chunk));
          response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
        }).on('error', reject);
      });
    }
    for (const [encoding, decode] of [['br', brotliDecompressSync], ['gzip', gunzipSync]]) {
      const response = await request(encoding);
      assert.equal(response.status, 200); assert.equal(response.headers['content-encoding'], encoding);
      assert.equal(response.headers['content-type'], 'model/gltf-binary');
      assert.equal(Number(response.headers['x-file-size']), original.length);
      assert.match(response.headers.vary, /Accept-Encoding/);
      assert.deepEqual(decode(response.body), original);
      assert.ok(response.body.length < original.length);
    }
    const identity = await request('identity');
    assert.equal(identity.headers['content-encoding'], undefined); assert.deepEqual(identity.body, original);
    const ranged = await request('br', { Range: 'bytes=0-15' });
    assert.equal(ranged.status, 206); assert.equal(ranged.headers['content-encoding'], undefined);
    assert.deepEqual(ranged.body, original.subarray(0, 16));
    const versioned = await request('gzip, deflate, br', {}, manifest.chair.replace('/assets', ''));
    assert.equal(versioned.headers['content-encoding'], 'br');
    assert.match(versioned.headers['cache-control'], /max-age=31536000, immutable/);
    assert.deepEqual(brotliDecompressSync(versioned.body), await readFile(path.join(directory, path.basename(manifest.chair))));
    for (const [filename, contents, type] of [['scene-abcD_123.js', script, 'text/javascript'], ['index-abcD_123.css', style, 'text/css']]) {
      const response = await request('gzip, br', {}, `/${filename}`);
      assert.equal(response.headers['content-encoding'], 'br');
      assert.ok(response.headers['content-type'].startsWith(type));
      assert.match(response.headers['cache-control'], /max-age=31536000, immutable/);
      assert.equal(brotliDecompressSync(response.body).toString(), contents);
    }
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test('compression negotiation prefers Brotli on ties and honors explicit exclusions and quality weights', () => {
  for (const [header, expected] of [['gzip, deflate, br', 'br'], ['gzip;q=1,br;q=0.5', 'gzip'], ['br;q=0,gzip', 'gzip'], ['gzip;q=0,br;q=0', 'identity'], ['*;q=1,br;q=0', 'gzip'], ['', 'identity'], ['identity;q=1,br;q=.5', 'identity']]) assert.equal(preferredCompression(header), expected, header);
});
