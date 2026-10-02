/**
 * Object storage abstraction. Swap the provider in StorageModule (e.g. an S3
 * driver) without touching callers or the API contract.
 */
export abstract class StorageService {
  abstract put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** Idempotent: deleting a missing key is not an error. */
  abstract delete(key: string): Promise<void>;
  /** Absolute URL or root-relative path the browser can load. */
  abstract publicUrl(key: string): string;
}
