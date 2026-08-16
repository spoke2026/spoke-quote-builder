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
 * Existing quotes that still hold data URLs keep rendering unchanged — an
 * <img src> does not care which of the two it is given.
 */

export type UploadKind = 'product' | 'quote';

const MAX_BYTES = 20 * 1024 * 1024;

export async function uploadImage(file: File, kind: UploadKind): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('That file is not an image.');
  }

  if (file.size > MAX_BYTES) {
    throw new Error(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is 20MB.`);
  }

  const res = await fetch('/api/uploads/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType: file.type, kind }),
  });

  const signed = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(signed.error ?? "We couldn't start that upload. Try again.");

  const supabase = createClient();
  const { error } = await supabase.storage
    .from(signed.bucket)
    .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });

  if (error) {
    console.error('Storage upload failed:', error);
    throw new Error("That image didn't upload. Try again.");
  }

  return signed.publicUrl as string;
}

export async function uploadImages(files: File[], kind: UploadKind): Promise<string[]> {
  return Promise.all(files.map((file) => uploadImage(file, kind)));
}
