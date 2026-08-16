import { createClient } from '@/lib/supabase/client';

/**
 * Browser-side image upload.
 *
 * Quotes and products used to carry base64 data URLs inline, which meant every
 * image was re-sent in the quote save payload and hit Vercel's 4.5MB function
 * body cap. Images now live in Supabase Storage and only the URL is stored.
 *
 * The bytes go browser -> Supabase directly via a signed URL, so no image ever
 * passes through a Vercel function and the cap does not apply.
 *
 * Images are downscaled and re-encoded before upload. A phone photo is ~4-8MB
 * at 4000px; the largest we ever render it is a 1040px-wide quote hero, so the
 * rest is weight the customer downloads for nothing.
 *
 * Existing quotes that still hold data URLs keep rendering unchanged — an
 * <img src> does not care which of the two it is given.
 */

export type UploadKind = 'product' | 'quote';

export interface UploadOptions {
  /** Longest edge in px after downscaling. */
  maxEdge?: number;
}

/** Refuse before decoding — a huge file can hang the tab in createImageBitmap. */
const SOURCE_MAX_BYTES = 40 * 1024 * 1024;

const DEFAULT_MAX_EDGE = 1600;
const QUALITY = 0.82;

/** Hero fills half a 1040px sheet and is the one image worth extra pixels. */
export const MAX_EDGE_HERO = 1800;
/** Customer logos render at most 330x120. */
export const MAX_EDGE_LOGO = 900;
/** Product galleries render at most 340px tall, but allow room to zoom. */
export const MAX_EDGE_PRODUCT = 1400;

interface Decoded {
  src: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

/**
 * Decode with EXIF orientation applied. Phone photos carry a rotation flag; if
 * it is ignored the canvas copy comes out sideways.
 */
async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        src: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Fall through to the <img> path.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode failed'));
      el.src = url;
    });
    return {
      src: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

/** Exported so it can be exercised in isolation — it is pure apart from canvas. */
export async function downscale(file: File, maxEdge: number): Promise<File> {
  // A GIF may be animated. Canvas would flatten it to a single frame, so leave
  // it alone and accept the size.
  if (file.type === 'image/gif') return file;

  let decoded: Decoded;
  try {
    decoded = await decode(file);
  } catch {
    // Undecodable here does not mean unusable — hand the original to Storage.
    return file;
  }

  const { src, width, height, release } = decoded;
  const scale = Math.min(1, maxEdge / Math.max(width, height));

  // Already small and already compressed: re-encoding would only lose quality.
  if (scale === 1 && (file.type === 'image/jpeg' || file.type === 'image/webp')) {
    release();
    return file;
  }

  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    release();
    return file;
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  release();

  // WebP so logos and product cut-outs keep their transparency. If a browser
  // cannot encode it, toBlob falls back to PNG, which the API route also allows.
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', QUALITY)
  );
  if (!blob) return file;

  // Re-encoding a small PNG can come out larger. Keep whichever is smaller.
  if (blob.size >= file.size && scale === 1) return file;

  const type = blob.type || 'image/webp';
  const ext = type === 'image/png' ? 'png' : 'webp';
  const base = file.name.replace(/\.[^.]+$/, '') || 'image';
  return new File([blob], `${base}.${ext}`, { type });
}

export async function uploadImage(
  file: File,
  kind: UploadKind,
  opts: UploadOptions = {}
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('That file is not an image.');
  }

  if (file.size > SOURCE_MAX_BYTES) {
    throw new Error(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is 40MB.`);
  }

  const prepared = await downscale(file, opts.maxEdge ?? DEFAULT_MAX_EDGE);

  const res = await fetch('/api/uploads/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType: prepared.type, kind }),
  });

  const signed = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(signed.error ?? "We couldn't start that upload. Try again.");

  const supabase = createClient();
  const { error } = await supabase.storage
    .from(signed.bucket)
    .uploadToSignedUrl(signed.path, signed.token, prepared, { contentType: prepared.type });

  if (error) {
    console.error('Storage upload failed:', error);
    throw new Error("That image didn't upload. Try again.");
  }

  return signed.publicUrl as string;
}

export async function uploadImages(
  files: File[],
  kind: UploadKind,
  opts: UploadOptions = {}
): Promise<string[]> {
  return Promise.all(files.map((file) => uploadImage(file, kind, opts)));
}
