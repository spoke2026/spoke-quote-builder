import type { NextApiRequest, NextApiResponse } from 'next';
import { randomUUID } from 'crypto';
import { requireUser } from '@/lib/supabase/api';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Mints a short-lived signed upload URL so the browser can PUT the file
 * STRAIGHT to Supabase Storage.
 *
 * The file must never travel through this function. Vercel hard-caps a
 * function request body at 4.5MB regardless of any `bodyParser.sizeLimit`, so
 * routing an image through here reintroduces the FUNCTION_PAYLOAD_TOO_LARGE we
 * are removing. Only the tiny JSON descriptor comes here; the bytes go direct.
 */

export const BUCKET = 'quote-images';

const MAX_BYTES = 20 * 1024 * 1024;

// No image/svg+xml. An SVG opened directly from the public bucket URL executes
// its own script, and these objects are world-readable so customers can view
// quotes without a session.
const ALLOWED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
];

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

let bucketReady = false;

async function ensureBucket(): Promise<void> {
  if (bucketReady) return;

  const { data } = await supabaseAdmin.storage.getBucket(BUCKET);

  if (!data) {
    const { error } = await supabaseAdmin.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: ALLOWED_TYPES,
    });
    // Two uploads racing on a cold start both see "missing" and both create.
    // The loser's "already exists" is success, not failure.
    if (error && !/exist/i.test(error.message)) throw error;
  }

  bucketReady = true;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { contentType, kind } = req.body ?? {};

  if (typeof contentType !== 'string' || !ALLOWED_TYPES.includes(contentType)) {
    return res.status(400).json({ error: 'That file type is not supported. Use a PNG, JPG, WEBP, GIF or AVIF.' });
  }

  const folder = kind === 'product' ? 'products' : 'quotes';
  const path = `${folder}/${randomUUID()}.${EXTENSIONS[contentType]}`;

  try {
    await ensureBucket();

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);

    if (error || !data) throw error ?? new Error('No signed URL returned');

    const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(data.path);

    return res.status(200).json({
      bucket: BUCKET,
      path: data.path,
      token: data.token,
      publicUrl: pub.publicUrl,
    });
  } catch (err) {
    console.error('Signed upload URL failed:', err);
    return res.status(500).json({ error: "We couldn't start that upload. Try again." });
  }
}
