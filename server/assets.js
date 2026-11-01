import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

export function compressedModels(directory) {
  return (request, response, next) => {
    if (!['GET', 'HEAD'].includes(request.method) || !/^\/[a-z0-9-]+\.glb$/.test(request.path) || request.get('range')) return next();
    const encoding = request.acceptsEncodings('br', 'gzip', 'identity');
    response.vary('Accept-Encoding');
    if (!['br', 'gzip'].includes(encoding)) return next();
    const original = path.join(directory, path.basename(request.path));
    const file = `${original}.${encoding === 'br' ? 'br' : 'gz'}`;
    if (!existsSync(file) || !existsSync(original)) return next();
    response.set('Content-Encoding', encoding);
    response.set('Content-Type', 'model/gltf-binary');
    response.set('X-File-Size', String(statSync(original).size));
    response.sendFile(file, error => { if (error) next(error); });
  };
}
