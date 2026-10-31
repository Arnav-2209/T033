import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function createOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

export function tokenMatchesHash(token: string, expectedHash: Uint8Array): boolean {
  const actualHash = hashToken(token);
  return actualHash.length === expectedHash.length && timingSafeEqual(actualHash, expectedHash);
}

export function hashMetadata(value: string | undefined): Buffer | null {
  return value ? createHash('sha256').update(value, 'utf8').digest() : null;
}
