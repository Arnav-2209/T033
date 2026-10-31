import { describe, expect, it, vi } from 'vitest';
import { EvidenceService } from './evidence-service.js';
import type { EvidenceMetadataInput, GrievanceRepository } from './ports.js';
import type { EvidenceStorage } from './storage.js';

const pdf = new TextEncoder().encode('%PDF-1.7\ncontent');

describe('EvidenceService', () => {
  it('accepts matching PDF signature, extension, and claimed media type', async () => {
    const addEvidence = vi.fn(async (_actor, _id, files: EvidenceMetadataInput[]) =>
      files.map((file) => ({
        id: 'evidence-1',
        originalName: file.originalName,
        mediaType: file.mediaType,
        sizeBytes: file.sizeBytes,
        uploadedAt: new Date().toISOString(),
      })),
    );
    const repository = {
      addEvidence,
      auditRejectedEvidence: vi.fn(),
    } as unknown as GrievanceRepository;
    const storage = { put: vi.fn(), delete: vi.fn() } as unknown as EvidenceStorage;
    const service = new EvidenceService(repository, storage);
    const result = await service.upload(
      { userId: 'student-1', role: 'STUDENT' },
      'grievance-1',
      [{ fileName: 'report.pdf', claimedMimeType: 'application/pdf', bytes: pdf }],
      'request-1',
    );
    expect(result.items).toHaveLength(1);
    expect(result.rejectedFiles).toEqual([]);
    expect(storage.put).toHaveBeenCalledOnce();
    expect(addEvidence).toHaveBeenCalledOnce();
  });

  it('rejects spoofed MIME and extension while preserving a valid file in the batch', async () => {
    const addEvidence = vi.fn(async (_actor, _id, files: EvidenceMetadataInput[]) =>
      files.map((file) => ({
        id: 'evidence-1',
        originalName: file.originalName,
        mediaType: file.mediaType,
        sizeBytes: file.sizeBytes,
        uploadedAt: new Date().toISOString(),
      })),
    );
    const auditRejectedEvidence = vi.fn();
    const repository = { addEvidence, auditRejectedEvidence } as unknown as GrievanceRepository;
    const storage = { put: vi.fn(), delete: vi.fn() } as unknown as EvidenceStorage;
    const result = await new EvidenceService(repository, storage).upload(
      { userId: 'student-1', role: 'STUDENT' },
      'grievance-1',
      [
        {
          fileName: 'report.pdf',
          claimedMimeType: 'application/pdf',
          bytes: new TextEncoder().encode('<html>'),
        },
        {
          fileName: 'photo.png',
          claimedMimeType: 'image/png',
          bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        },
      ],
      'request-2',
    );
    expect(result.items).toHaveLength(1);
    expect(result.rejectedFiles[0]?.code).toBe('CONTENT_MISMATCH');
    expect(auditRejectedEvidence).toHaveBeenCalledWith(
      { userId: 'student-1', role: 'STUDENT' },
      'grievance-1',
      1,
      'request-2',
    );
    expect(addEvidence).toHaveBeenCalledOnce();
  });

  it('rejects non-student uploads before writing storage', async () => {
    const storage = { put: vi.fn() } as unknown as EvidenceStorage;
    await expect(
      new EvidenceService({} as GrievanceRepository, storage).upload(
        { userId: 'handler-1', role: 'HANDLER' },
        'grievance-1',
        [],
        'request-3',
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(storage.put).not.toHaveBeenCalled();
  });
});
