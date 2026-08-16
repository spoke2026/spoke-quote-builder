import React, { useState } from 'react';
import { uploadImages, MAX_EDGE_PRODUCT } from '@/lib/uploads';

interface ProductData {
  id: string;
  supplier_sku: string;
  spoke_sku: string;
  supplier: string;
  name: string;
  description: string;
  short_description: string;
  size: string;
  colour: string;
  category: string;
  gender: string;
  composition: string;
  features: string[];
  image_urls: string[];
  t1_price: number;
  t2_price: number;
  t3_price: number;
}

interface Props {
  product: ProductData;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditProductModal({ product, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    supplierSku:      product.supplier_sku || '',
    spokeSku:         product.spoke_sku || '',
    supplier:         product.supplier || '',
    name:             product.name || '',
    description:      product.description || '',
    shortDescription: product.short_description || '',
    sizes:            product.size || '',
    colours:          product.colour || '',
    category:         product.category || '',
    gender:           product.gender || '',
    composition:      product.composition || '',
    features:         product.features || [],
    imageUrls:        product.image_urls || [],
  });

  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState('');

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setUploading(true);
    setStatus('');
    try {
      const urls = await uploadImages(list, 'product', { maxEdge: MAX_EDGE_PRODUCT });
      setUploadedImages(prev => [...prev, ...urls]);
      setForm(prev => ({ ...prev, imageUrls: [...prev.imageUrls, ...urls] }));
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : "Those images didn't upload. Try again.");
    } finally {
      setUploading(false);
    }
  }

  function removeImage(idx: number) {
    setForm(prev => ({ ...prev, imageUrls: prev.imageUrls.filter((_, i) => i !== idx) }));
  }

  async function handleSave() {
    setSaving(true);
    setStatus('');
    try {
      const res = await fetch('/api/products/save-product', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: product.id, product: { ...form, features: form.features.map(f => f.trim()).filter(Boolean) } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSaved();
      onClose();
    } catch (err: unknown) {
      setStatus('Error: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="spoke-modal-scrim">
      <div className="spoke-modal">

        <div className="spoke-modal-head">
          <div>
            <div className="spoke-modal-title">Edit Product</div>
            <div className="spoke-modal-sub">{product.name}</div>
          </div>
          <button onClick={onClose} className="spoke-modal-close" aria-label="Close">×</button>
        </div>

        <div className="spoke-modal-body">

          <div className="spoke-modal-grid">
            <Field label="Product Name" value={form.name} onChange={v => update('name', v)} />
            <Field label="Supplier SKU" value={form.supplierSku} onChange={v => update('supplierSku', v)} />
            <Field label="Spoke SKU" value={form.spokeSku} onChange={v => update('spokeSku', v)} />
            <Field label="Supplier" value={form.supplier} onChange={v => update('supplier', v)} />
            <Field label="Category" value={form.category} onChange={v => update('category', v)} />
            <Field label="Gender" value={form.gender} onChange={v => update('gender', v)} />
            <Field label="Size Range" value={form.sizes} onChange={v => update('sizes', v)} />
            <Field label="Colour Options" value={form.colours} onChange={v => update('colours', v)} />
          </div>

          <Field label="Short Description" value={form.shortDescription} onChange={v => update('shortDescription', v)} />
          <FieldTextarea label="Full Description" value={form.description} onChange={v => update('description', v)} />
          <Field label="Composition / Materials" value={form.composition} onChange={v => update('composition', v)} />

          <div className="spoke-field">
            <label htmlFor="edit-features">Features (one per line)</label>
            <textarea id="edit-features" className="spoke-textarea" rows={4}
              value={form.features.join('\n')}
              onChange={e => setForm(prev => ({ ...prev, features: e.target.value.split('\n') }))} />
          </div>

          {/* Pricing display (read-only) */}
          <div className="spoke-price-panel">
            <div className="spoke-alert-title">Current Pricing (edit in Google Sheet)</div>
            <div className="spoke-price-grid">
              {[['T1', product.t1_price], ['T2', product.t2_price], ['T3', product.t3_price]].map(([tier, price]) => (
                <div key={tier as string} className="spoke-price-tile">
                  <div className="spoke-price-tile-label">{tier}</div>
                  <div className="spoke-price-tile-value">${Number(price || 0).toFixed(2)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Images */}
          <div className="spoke-field">
            <label htmlFor="edit-images">Images</label>
            <input id="edit-images" type="file" accept="image/*" multiple onChange={handleImageUpload} className="spoke-file" disabled={uploading} />
            {uploading && <p className="spoke-help">Uploading images…</p>}
            <div className="spoke-image-grid">
              {form.imageUrls.map((img, i) => (
                <div key={i} className="spoke-image-tile">
                  <img src={img} alt=""
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <button onClick={() => removeImage(i)} className="spoke-image-remove" aria-label="Remove image">×</button>
                </div>
              ))}
            </div>
          </div>

          {status && (
            <div className="spoke-alert spoke-alert--error" role="alert">
              {status}
            </div>
          )}

          <button onClick={handleSave} disabled={saving || uploading} className="spoke-btn spoke-btn--primary">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
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
