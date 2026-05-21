import React, { useState } from 'react';

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

  async function handleExtract() {
    if (!url.trim()) return;
    setLoading(true);
    setStatus('Fetching page and extracting product data...');
    setProduct(null);

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

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setUploadedImages(prev => [...prev, dataUrl]);
        setSelectedImages(prev => [...prev, dataUrl]);
      };
      reader.readAsDataURL(file);
    });
  }

  function toggleImage(img: string) {
    setSelectedImages(prev =>
      prev.includes(img) ? prev.filter(i => i !== img) : [...prev, img]
    );
  }

  function updateField(field: keyof ExtractedProduct, value: string | string[]) {
    setProduct(prev => prev ? { ...prev, [field]: value } : prev);
  }

  async function handleSave() {
    if (!product) return;
    setSaving(true);
    try {
      const res = await fetch('/api/products/save-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: { ...product, imageUrls: selectedImages },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSaved();
      onClose();
    } catch (err: unknown) {
      setStatus('Save failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }
return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '20px',
    }}>
      <div style={{
        background: '#40514F', borderRadius: '8px', width: '100%', maxWidth: '760px',
        maxHeight: '90vh', overflow: 'auto', color: '#fff',
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.12)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'DM Serif Display, Georgia, serif', fontStyle: 'italic', fontSize: '22px', color: '#BEDA81' }}>Add Product from URL</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>Paste a supplier product URL and we'll extract the details</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '24px', cursor: 'pointer', padding: '4px' }}>×</button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input value={url} onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleExtract()}
              placeholder="https://www.eskosafety.com/products/..."
              style={{ flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: '#fff', padding: '10px 12px', fontSize: '13px' }} />
            <button onClick={handleExtract} disabled={loading || !url.trim()}
              style={{ background: '#BEDA81', color: '#40514F', border: 'none', borderRadius: '4px', padding: '10px 20px', fontWeight: '800', fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', opacity: loading ? 0.5 : 1, whiteSpace: 'nowrap' }}>
              {loading ? 'Extracting...' : 'Extract'}
            </button>
          </div>

          {status && (
            <div style={{ padding: '10px 12px', borderRadius: '4px', marginBottom: '16px', fontSize: '13px',
              background: status.startsWith('Error') ? 'rgba(255,80,80,0.15)' : 'rgba(190,218,129,0.15)',
              color: status.startsWith('Error') ? '#ff9999' : '#BEDA81',
              border: `1px solid ${status.startsWith('Error') ? 'rgba(255,80,80,0.3)' : 'rgba(190,218,129,0.3)'}` }}>
              {status}
            </div>
          )}

          {product && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Field label="Product Name" value={product.name} onChange={v => updateField('name', v)} />
                <Field label="Supplier SKU / Code" value={product.supplierSku} onChange={v => updateField('supplierSku', v)} />
                <Field label="Spoke SKU" value={product.spokeSku || ''} onChange={v => updateField('spokeSku', v)} />
                <Field label="Supplier / Brand" value={product.supplier} onChange={v => updateField('supplier', v)} />
                <Field label="Category" value={product.category} onChange={v => updateField('category', v)} />
                <Field label="Gender" value={product.gender || ''} onChange={v => updateField('gender', v)} />
                <Field label="Size Range" value={product.sizes} onChange={v => updateField('sizes', v)} />
                <Field label="Colour Options" value={product.colours} onChange={v => updateField('colours', v)} />
              </div>
              <Field label="Short Description (tagline)" value={product.shortDescription} onChange={v => updateField('shortDescription', v)} />
              <FieldTextarea label="Full Description" value={product.description} onChange={v => updateField('description', v)} />
              <Field label="Composition / Materials" value={product.composition || ''} onChange={v => updateField('composition', v)} />
              <div>
                <label style={{ display: 'block', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#BEDA81', fontWeight: '700', marginBottom: '6px' }}>Features (one per line)</label>
                <textarea value={product.features?.join('\n') || ''} onChange={e => updateField('features', e.target.value.split('\n'))} rows={4}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '4px', color: '#fff', padding: '9px 11px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#BEDA81', fontWeight: '700', marginBottom: '8px' }}>Images — tick to include, or upload your own</label>
                <div style={{ marginBottom: '10px' }}>
                  <input type="file" accept="image/*" multiple onChange={handleImageUpload} style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px' }}>
                  {[...(product.imageUrls || []), ...uploadedImages].map((img, i) => (
                    <div key={i} onClick={() => toggleImage(img)}
                      style={{ border: `2px solid ${selectedImages.includes(img) ? '#BEDA81' : 'rgba(255,255,255,0.15)'}`, borderRadius: '4px', overflow: 'hidden', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', position: 'relative' }}>
                      <img src={img} alt="" style={{ width: '100%', height: '80px', objectFit: 'contain', background: '#fff' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      {selectedImages.includes(img) && (
                        <div style={{ position: 'absolute', top: '4px', right: '4px', background: '#BEDA81', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#40514F', fontWeight: '700' }}>✓</div>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '6px' }}>{selectedImages.length} image{selectedImages.length !== 1 ? 's' : ''} selected</div>
              </div>
              <div style={{ background: 'rgba(190,218,129,0.1)', border: '1px solid rgba(190,218,129,0.3)', borderRadius: '4px', padding: '12px', fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
                <strong style={{ color: '#BEDA81' }}>Pricing:</strong> This product will be saved with $0.00 pricing. A new row will be added to your Google Sheet — add T1/T2/T3 prices there, then click "Sync from Google Sheets" to activate pricing.
              </div>
              <button onClick={handleSave} disabled={saving}
                style={{ background: '#BEDA81', color: '#40514F', border: 'none', borderRadius: '4px', padding: '14px 24px', fontWeight: '800', fontSize: '13px', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>
                {saving ? 'Saving...' : 'Save Product'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#BEDA81', fontWeight: '700', marginBottom: '4px' }}>{label}</label>
      <input value={value || ''} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '4px', color: '#fff', padding: '8px 10px', fontSize: '13px', fontFamily: 'inherit' }} />
    </div>
  );
}

function FieldTextarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#BEDA81', fontWeight: '700', marginBottom: '4px' }}>{label}</label>
      <textarea value={value || ''} onChange={e => onChange(e.target.value)} rows={3}
        style={{ width: '100%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '4px', color: '#fff', padding: '8px 10px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' }} />
    </div>
  );
}