export class ApiError extends Error {
  code: string;
  constructor(message: string, code = 'error') {
    super(message);
    this.code = code;
  }
}

export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const LOGO_MAX_BYTES = 1_048_576;

export function assertLogo(file: File): void {
  if (!LOGO_TYPES.includes(file.type)) throw new ApiError('Logo must be a PNG, JPEG or WebP image.', 'invalid');
  if (file.size > LOGO_MAX_BYTES) throw new ApiError('Logo must be 1 MB or smaller.', 'invalid');
}
