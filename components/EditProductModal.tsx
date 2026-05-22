import React, { useState, useEffect } from 'react';

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
    imageUrls:        product.image_urls || [],
  });

  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        const dataUrl = ev.target?.result as string;
        setUploadedImages(prev => [...prev, dataUrl]);
        setForm(prev => ({ ...prev, imageUrls: [...prev.imageUrls, dataUrl] }));
      };
      reader.readAsDataURL(file);
    });
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
        body: JSON.stringify({ id: product.id, product: form }),
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
      <div style={{ background: '#40514F', borderRadius: '8px', width: '100%', maxWidth: '760px', maxHeight: '90vh', overflow: 'auto', color: '#fff' }}>
        
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.12)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'DM Serif Display, Georgia, serif', fontStyle: 'italic', fontSize: '22px', color: '#BEDA81' }}>Edit Product</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>{product.name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '24px', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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

          {/* Pricing display (read-only) */}
          <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '12px 14px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#BEDA81', fontWeight: '700', marginBottom: '8px' }}>Current Pricing (edit in Google Sheet)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {[['T1', product.t1_price], ['T2', product.t2_price], ['T3', product.t3_price]].map(([tier, price]) => (
                <div key={tier as string} style={{ background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '3px', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: '2px' }}>{tier}</div>
                  <div style={{ fontSize: '15px', fontWeight: '700', color: '#BEDA81' }}>${Number(price || 0).toFixed(2)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Images */}
          <div>
            <label style={{ display: 'block', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#BEDA81', fontWeight: '700', marginBottom: '8px' }}>
              Images
            </label>
            <input type="file" accept="image/*" multiple onChange={handleImageUpload}
              style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginBottom: '10px', display: 'block' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '8px' }}>
              {form.imageUrls.map((img, i) => (
                <div key={i} style={{ position: 'relative', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '4px', overflow: 'hidden', background: 'rgba(255,255,255,0.05)' }}>
                  <img src={img} alt="" style={{ width: '100%', height: '72px', objectFit: 'contain', background: '#fff' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <button onClick={() => removeImage(i)}
                    style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(255,0,0,0.7)', border: 'none', color: '#fff', borderRadius: '50%', width: '18px', height: '18px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {status && (
            <div style={{ padding: '10px 12px', borderRadius: '4px', fontSize: '13px', background: 'rgba(255,80,80,0.15)', color: '#ff9999', border: '1px solid rgba(255,80,80,0.3)' }}>
              {status}
            </div>
          )}

          <button onClick={handleSave} disabled={saving}
            style={{ background: '#BEDA81', color: '#40514F', border: 'none', borderRadius: '4px', padding: '14px 24px', fontWeight: '800', fontSize: '13px', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
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
