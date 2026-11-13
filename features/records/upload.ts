/**
 * Report upload rules shared by the upload screen and the server.
 * Mirrors the checks on `public.health_reports` and the `health-reports` bucket (4001/4003).
 */
import { REPORT_CATEGORIES } from './types.ts';
import type { ReportCategory } from './types.ts';

export const MAX_REPORT_BYTES = 20 * 1024 * 1024;

export const ALLOWED_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/webp': 'webp',
};

export const REPORT_BUCKET = 'health-reports';

export interface PickedFile {
  name: string;
  mimeType: string | null;
  sizeBytes: number;
}

export type UploadValidationError = 'no_category' | 'unsupported_type' | 'empty_file' | 'too_large' | 'no_title';

export const UPLOAD_ERROR_MESSAGES: Record<UploadValidationError, string> = {
  no_category: 'Choose a report category.',
  unsupported_type: 'Upload a PDF or a photo (JPG, PNG, HEIC, WebP).',
  empty_file: 'This file is empty.',
  too_large: 'Files must be 20 MB or smaller.',
  no_title: 'Give the report a name.',
};

const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', webp: 'image/webp',
};

/** Some pickers return no MIME type; fall back to the file extension. */
export function resolveMime(file: PickedFile): string | null {
  if (file.mimeType && ALLOWED_MIME[file.mimeType]) return file.mimeType;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TO_MIME[ext] ?? null;
}

export function validateUpload(input: {
  file: PickedFile;
  category: ReportCategory | null;
  title: string;
}): UploadValidationError[] {
  const errors: UploadValidationError[] = [];
  if (!input.category || !REPORT_CATEGORIES.some((c) => c.key === input.category)) errors.push('no_category');
  if (!resolveMime(input.file)) errors.push('unsupported_type');
  if (input.file.sizeBytes <= 0) errors.push('empty_file');
  else if (input.file.sizeBytes > MAX_REPORT_BYTES) errors.push('too_large');
  if (!input.title.trim()) errors.push('no_title');
  return errors;
}

/** `<patient_id>/<uuid>.<ext>`: the first folder is what storage RLS checks. */
export function reportStoragePath(patientId: string, mimeType: string, id: string = crypto.randomUUID()): string {
  const ext = ALLOWED_MIME[mimeType];
  if (!ext) throw new Error(`Unsupported type ${mimeType}`);
  return `${patientId}/${id}.${ext}`;
}

/** Default title from the file name: "cbc_report-nov.pdf" → "cbc report nov". */
export function defaultTitle(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 200);
}

/** 0..100 for the progress bar; tolerates unknown totals. */
export function progressPercent(sent: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((sent / total) * 100)));
}
