import type { Readable } from 'node:stream';

export interface EvidenceStorage {
  put(storageKey: string, bytes: Uint8Array): Promise<void>;
  open(storageKey: string): Readable;
  delete(storageKey: string): Promise<void>;
}
