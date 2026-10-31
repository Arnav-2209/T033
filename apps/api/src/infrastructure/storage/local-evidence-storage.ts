import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import type { EvidenceStorage } from '../../modules/grievances/application/storage.js';

export class LocalEvidenceStorage implements EvidenceStorage {
  private readonly root: string;

  constructor(directory: string) {
    this.root = resolve(directory);
  }

  async put(storageKey: string, bytes: Uint8Array): Promise<void> {
    const destination = this.resolveKey(storageKey);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await writeFile(destination, bytes, { flag: 'wx', mode: 0o600 });
  }

  open(storageKey: string) {
    return createReadStream(this.resolveKey(storageKey));
  }

  async delete(storageKey: string): Promise<void> {
    await rm(this.resolveKey(storageKey), { force: true });
  }

  private resolveKey(storageKey: string): string {
    if (!/^[0-9a-f-]{36}$/i.test(storageKey)) throw new Error('Invalid evidence storage key.');
    const path = resolve(this.root, storageKey);
    if (!path.startsWith(`${this.root}${sep}`)) throw new Error('Invalid evidence storage path.');
    return path;
  }
}
