import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabase';
import { requireUser } from '@/lib/supabase/api';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireUser(req, res);
  if (!user) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = process.env.GITHUB_BACKUP_TOKEN;
    const repo = 'spoke2026/spoke-quote-builder';
    const branch = 'main';

    if (!token) {
      return res.status(500).json({ error: 'GITHUB_BACKUP_TOKEN not configured' });
    }

    // Fetch all products and quotes
    const { data: products, error: productsError } = await supabaseAdmin
      .from('products')
      .select('*');

    if (productsError) {
      return res.status(500).json({ error: `Failed to fetch products: ${productsError.message}` });
    }

    const { data: quotes, error: quotesError } = await supabaseAdmin
      .from('quotes')
      .select('*');

    if (quotesError) {
      return res.status(500).json({ error: `Failed to fetch quotes: ${quotesError.message}` });
    }

    // Create backup object
    const backup = {
      timestamp: new Date().toISOString(),
      products: products || [],
      quotes: quotes || [],
      stats: {
        productCount: products?.length || 0,
        quoteCount: quotes?.length || 0,
      },
    };

    const backupJson = JSON.stringify(backup, null, 2);
    const today = new Date().toISOString().split('T')[0];
    const filename = `backup-${today}.json`;
    const filepath = `backups/${filename}`;

    // Get the SHA of the current file if it exists (for update)
    let fileSha: string | undefined;
    try {
      const getRes = await fetch(
        `https://api.github.com/repos/${repo}/contents/${filepath}`,
        { headers: { Authorization: `token ${token}` } }
      );
      if (getRes.ok) {
        const fileData = await getRes.json();
        fileSha = fileData.sha;
      }
    } catch {
      // File doesn't exist, that's fine
    }

    // Push to GitHub
    const pushRes = await fetch(
      `https://api.github.com/repos/${repo}/contents/${filepath}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `token ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Backup: ${today}`,
          content: Buffer.from(backupJson).toString('base64'),
          branch,
          ...(fileSha && { sha: fileSha }),
        }),
      }
    );

    if (!pushRes.ok) {
      const err = await pushRes.text();
      return res.status(500).json({ error: `GitHub push failed: ${err}` });
    }

    // Clean up old backups (keep only last 10 days)
    await cleanupOldBackups(token, repo, branch);

    return res.status(200).json({
      success: true,
      message: `Backup created: ${filename}`,
      stats: backup.stats,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Backup error:', message);
    return res.status(500).json({ error: message });
  }
}

async function cleanupOldBackups(token: string, repo: string, branch: string) {
  try {
    const listRes = await fetch(
      `https://api.github.com/repos/${repo}/contents/backups?ref=${branch}`,
      { headers: { Authorization: `token ${token}` } }
    );

    if (!listRes.ok) return;

    const files = await listRes.json();
    if (!Array.isArray(files)) return;

    const backupFiles = files
      .filter((f: any) => f.name.startsWith('backup-') && f.name.endsWith('.json'))
      .map((f: any) => ({
        name: f.name,
        date: f.name.replace('backup-', '').replace('.json', ''),
        sha: f.sha,
      }))
      .sort((a: any, b: any) => b.date.localeCompare(a.date));

    // Keep only last 10
    const toDelete = backupFiles.slice(10);

    for (const file of toDelete) {
      await fetch(
        `https://api.github.com/repos/${repo}/contents/backups/${file.name}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `token ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: `Delete old backup: ${file.name}`,
            sha: file.sha,
            branch,
          }),
        }
      );
    }
  } catch (err) {
    console.error('Cleanup error:', err);
  }
}
