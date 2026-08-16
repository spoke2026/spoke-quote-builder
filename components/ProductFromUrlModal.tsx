import React, { useState } from 'react';
import { uploadImages } from '@/lib/uploads';

interface ExtractedProduct {
  name: string;
  supplierSku: string;
  spokeSku: string;
  supplier: string;
  shortDescription: string;
  description: string;
  features: string[];
  sizes: string;
  colours: string;
  category: string;
  gender: string;
  composition: string;
  imageUrls: string[];
  sourceUrl: string;
}

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

export default function ProductFromUrlModal({ onClose, onSaved }: Props) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [product, setProduct] = useState<ExtractedProduct | null>(null);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{ existingId: string; existingName: string } | null>(null);

  async function handleExtract() {
    if (!url.trim()) return;
    setLoading(true);
    setStatus('Fetching page and extracting product data...');
    setProduct(null);
    setDuplicateInfo(null);

    try {
      const res = await fetch('/api/products/scrape-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProduct(data.product);
      setSelectedImages(data.product.imageUrls?.slice(0, 3) || []);
      setStatus('');
    } catch (err: unknown) {
      setStatus('Error: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setUploading(true);
    setStatus('');
    try {
      const urls = await uploadImages(list, 'product');
      setUploadedImages(prev => [...prev, ...urls]);
      setSelectedImages(prev => [...prev, ...urls]);
    } catch (err: unknown) {
      setStatus('Error: ' + (err instanceof Error ? err.message : "Those images didn't upload. Try again."));
    } finally {
      setUploading(false);
    }
  }

  function toggleImage(img: string) {
    setSelectedImages(prev => prev.includes(img) ? prev.filter(i => i !== img) : [...prev, img]);
  }

  function updateField(field: keyof ExtractedProduct, value: string | string[]) {
    setProduct(prev => prev ? { ...prev, [field]: value } : prev);
  }

  async function handleSave(forceUpdate = false) {
    if (!product) return;
    setSaving(true);
    setDuplicateInfo(null);
    try {
      const productData = { ...product, imageUrls: selectedImages };

      if (forceUpdate && duplicateInfo) {
        // Update existing product
        const res = await fetch('/api/products/save-product', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: duplicateInfo.existingId, product: productData }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
      } else {
        // Try to create new
        const res = await fetch('/api/products/save-product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product: productData }),
        });
        const data = await res.json();
        if (res.status === 409) {
          // Duplicate found
          setDuplicateInfo({ existingId: data.existingId, existingName: data.existingName });
          setStatus('');
          setSaving(false);
          return;
        }
        if (!res.ok) throw new Error(data.error);
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      setStatus('Save failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="spoke-modal-scrim">
      <div className="spoke-modal">
        <div className="spoke-modal-head">
          <div>
            <div className="spoke-modal-title">Add Product from URL</div>
            <div className="spoke-modal-sub">Paste a supplier product URL and we&apos;ll extract the details</div>
          </div>
          <button onClick={onClose} className="spoke-modal-close" aria-label="Close">×</button>
        </div>

        <div className="spoke-modal-body">
          <div className="url-row">
            <input className="spoke-input" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleExtract()}
              placeholder="https://www.eskosafety.com/products/..." />
            <button onClick={handleExtract} disabled={loading || !url.trim()} className="spoke-btn spoke-btn--primary spoke-btn--compact">
              {loading ? 'Extracting...' : 'Extract'}
            </button>
          </div>

          {status && (
            <div className={`spoke-alert ${status.startsWith('Error') ? 'spoke-alert--error' : 'spoke-alert--info'}`} role="status">
              {status}
            </div>
          )}

          {/* Duplicate warning */}
          {duplicateInfo && (
            <div className="spoke-alert spoke-alert--warning" role="alert">
              <div className="spoke-alert-title">⚠ Product already exists</div>
              <div className="dup-body">
                A product with SKU &quot;{product?.supplierSku}&quot; already exists: &quot;{duplicateInfo.existingName}&quot;
              </div>
              <div className="dup-actions">
                <button onClick={() => handleSave(true)} className="spoke-btn spoke-btn--primary spoke-btn--compact">
                  Update existing product
                </button>
                <button onClick={() => setDuplicateInfo(null)} className="spoke-btn spoke-btn--secondary spoke-btn--compact">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {product && !duplicateInfo && (
            <>
              <div className="spoke-modal-grid">
                <Field label="Product Name" value={product.name} onChange={v => updateField('name', v)} />
                <Field label="Supplier SKU / Code" value={product.supplierSku} onChange={v => updateField('supplierSku', v)} />
                <Field label="Spoke SKU" value={product.spokeSku || ''} onChange={v => updateField('spokeSku', v)} />
                <Field label="Supplier / Brand" value={product.supplier} onChange={v => updateField('supplier', v)} />
                <Field label="Category" value={product.category} onChange={v => updateField('category', v)} />
                <Field label="Gender" value={product.gender || ''} onChange={v => updateField('gender', v)} />
                <Field label="Size Range" value={product.sizes} onChange={v => updateField('sizes', v)} />
                <Field label="Colour Options" value={product.colours} onChange={v => updateField('colours', v)} />
              </div>
              <Field label="Short Description" value={product.shortDescription} onChange={v => updateField('shortDescription', v)} />
              <FieldTextarea label="Full Description" value={product.description} onChange={v => updateField('description', v)} />
              <Field label="Composition / Materials" value={product.composition || ''} onChange={v => updateField('composition', v)} />

              <div className="spoke-field">
                <label htmlFor="url-features">Features (one per line)</label>
                <textarea id="url-features" className="spoke-textarea" rows={4}
                  value={product.features?.join('\n') || ''}
                  onChange={e => updateField('features', e.target.value.split('\n'))} />
              </div>

              <div className="spoke-field">
                <label htmlFor="url-images">Images — tick to include</label>
                <input id="url-images" type="file" accept="image/*" multiple onChange={handleImageUpload} className="spoke-file" disabled={uploading} />
                {uploading && <p className="spoke-help">Uploading images…</p>}
                <div className="spoke-image-grid">
                  {[...(product.imageUrls || []), ...uploadedImages].map((img, i) => (
                    <div key={i} onClick={() => toggleImage(img)}
                      className={`spoke-image-tile spoke-image-tile--selectable${selectedImages.includes(img) ? ' spoke-image-tile--selected' : ''}`}>
                      <img src={img} alt=""
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      {selectedImages.includes(img) && (
                        <div className="spoke-image-tick">✓</div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="image-count">{selectedImages.length} image{selectedImages.length !== 1 ? 's' : ''} selected</div>
              </div>

              <div className="spoke-alert spoke-alert--info">
                <strong>Pricing:</strong> Saved with $0.00 pricing. Add T1/T2/T3 prices in Google Sheet, then click &quot;Sync from Google Sheets&quot;.
              </div>

              <button onClick={() => handleSave(false)} disabled={saving || uploading} className="spoke-btn spoke-btn--primary">
                {saving ? 'Saving...' : 'Save Product'}
              </button>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        .url-row { display: flex; gap: 8px; }
        .url-row :global(.spoke-input) { flex: 1; min-width: 0; }
        .url-row :global(.spoke-btn) { white-space: nowrap; }
        .dup-body { margin-bottom: 12px; }
        .dup-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .image-count { font-size: .78rem; color: var(--spoke-mineral-80); margin-top: 6px; }
      `}</style>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="spoke-field">
      <label>{label}
        <input className="spoke-input" value={value || ''} onChange={e => onChange(e.target.value)} />
      </label>
    </div>
  );
}

function FieldTextarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="spoke-field">
      <label>{label}
        <textarea className="spoke-textarea" rows={3} value={value || ''} onChange={e => onChange(e.target.value)} />
      </label>
    </div>
  );
}
