import { randomUUID } from 'node:crypto';

export class CameoAssetStore {
  constructor({ createId = randomUUID } = {}) {
    this.createId = createId;
    this.assets = new Map();
  }

  create(bytes) {
    const characterId = this.createId();
    this.assets.set(characterId, { bytes: Buffer.from(bytes), references: 0 });
    return characterId;
  }

  retain(characterId) {
    const asset = this.assets.get(characterId);
    if (!asset) return false;
    asset.references += 1;
    return true;
  }

  release(characterId) {
    const asset = this.assets.get(characterId);
    if (!asset) return;
    asset.references -= 1;
    if (asset.references <= 0) this.assets.delete(characterId);
  }

  discard(characterId) {
    this.assets.delete(characterId);
  }

  get(characterId) {
    return this.assets.get(characterId)?.bytes ?? null;
  }

  clear() {
    this.assets.clear();
  }
}
