export interface StoredFile {
  /** Storage key, e.g. "exports/animals-2026-07-25.csv". */
  key: string;
  url?: string;
}

/**
 * File storage port used by uploads and CSV/PDF exports.
 * Drivers: local disk (development) and MongoDB GridFS (production).
 */
export interface StoragePort {
  put(key: string, contents: Buffer, contentType: string): Promise<StoredFile>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export const STORAGE_PORT = Symbol('STORAGE_PORT');
