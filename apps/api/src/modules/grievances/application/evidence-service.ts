import { createHash, randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import type { GrievanceEvidence } from '@sgrs/contracts';
import { AppError } from '../../../infrastructure/errors/app-error.js';
import type { EvidenceMetadataInput, GrievanceActor, GrievanceRepository } from './ports.js';
import type { EvidenceStorage } from './storage.js';

export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
export const MAX_EVIDENCE_FILES_PER_REQUEST = 10;

export interface IncomingEvidence {
  fileName: string;
  claimedMimeType: string;
  bytes: Uint8Array;
  truncated?: boolean;
}

export interface RejectedEvidence {
  fileName: string;
  code: 'FILE_TOO_LARGE' | 'UNSUPPORTED_TYPE' | 'CONTENT_MISMATCH' | 'EMPTY_FILE';
  message: string;
}

function cleanFileName(value: string): string {
  const leaf = basename(value.replace(/\\/g, '/'))
    .replace(/[\p{Cc}"<>]/gu, '_')
    .trim()
    .slice(0, 255);
  return leaf || 'evidence';
}

function sniffMimeType(bytes: Uint8Array): string | null {
  if (bytes.length >= 5 && Buffer.from(bytes.subarray(0, 5)).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (pngSignature.every((value, index) => bytes[index] === value)) return 'image/png';
  return null;
}

function rejection(file: IncomingEvidence, code: RejectedEvidence['code'], message: string) {
  return { fileName: cleanFileName(file.fileName), code, message };
}

export class EvidenceService {
  constructor(
    private readonly repository: GrievanceRepository,
    private readonly storage: EvidenceStorage,
  ) {}

  async upload(
    actor: GrievanceActor,
    grievanceId: string,
    files: IncomingEvidence[],
    requestId: string,
  ): Promise<{
    items: GrievanceEvidence[];
    rejectedFiles: RejectedEvidence[];
  }> {
    if (actor.role !== 'STUDENT') {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Only students can upload evidence to their grievances.',
      );
    }
    if (files.length > MAX_EVIDENCE_FILES_PER_REQUEST) {
      throw new AppError(
        413,
        'FILE_COUNT_LIMIT',
        `Upload at most ${MAX_EVIDENCE_FILES_PER_REQUEST} files at a time.`,
      );
    }

    const rejectedFiles: RejectedEvidence[] = [];
    const accepted: Array<{ input: IncomingEvidence; mediaType: string }> = [];
    for (const file of files) {
      const fileName = cleanFileName(file.fileName);
      if (file.truncated || file.bytes.byteLength > MAX_EVIDENCE_BYTES) {
        rejectedFiles.push(rejection(file, 'FILE_TOO_LARGE', 'File must be 5 MiB or smaller.'));
        continue;
      }
      if (file.bytes.byteLength === 0) {
        rejectedFiles.push(rejection(file, 'EMPTY_FILE', 'File is empty.'));
        continue;
      }

      const extension = fileName.toLowerCase().split('.').pop();
      const allowedExtension = ['pdf', 'jpg', 'jpeg', 'png'].includes(extension ?? '');
      const detected = sniffMimeType(file.bytes);
      const claimed = file.claimedMimeType.toLowerCase();
      const allowedMime = ['application/pdf', 'image/jpeg', 'image/png'].includes(claimed);
      if (!allowedExtension || !allowedMime) {
        rejectedFiles.push(
          rejection(file, 'UNSUPPORTED_TYPE', 'Only PDF, JPG and PNG files are accepted.'),
        );
        continue;
      }
      if (!detected || detected !== claimed) {
        rejectedFiles.push(
          rejection(file, 'CONTENT_MISMATCH', 'File content does not match its declared type.'),
        );
        continue;
      }
      accepted.push({ input: { ...file, fileName }, mediaType: detected });
    }

    if (rejectedFiles.length) {
      await this.repository.auditRejectedEvidence(
        actor,
        grievanceId,
        rejectedFiles.length,
        requestId,
      );
    }

    const storedKeys: string[] = [];
    try {
      const metadata: EvidenceMetadataInput[] = [];
      for (const { input, mediaType } of accepted) {
        const storageKey = randomUUID();
        await this.storage.put(storageKey, input.bytes);
        storedKeys.push(storageKey);
        metadata.push({
          uploadedById: actor.userId,
          originalName: input.fileName,
          storageKey,
          mediaType,
          sizeBytes: input.bytes.byteLength,
          sha256: createHash('sha256').update(input.bytes).digest(),
        });
      }
      const items = metadata.length
        ? await this.repository.addEvidence(actor, grievanceId, metadata, requestId)
        : [];
      return { items, rejectedFiles };
    } catch (error) {
      await Promise.all(storedKeys.map((key) => this.storage.delete(key)));
      throw error;
    }
  }

  async open(
    actor: GrievanceActor,
    grievanceId: string,
    evidenceId: string,
    requestId: string,
  ): Promise<{
    stream: NodeJS.ReadableStream;
    mediaType: string;
    originalName: string;
  }> {
    const metadata = await this.repository.getEvidence(actor, grievanceId, evidenceId, requestId);
    try {
      return { stream: this.storage.open(metadata.storageKey), ...metadata };
    } catch {
      throw new AppError(404, 'EVIDENCE_NOT_FOUND', 'Evidence was not found.');
    }
  }
}
