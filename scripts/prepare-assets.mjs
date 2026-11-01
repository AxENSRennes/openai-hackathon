import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { promisify } from 'node:util';
import { brotliCompress, gzip, constants } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const brotli = promisify(brotliCompress), gzipAsync = promisify(gzip);
const align = length => Math.ceil(length / 4) * 4;

export function readGlb(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error('Invalid GLB header.');
  const jsonLength = bytes.readUInt32LE(12);
  const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const binaryOffset = 28 + jsonLength;
  return { document, binary: bytes.subarray(binaryOffset, binaryOffset + bytes.readUInt32LE(binaryOffset - 8)) };
}

export function shareTextures(bytes, imageVariants = new Map()) {
  const { document, binary } = readGlb(bytes);
  const textures = new Map(), imageViews = new Set();
  for (const image of document.images || []) {
    if (image.bufferView === undefined) continue;
    const view = document.bufferViews[image.bufferView];
    if (view.buffer !== 0) throw new Error('Only embedded GLB buffers are supported.');
    const source = binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    const sourceHash = createHash('sha256').update(source).digest('hex');
    const data = imageVariants.get(sourceHash) || source;
    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[image.mimeType];
    if (!extension) throw new Error(`Unsupported image format: ${image.mimeType}`);
    const hash = createHash('sha256').update(data).digest('hex');
    const uri = `shared-textures/${hash}.${extension}`;
    textures.set(uri, data); imageViews.add(image.bufferView);
    delete image.bufferView; image.uri = uri;
  }
  const remap = new Map(), views = [], parts = [];
  let offset = 0;
  for (const [index, view] of document.bufferViews.entries()) {
    if (imageViews.has(index)) continue;
    if (view.buffer !== 0) throw new Error('Only embedded GLB buffers are supported.');
    const data = binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    remap.set(index, views.length);
    views.push({ ...view, byteOffset: offset });
    const padded = Buffer.alloc(align(data.length)); data.copy(padded);
    parts.push(padded); offset += padded.length;
  }
  document.bufferViews = views;
  function updateReferences(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'bufferView' && Number.isInteger(child)) {
        if (!remap.has(child)) throw new Error('An image buffer view is also used by geometry.');
        value[key] = remap.get(child);
      } else updateReferences(child);
    }
  }
  updateReferences(document);
  document.buffers[0].byteLength = offset;
  const json = Buffer.from(JSON.stringify(document));
  const paddedJson = Buffer.alloc(align(json.length), 0x20); json.copy(paddedJson);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + paddedJson.length + offset, 8);
  header.writeUInt32LE(paddedJson.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const binaryHeader = Buffer.alloc(8); binaryHeader.writeUInt32LE(offset, 0); binaryHeader.writeUInt32LE(0x004e4942, 4);
  return { bytes: Buffer.concat([header, paddedJson, binaryHeader, ...parts]), textures };
}

export async function prepareAssets(directory) {
  const files = (await readdir(directory)).filter(name => name.endsWith('.glb') && !/-[a-f0-9]{20}\.glb$/.test(name));
  const textures = new Map(), manifest = {}, imageVariants = new Map();
  const stats = { models: files.length, sourceBytes: 0, modelBytes: 0, brotliBytes: 0, sharedTextureBytes: 0 };
  await mkdir(path.join(directory, 'shared-textures'), { recursive: true });
  for (const name of files) {
    const file = path.join(directory, name), original = await readFile(file);
    const { document, binary } = readGlb(original);
    for (const image of document.images || []) {
      if (image.mimeType !== 'image/png' || image.bufferView === undefined) continue;
      const view = document.bufferViews[image.bufferView];
      const data = binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
      const hash = createHash('sha256').update(data).digest('hex');
      if (imageVariants.has(hash)) continue;
      const encoded = await sharp(data).png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 }).toBuffer();
      imageVariants.set(hash, encoded.length < data.length ? encoded : data);
    }
    const optimized = shareTextures(original, imageVariants);
    for (const [uri, data] of optimized.textures) textures.set(uri, data);
    const hash = createHash('sha256').update(optimized.bytes).digest('hex').slice(0, 20);
    const versioned = name.replace('.glb', `-${hash}.glb`);
    const [br, gz] = await Promise.all([brotli(optimized.bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }), gzipAsync(optimized.bytes, { level: 9 })]);
    for (const filename of [name, versioned]) {
      await writeFile(path.join(directory, filename), optimized.bytes);
      await writeFile(path.join(directory, `${filename}.br`), br); await writeFile(path.join(directory, `${filename}.gz`), gz);
    }
    stats.modelBytes += optimized.bytes.length; stats.brotliBytes += br.length;
    manifest[name.replace('.glb', '')] = `/assets/${versioned}`;
    stats.sourceBytes += original.length;
  }
  for (const [uri, data] of textures) { await writeFile(path.join(directory, uri), data); stats.sharedTextureBytes += data.length; }
  for (const name of (await readdir(directory)).filter(name => /\.(js|css)$/.test(name))) {
    const bytes = await readFile(path.join(directory, name));
    const [br, gz] = await Promise.all([brotli(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }), gzipAsync(bytes, { level: 9 })]);
    await writeFile(path.join(directory, `${name}.br`), br); await writeFile(path.join(directory, `${name}.gz`), gz);
  }
  stats.downloadBytes = stats.brotliBytes + stats.sharedTextureBytes;
  await writeFile(path.join(directory, 'delivery-stats.json'), JSON.stringify(stats, null, 2));
  await writeFile(path.join(directory, 'model-manifest.json'), JSON.stringify(manifest));
  return stats;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = fileURLToPath(new URL('../dist/assets/', import.meta.url));
  const stats = await prepareAssets(directory);
  console.log(`3D download: ${(stats.sourceBytes / 1e6).toFixed(2)} MB -> ${(stats.downloadBytes / 1e6).toFixed(2)} MB; textures shared without changing geometry or pixels.`);
}
