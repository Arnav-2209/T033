import bcrypt from 'bcryptjs';

const BCRYPT_COST = 12;
export const MIN_PASSWORD_CHARACTERS = 12;
export const MAX_PASSWORD_BYTES = 72;

export function isAcceptablePassword(password: string): boolean {
  return (
    password.length >= MIN_PASSWORD_CHARACTERS &&
    Buffer.byteLength(password, 'utf8') <= MAX_PASSWORD_BYTES
  );
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}
