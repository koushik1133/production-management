import React, { useState, useEffect } from 'react';
import { X, Lock, Save, DollarSign, Loader2 } from 'lucide-react';
import type { QuoteRecord, Dealer, CatalogModel, LadOptions } from '../types';

interface EditQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  quote: QuoteRecord | null;
  dealers?: Dealer[];
  catalogModels?: CatalogModel[];
  onSave: (updatedQuote: QuoteRecord) => Promise<void>;
}

export const EditQuoteModal: React.FC<EditQuoteModalProps> = ({
  isOpen,
  onClose,
  quote,
  dealers = [],
  catalogModels = [],
  onSave
}) => {
  const [formData, setFormData] = useState<{
    dealer_name: string;
    model: string;
    sale_price: string;
    trailer_color: string;
    trailer_plug: string;
    sales_person: string;
    dealer_location: string;
    dealer_address: string;
    purchase_order: string;
    consignment: string;
    notes: string;
    ladOptions: LadOptions;
  }>({
    dealer_name: '',
    model: '',
    sale_price: '',
    trailer_color: '',
    trailer_plug: '',
    sales_person: '',
    dealer_location: '',
    dealer_address: '',
    purchase_order: '',
    consignment: '',
    notes: '',
    ladOptions: {
      dualHydraulicJacks: '',
      bumperPullSetup: '',
      dualSidePlatforms: '',
      singleSidePlatforms: ''
    }
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isCustomDealer, setIsCustomDealer] = useState(false);

  useEffect(() => {
    if (isOpen && quote) {
      const existingLad: LadOptions = quote.lad_options || quote.ladOptions || {};
      const knownDealer = dealers.some(d => d.name === quote.dealer_name);

      setIsCustomDealer(!knownDealer && !!quote.dealer_name);
      setFormData({
        dealer_name: quote.dealer_name || '',
        model: quote.model || '',
        sale_price: quote.sale_price !== null && quote.sale_price !== undefined ? String(quote.sale_price) : '',
        trailer_color: quote.trailer_color || '',
        trailer_plug: quote.trailer_plug || '',
        sales_person: quote.sales_person || '',
        dealer_location: quote.dealer_location || '',
        dealer_address: quote.dealer_address || '',
        purchase_order: quote.purchase_order || '',
        consignment: quote.consignment || '',
        notes: quote.notes || '',
        ladOptions: {
          dualHydraulicJacks: existingLad.dualHydraulicJacks !== undefined && existingLad.dualHydraulicJacks !== false ? String(existingLad.dualHydraulicJacks) : '',
          bumperPullSetup: existingLad.bumperPullSetup !== undefined && existingLad.bumperPullSetup !== false ? String(existingLad.bumperPullSetup) : '',
          dualSidePlatforms: existingLad.dualSidePlatforms !== undefined && existingLad.dualSidePlatforms !== false ? String(existingLad.dualSidePlatforms) : '',
          singleSidePlatforms: existingLad.singleSidePlatforms !== undefined && existingLad.singleSidePlatforms !== false ? String(existingLad.singleSidePlatforms) : ''
        }
      });
    }
  }, [isOpen, quote, dealers]);

  if (!isOpen || !quote) return null;

  const isLadModel = formData.model.trim().toUpperCase().startsWith('LAD');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    setIsSaving(true);
    try {
      const cleanPrice = formData.sale_price.trim() ? parseFloat(formData.sale_price.replace(/[^0-9.-]/g, '')) : null;

      const updatedQuote: QuoteRecord = {
        ...quote,
        // Serial number is strictly preserved and cannot be changed
        serial_number: quote.serial_number,
        dealer_name: formData.dealer_name.trim() || undefined,
        model: formData.model.trim() || undefined,
        sale_price: cleanPrice !== null && !isNaN(cleanPrice) ? cleanPrice : null,
        trailer_color: formData.trailer_color.trim() || undefined,
        trailer_plug: formData.trailer_plug.trim() || undefined,
        sales_person: formData.sales_person.trim() || undefined,
        dealer_location: formData.dealer_location.trim() || undefined,
        dealer_address: formData.dealer_address.trim() || undefined,
        purchase_order: formData.purchase_order.trim() || undefined,
        consignment: formData.consignment.trim() || undefined,
        notes: formData.notes.trim() || undefined,
        lad_options: isLadModel ? formData.ladOptions : undefined,
        ladOptions: isLadModel ? formData.ladOptions : undefined
      };

      await onSave(updatedQuote);
      onClose();
    } catch (err) {
      console.error('Failed to update quote:', err);
      alert('Failed to save quote changes.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.72)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem'
    }}>
      <div style={{
        background: 'var(--bg-card, #1e293b)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '680px',
        maxHeight: '92vh',
        overflowY: 'auto',
        border: '1px solid var(--border-default, #334155)',
        boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--border-default, #334155)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          background: 'var(--bg-card, #1e293b)',
          zIndex: 10
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary, #fff)', margin: 0 }}>
                Edit Quote
              </h2>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '6px',
                background: 'rgba(99, 102, 241, 0.15)',
                color: '#818cf8',
                border: '1px solid rgba(99, 102, 241, 0.3)'
              }}>
                #{quote.serial_number}
              </span>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted, #94a3b8)', margin: '0.2rem 0 0 0' }}>
              Update quote pricing, specs, dealer details, and optional configurations.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted, #94a3b8)',
              cursor: 'pointer',
              padding: '0.4rem',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Serial Number (LOCKED) */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '10px',
            padding: '0.85rem 1rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary, #cbd5e1)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Lock size={13} color="#f59e0b" /> Serial Number (Locked)
              </label>
              <span style={{ fontSize: '0.68rem', color: '#f59e0b', fontWeight: 700 }}>
                Cannot be modified
              </span>
            </div>
            <input
              type="text"
              value={quote.serial_number}
              disabled
              readOnly
              style={{
                width: '100%',
                padding: '0.6rem 0.85rem',
                fontSize: '0.9rem',
                fontWeight: 800,
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'rgba(0, 0, 0, 0.25)',
                color: 'var(--text-muted, #94a3b8)',
                cursor: 'not-allowed',
                letterSpacing: '0.04em'
              }}
            />
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted, #64748b)', margin: '0.35rem 0 0 0' }}>
              Serial numbers are unique immutable identifiers tied permanently to quote records.
            </p>
          </div>

          {/* Pricing Highlight */}
          <div style={{
            background: 'rgba(16, 185, 129, 0.06)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            borderRadius: '10px',
            padding: '1rem'
          }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 800, color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.4rem' }}>
              <DollarSign size={15} /> Quote Price ($)
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute',
                left: '0.85rem',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '1rem',
                fontWeight: 800,
                color: '#10b981',
                pointerEvents: 'none'
              }}>$</span>
              <input
                type="text"
                inputMode="decimal"
                value={formData.sale_price}
                onChange={e => setFormData({ ...formData, sale_price: e.target.value.replace(/[^0-9.]/g, '') })}
                placeholder="0.00"
                style={{
                  width: '100%',
                  padding: '0.65rem 1rem 0.65rem 2rem',
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  borderRadius: '8px',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  background: 'var(--bg-card, #1e293b)',
                  color: '#10b981'
                }}
              />
            </div>
          </div>

          {/* Model & Dealer Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            {/* Trailer Model */}
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary, #cbd5e1)', marginBottom: '0.35rem' }}>
                Trailer Model
              </label>
              {catalogModels.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <select
                    value={catalogModels.some(m => m.name === formData.model) ? formData.model : '__custom__'}
                    onChange={e => {
                      if (e.target.value === '__custom__') {
                        setFormData({ ...formData, model: '' });
                      } else {
                        setFormData({ ...formData, model: e.target.value });
                      }
                    }}
                    className="form-select"
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.85rem',
                      fontSize: '0.88rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border-default, #334155)',
                      background: 'var(--bg-card, #1e293b)',
                      color: 'var(--text-primary, #fff)'
                    }}
                  >
                    <option value="">Select Catalog Model...</option>
                    {catalogModels.map(m => (
                      <option key={m.id || m.name} value={m.name}>
                        {m.name} {m.category ? `(${m.category})` : ''}
                      </option>
                    ))}
                    <option value="__custom__">+ Custom Model Name...</option>
                  </select>
                  {(!catalogModels.some(m => m.name === formData.model) || formData.model === '') && (
                    <input
                      type="text"
                      placeholder="Enter custom trailer model..."
                      value={formData.model}
                      onChange={e => setFormData({ ...formData, model: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.85rem',
                        fontSize: '0.85rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-default, #334155)',
                        background: 'var(--bg-card, #1e293b)',
                        color: 'var(--text-primary, #fff)'
                      }}
                    />
                  )}
                </div>
              ) : (
                <input
                  type="text"
                  placeholder="e.g. LAD 2424 - Gooseneck"
                  value={formData.model}
                  onChange={e => setFormData({ ...formData, model: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    fontSize: '0.88rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-default, #334155)',
                    background: 'var(--bg-card, #1e293b)',
                    color: 'var(--text-primary, #fff)'
                  }}
                />
              )}
            </div>

            {/* Dealer Name */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary, #cbd5e1)' }}>
                  Dealer / Customer Name
                </label>
                <button
                  type="button"
                  onClick={() => setIsCustomDealer(!isCustomDealer)}
                  style={{ background: 'transparent', border: 'none', color: '#6366f1', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                >
                  {isCustomDealer ? 'Pick from Dealers' : 'Type Custom'}
                </button>
              </div>
              {!isCustomDealer && dealers.length > 0 ? (
                <select
                  value={formData.dealer_name}
                  onChange={e => {
                    const sel = dealers.find(d => d.name === e.target.value);
                    setFormData({
                      ...formData,
                      dealer_name: e.target.value,
                      dealer_address: sel?.common_address || formData.dealer_address
                    });
                  }}
                  className="form-select"
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    fontSize: '0.88rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-default, #334155)',
                    background: 'var(--bg-card, #1e293b)',
                    color: 'var(--text-primary, #fff)'
                  }}
                >
                  <option value="">Select Dealer...</option>
                  {dealers.map(d => (
                    <option key={d.id || d.name} value={d.name}>{d.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="e.g. Dynamic Cropping Systems"
                  value={formData.dealer_name}
                  onChange={e => setFormData({ ...formData, dealer_name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    fontSize: '0.88rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-default, #334155)',
                    background: 'var(--bg-card, #1e293b)',
                    color: 'var(--text-primary, #fff)'
                  }}
                />
              )}
            </div>
          </div>

          {/* Specifications: Color & Plug */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary, #cbd5e1)', marginBottom: '0.35rem' }}>
                🎨 Trailer Color
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {formData.trailer_color && (
                  <div style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '6px',
                    background: formData.trailer_color,
                    border: '1px solid rgba(255,255,255,0.3)',
                    flexShrink: 0
                  }} />
                )}
                <input
                  type="text"
                  placeholder="e.g. Black, White, Charcoal Gray"
                  value={formData.trailer_color}
                  onChange={e => setFormData({ ...formData, trailer_color: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    fontSize: '0.88rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-default, #334155)',
                    background: 'var(--bg-card, #1e293b)',
                    color: 'var(--text-primary, #fff)'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary, #cbd5e1)', marginBottom: '0.35rem' }}>
                🔌 Trailer Plug
              </label>
              <select
                value={formData.trailer_plug}
                onChange={e => setFormData({ ...formData, trailer_plug: e.target.value })}
                className="form-select"
                style={{
                  width: '100%',
                  padding: '0.6rem 0.85rem',
                  fontSize: '0.88rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-default, #334155)',
                  background: 'var(--bg-card, #1e293b)',
                  color: 'var(--text-primary, #fff)'
                }}
              >
                <option value="">Select Plug...</option>
                <option value="7 RV Molded Plug">7 RV Molded Plug</option>
                <option value="7 Pole Semi Plug">7 Pole Semi Plug</option>
                <option value="6 Pole Molded Plug">6 Pole Molded Plug</option>
                <option value="4 Way Flat">4 Way Flat</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary, #cbd5e1)', marginBottom: '0.35rem' }}>
                👤 Salesperson
              </label>
              <input
                type="text"
                placeholder="e.g. Jerry Morberg"
                value={formData.sales_person}
                onChange={e => setFormData({ ...formData, sales_person: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.85rem',
                  fontSize: '0.88rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-default, #334155)',
                  background: 'var(--bg-card, #1e293b)',
                  color: 'var(--text-primary, #fff)'
                }}
              />
            </div>
          </div>

          {/* Location & Orders */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary, #cbd5e1)', marginBottom: '0.35rem' }}>
                📍 Dealer Location (City, State)
              </label>
              <input
                type="text"
                placeholder="e.g. Dallas, TX"
                value={formData.dealer_location}
                onChange={e => setFormData({ ...formData, dealer_location: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.85rem',
                  fontSize: '0.88rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-default, #334155)',
                  background: 'var(--bg-card, #1e293b)',
                  color: 'var(--text-primary, #fff)'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary, #cbd5e1)', marginBottom: '0.35rem' }}>
                📑 Purchase Order (PO #)
              </label>
              <input
                type="text"
                placeholder="e.g. PO-88219"
                value={formData.purchase_order}
                onChange={e => setFormData({ ...formData, purchase_order: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.85rem',
                  fontSize: '0.88rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-default, #334155)',
                  background: 'var(--bg-card, #1e293b)',
                  color: 'var(--text-primary, #fff)'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary, #cbd5e1)', marginBottom: '0.35rem' }}>
                📦 Consignment
              </label>
              <input
                type="text"
                placeholder="e.g. CS-4401"
                value={formData.consignment}
                onChange={e => setFormData({ ...formData, consignment: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.85rem',
                  fontSize: '0.88rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-default, #334155)',
                  background: 'var(--bg-card, #1e293b)',
                  color: 'var(--text-primary, #fff)'
                }}
              />
            </div>
          </div>

          {/* LAD Drone Trailer Configuration (Optional) */}
          {isLadModel && (
            <div style={{
              background: 'rgba(37, 99, 235, 0.06)',
              border: '1.5px solid rgba(37, 99, 235, 0.25)',
              borderRadius: '12px',
              padding: '1.1rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#3b82f6', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                    LAD Drone Trailer Configuration (Optional)
                  </span>
                  <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: '#dbeafe', color: '#1e40af', fontWeight: 700 }}>
                    Excel L29–L32
                  </span>
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #94a3b8)' }}>
                  Injected directly into spec sheet cells
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                {/* Dual Hydraulic Jacks (L29) */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary, #fff)' }}>
                      Dual Hydraulic Jacks
                    </label>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted, #94a3b8)' }}>
                      Cell: <strong>L29</strong>
                    </span>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute',
                      left: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      color: 'var(--text-muted, #94a3b8)',
                      pointerEvents: 'none'
                    }}>$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={formData.ladOptions.dualHydraulicJacks !== undefined && formData.ladOptions.dualHydraulicJacks !== false ? String(formData.ladOptions.dualHydraulicJacks) : ''}
                      onChange={e => setFormData({
                        ...formData,
                        ladOptions: {
                          ...formData.ladOptions,
                          dualHydraulicJacks: e.target.value
                        }
                      })}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem 0.55rem 1.75rem',
                        fontSize: '0.88rem',
                        fontWeight: 600,
                        borderRadius: '8px',
                        border: '1px solid var(--border-default, #334155)',
                        background: 'var(--bg-card, #1e293b)',
                        color: 'var(--text-primary, #fff)'
                      }}
                    />
                  </div>
                </div>

                {/* Bumper Pull Setup (L30) */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary, #fff)' }}>
                      Bumper Pull Setup
                    </label>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted, #94a3b8)' }}>
                      Cell: <strong>L30</strong>
                    </span>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute',
                      left: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      color: 'var(--text-muted, #94a3b8)',
                      pointerEvents: 'none'
                    }}>$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={formData.ladOptions.bumperPullSetup !== undefined && formData.ladOptions.bumperPullSetup !== false ? String(formData.ladOptions.bumperPullSetup) : ''}
                      onChange={e => setFormData({
                        ...formData,
                        ladOptions: {
                          ...formData.ladOptions,
                          bumperPullSetup: e.target.value
                        }
                      })}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem 0.55rem 1.75rem',
                        fontSize: '0.88rem',
                        fontWeight: 600,
                        borderRadius: '8px',
                        border: '1px solid var(--border-default, #334155)',
                        background: 'var(--bg-card, #1e293b)',
                        color: 'var(--text-primary, #fff)'
                      }}
                    />
                  </div>
                </div>

                {/* Dual Side Platforms (L31) */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary, #fff)' }}>
                      Dual Side Platforms
                    </label>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted, #94a3b8)' }}>
                      Cell: <strong>L31</strong>
                    </span>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute',
                      left: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      color: 'var(--text-muted, #94a3b8)',
                      pointerEvents: 'none'
                    }}>$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={formData.ladOptions.dualSidePlatforms !== undefined && formData.ladOptions.dualSidePlatforms !== false ? String(formData.ladOptions.dualSidePlatforms) : ''}
                      onChange={e => setFormData({
                        ...formData,
                        ladOptions: {
                          ...formData.ladOptions,
                          dualSidePlatforms: e.target.value
                        }
                      })}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem 0.55rem 1.75rem',
                        fontSize: '0.88rem',
                        fontWeight: 600,
                        borderRadius: '8px',
                        border: '1px solid var(--border-default, #334155)',
                        background: 'var(--bg-card, #1e293b)',
                        color: 'var(--text-primary, #fff)'
                      }}
                    />
                  </div>
                </div>

                {/* Single Side Platforms (L32) */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary, #fff)' }}>
                      Single Side Platforms
                    </label>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted, #94a3b8)' }}>
                      Cell: <strong>L32</strong>
                    </span>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <span style={{
                      position: 'absolute',
                      left: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      color: 'var(--text-muted, #94a3b8)',
                      pointerEvents: 'none'
                    }}>$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={formData.ladOptions.singleSidePlatforms !== undefined && formData.ladOptions.singleSidePlatforms !== false ? String(formData.ladOptions.singleSidePlatforms) : ''}
                      onChange={e => setFormData({
                        ...formData,
                        ladOptions: {
                          ...formData.ladOptions,
                          singleSidePlatforms: e.target.value
                        }
                      })}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem 0.55rem 1.75rem',
                        fontSize: '0.88rem',
                        fontWeight: 600,
                        borderRadius: '8px',
                        border: '1px solid var(--border-default, #334155)',
                        background: 'var(--bg-card, #1e293b)',
                        color: 'var(--text-primary, #fff)'
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary, #cbd5e1)', marginBottom: '0.35rem' }}>
              Special Notes / Instructions
            </label>
            <textarea
              rows={3}
              placeholder="Enter any customer requests, specs, or special instructions..."
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                fontSize: '0.88rem',
                borderRadius: '8px',
                border: '1px solid var(--border-default, #334155)',
                background: 'var(--bg-card, #1e293b)',
                color: 'var(--text-primary, #fff)',
                resize: 'vertical'
              }}
            />
          </div>

          {/* Action Buttons */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid var(--border-default, #334155)',
            marginTop: '0.5rem'
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              style={{
                padding: '0.6rem 1.25rem',
                fontSize: '0.85rem',
                fontWeight: 700,
                borderRadius: '8px',
                border: '1px solid var(--border-default, #334155)',
                background: 'transparent',
                color: 'var(--text-secondary, #cbd5e1)',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              style={{
                padding: '0.6rem 1.5rem',
                fontSize: '0.85rem',
                fontWeight: 800,
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                cursor: isSaving ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
              }}
            >
              {isSaving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save size={16} />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
