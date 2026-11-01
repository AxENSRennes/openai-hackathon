import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

export function preferredCompression(header = '') {
  const weights = new Map(header.toLowerCase().split(',').map(part => {
    const [encoding, ...parameters] = part.trim().split(';');
    const quality = parameters.map(value => value.trim()).find(value => value.startsWith('q='));
    return [encoding, quality ? Number(quality.slice(2)) : 1];
  }));
  const weight = encoding => Math.max(0, Math.min(1, weights.get(encoding) ?? weights.get('*') ?? 0));
  const br = weight('br'), gzip = weight('gzip');
  if ((weights.get('identity') || 0) > Math.max(br, gzip)) return 'identity';
  return br > 0 && br >= gzip ? 'br' : gzip > 0 ? 'gzip' : 'identity';
}

export function immutableAsset(file) {
  return /[/\\]shared-textures[/\\][a-f0-9]{64}\.(png|jpg|webp)$/.test(file) || /-[a-f0-9]{20}\.glb$/.test(file) || /-[a-zA-Z0-9_-]{8}\.(js|css)$/.test(file);
}

export function compressedAssets(directory) {
  return (request, response, next) => {
    if (!['GET', 'HEAD'].includes(request.method) || !/^\/[a-zA-Z0-9_-]+\.(glb|js|css)$/.test(request.path) || request.get('range')) return next();
    const encoding = preferredCompression(request.get('accept-encoding'));
    response.vary('Accept-Encoding');
    if (!['br', 'gzip'].includes(encoding)) return next();
    const original = path.join(directory, path.basename(request.path));
    const file = `${original}.${encoding === 'br' ? 'br' : 'gz'}`;
    if (!existsSync(file) || !existsSync(original)) return next();
    response.set('Content-Encoding', encoding);
    response.set('Content-Type', { '.glb': 'model/gltf-binary', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' }[path.extname(original)]);
    if (original.endsWith('.glb')) response.set('X-File-Size', String(statSync(original).size));
    if (immutableAsset(original)) response.set('Cache-Control', 'public, max-age=31536000, immutable');
    response.sendFile(file, error => { if (error) next(error); });
  };
}
