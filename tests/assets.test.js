import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, mkdtemp, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { get } from 'node:http';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import express from 'express';
import { readGlb, shareTextures, prepareAssets } from '../scripts/prepare-assets.mjs';
import { compressedModels } from '../server/assets.js';

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
    await copyFile(new URL('character.glb', source), path.join(directory, 'character.glb'));
    const stats = await prepareAssets(directory);
    assert.ok(stats.downloadBytes < stats.sourceBytes);
    const original = await readFile(path.join(directory, 'character.glb'));
    const app = express();
    app.use(compressedModels(directory)); app.use(express.static(directory));
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const port = server.address().port;
    function request(encoding, extra = {}) {
      return new Promise((resolve, reject) => {
        get({ hostname: '127.0.0.1', port, path: '/character.glb', headers: { 'Accept-Encoding': encoding, ...extra } }, response => {
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
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
