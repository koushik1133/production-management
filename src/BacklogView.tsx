/* eslint-disable react-hooks/purity */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, ArrowRight, Clock, Trash2, Calendar, AlertCircle, CheckCircle } from 'lucide-react';
import { PHASES, PHASE_METADATA } from './types';
import type { Trailer, StationId, PhaseId, UserRole } from './types';
import { addHours, format } from 'date-fns';
import { injectTrailerDataIntoSpec } from './lib/injectSpecSheet';

interface Props {
  onAddTrailer: (trailer: Trailer) => void;
  onUpdateTrailer: (id: string, updates: Partial<Trailer>) => void;
  onDeleteTrailer?: (id: string) => void;
  trailers: Trailer[];
  suggestedBay: StationId;
  nextSuggestedSerial?: string;
  localModelCategories: { name: string, models: string[] }[];
  localTargetHours: Record<string, Record<PhaseId, number>>;
  localSpecSheetTemplates: Record<string, string>;
  userRole: UserRole;
  isPriceUnlockedGlobally?: boolean;
  onUnlockPrices?: () => boolean;
  dealers?: { id: string; name: string; addresses?: string[]; common_address?: string; }[];
}

export const BacklogView: React.FC<Props> = ({ onAddTrailer, onUpdateTrailer, onDeleteTrailer, trailers, suggestedBay, nextSuggestedSerial, localModelCategories, localTargetHours, localSpecSheetTemplates, userRole, isPriceUnlockedGlobally, onUnlockPrices, dealers = [] }) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const activeFloorTrailers = trailers.filter(t => !t.isArchived && t.currentPhase !== 'backlog');
  const factoryWorkloadHours = activeFloorTrailers.reduce((sum, t) => {
    const hours = localTargetHours[t.model] || {};
    return sum + (hours[t.currentPhase] || PHASE_METADATA[t.currentPhase]?.defaultTargetHours || 0);
  }, 0);

  const BAYS_COUNT = 4;
  const activeFloorDelayHours = factoryWorkloadHours / BAYS_COUNT;

  const backlogTrailers = trailers
    .filter(t => !t.isArchived && t.currentPhase === 'backlog')
    .filter(t => 
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      t.serialNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.model.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const quoteTrailers = trailers
    .filter(t => !t.isArchived && t.currentPhase === 'quote')
    .filter(t => 
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      t.serialNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.model.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => (a.dateStarted || 0) - (b.dateStarted || 0));

  const handleTogglePart = (trailer: Trailer, partKey: keyof NonNullable<Trailer['partsStatus']>) => {
    const currentStatus = trailer.partsStatus || { tyres: false, steel: false, parts: false };
    onUpdateTrailer(trailer.id, {
      partsStatus: {
        ...currentStatus,
        [partKey]: !currentStatus[partKey]
      }
    });
  };

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [approvingQuoteId, setApprovingQuoteId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    model: '',
    serialNumber: '',
    station: 'B1' as StationId,
    isPriority: false,
    partsStatus: {
      tyres: false,
      steel: false,
      parts: false
    },
    promisedShippingDate: '',
    sale_price: '',
    trailer_color: '',
    trailer_plug: '',
    salesPerson: '',
    dealerLocation: ''
  });

  const selectedModelHours = formData.model ? localTargetHours[formData.model] : null;
  const totalHours = selectedModelHours ? Object.entries(selectedModelHours).reduce((a, [p, h]) => (p !== 'shipping' && p !== 'backlog') ? a + (h as number) : a, 0) : 0;

  const handleGenerateQuote = async () => {
    if (!formData.model) {
      alert("Please select a Trailer Model first.");
      return;
    }

    const templateBase64 = localSpecSheetTemplates[formData.model];
    if (!templateBase64) {
      alert("No Excel template is available for this model.");
      return;
    }

    const quoteId = formData.serialNumber || 'QUOTE';
    const selectedDealer = dealers.find(d => d.name === formData.name);

    try {
      const injected = await injectTrailerDataIntoSpec(
        templateBase64,
        quoteId,
        formData.name || undefined,
        formData.trailer_color || undefined,
        formData.trailer_plug || undefined,
        formData.sale_price ? parseFloat(formData.sale_price) : undefined,
        formData.salesPerson || undefined,
        formData.dealerLocation || undefined,
        selectedDealer?.common_address || undefined,
        true // hideOtherSheets for Quotes
      );

      const a = document.createElement('a');
      a.href = injected;
      a.download = `${quoteId}_Quote.xlsx`;
      a.click();

      // Save the quote to the database
      const newQuote: Trailer = {
        id: crypto.randomUUID(),
        name: formData.name || '---',
        model: formData.model,
        serialNumber: quoteId,
        isPriority: formData.isPriority,
        dateStarted: Date.now(),
        currentPhase: 'quote',
        history: [{ phase: 'quote', enteredAt: Date.now() }],
        partsStatus: formData.partsStatus,
        promisedShippingDate: formData.promisedShippingDate,
        isArchived: false,
        isDeleted: false,
        station: 'None',
        sale_price: formData.sale_price ? parseFloat(formData.sale_price) : undefined,
        spec_sheet_file: injected,
        trailer_color: formData.trailer_color || undefined,
        trailer_plug: formData.trailer_plug || undefined,
        salesPerson: formData.salesPerson || undefined,
        dealerLocation: formData.dealerLocation || undefined,
        dealerCommonAddress: selectedDealer?.common_address || undefined,
        dealerId: selectedDealer?.id || undefined
      };
      onAddTrailer(newQuote);

      setFormData({
        name: '',
        model: '',
        serialNumber: '',
        station: 'B1' as StationId,
        isPriority: false,
        partsStatus: {
          tyres: false,
          steel: false,
          parts: false
        },
        promisedShippingDate: '',
        sale_price: '',
        trailer_color: '',
        trailer_plug: '',
        salesPerson: '',
        dealerLocation: ''
      });
      setToastMessage('Quote Generated Successfully!');
      setTimeout(() => setToastMessage(null), 3000);
    } catch (error) {
      console.error("Failed to generate quote sheet", error);
      alert("Failed to generate quote sheet.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.model) return;

    const serialNum = formData.serialNumber || `UNIT-${Math.floor(10000 + Math.random() * 90000)}`;

    let finalSpecSheetFile = undefined;
    const templateBase64 = localSpecSheetTemplates[formData.model];
    const selectedDealer = dealers.find(d => d.name === formData.name);
    
    if (templateBase64) {
      try {
        finalSpecSheetFile = await injectTrailerDataIntoSpec(
          templateBase64,
          serialNum,
          formData.name || undefined,
          formData.trailer_color || undefined,
          formData.trailer_plug || undefined,
          formData.sale_price ? parseFloat(formData.sale_price) : undefined,
          formData.salesPerson || undefined,
          formData.dealerLocation || undefined,
          selectedDealer?.common_address || undefined
        );
      } catch (error) {
        console.error("Failed to generate spec sheet", error);
      }
    }

    if (approvingQuoteId) {
      onUpdateTrailer(approvingQuoteId, {
        name: formData.name || '---',
        model: formData.model,
        serialNumber: serialNum,
        isPriority: formData.isPriority,
        currentPhase: 'backlog',
        history: [{ phase: 'backlog', enteredAt: Date.now() }],
        partsStatus: formData.partsStatus,
        promisedShippingDate: formData.promisedShippingDate,
        sale_price: formData.sale_price ? parseFloat(formData.sale_price) : undefined,
        spec_sheet_file: finalSpecSheetFile,
        trailer_color: formData.trailer_color || undefined,
        trailer_plug: formData.trailer_plug || undefined,
        salesPerson: formData.salesPerson || undefined,
        dealerLocation: formData.dealerLocation || undefined,
        dealerCommonAddress: selectedDealer?.common_address || undefined,
        dealerId: selectedDealer?.id || undefined
      });
      setApprovingQuoteId(null);
      setToastMessage('Quote Approved & Added to Backlog!');
    } else {
      const newTrailer: Trailer = {
        id: crypto.randomUUID(),
        name: formData.name || '---',
        model: formData.model,
        serialNumber: serialNum,
        isPriority: formData.isPriority,
        dateStarted: Date.now(),
        currentPhase: 'backlog',
        history: [{ phase: 'backlog', enteredAt: Date.now() }],
        partsStatus: formData.partsStatus,
        promisedShippingDate: formData.promisedShippingDate,
        isArchived: false,
        isDeleted: false,
        station: 'None',
        sale_price: formData.sale_price ? parseFloat(formData.sale_price) : undefined,
        spec_sheet_file: finalSpecSheetFile,
        trailer_color: formData.trailer_color || undefined,
        trailer_plug: formData.trailer_plug || undefined,
        salesPerson: formData.salesPerson || undefined,
        dealerLocation: formData.dealerLocation || undefined,
        dealerCommonAddress: selectedDealer?.common_address || undefined,
        dealerId: selectedDealer?.id || undefined
      };
      onAddTrailer(newTrailer);
      setToastMessage('Added to Backlog Successfully!');
    }
    
    setFormData({ 
      name: '', 
      model: '', 
      serialNumber: '', 
      station: 'B1', 
      isPriority: false, 
      partsStatus: { tyres: false, steel: false, parts: false },
      promisedShippingDate: '',
      sale_price: '',
      trailer_color: '',
      trailer_plug: '',
      salesPerson: '',
      dealerLocation: ''
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <div className="backlog-page-wrapper">
      <div className="backlog-header-section">
        <div className="backlog-title-group">
          <h1 className="backlog-page-title">Backlog Manager</h1>
          <p className="backlog-page-subtitle">Management of units awaiting production slot assignment.</p>
        </div>
        <button 
          className="btn btn-primary shimmer backlog-nav-btn" 
          onClick={() => navigate('/')}
          style={{ padding: '0.85rem 1.75rem', borderRadius: '14px', fontWeight: 800, fontSize: '0.95rem' }}
        >
          <LayoutGrid size={20} /> <span className="btn-text">Open Kanban View</span>
        </button>
      </div>

      <div className="backlog-grid-layout">
        {/* Registration Section */}
        <div style={{ position: 'sticky', top: '2rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Registration Form</h2>
          {userRole === 'manager' ? (
            <section className="registration-card" style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-lg)' }}>
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  
                  {/* General Trailer Info */}
                  <div style={{ padding: '1.25rem', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-default)' }}>
                    <h3 style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '1rem', letterSpacing: '0.05em' }}>General Details</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1rem' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span>Serial Number *</span>
                            {trailers.some(t => t.serialNumber === formData.serialNumber) && (
                              <span style={{ color: '#ef4444', fontSize: '0.65rem', fontWeight: 800 }}>ALREADY EXISTS!</span>
                            )}
                          </div>
                          {nextSuggestedSerial && (
                            <button 
                              type="button"
                              onClick={() => setFormData(prev => ({ ...prev, serialNumber: nextSuggestedSerial }))}
                              style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.65rem', fontWeight: 800, cursor: 'pointer', padding: 0 }}
                            >
                              SUGGEST: {nextSuggestedSerial}
                            </button>
                          )}
                        </label>
                        <input 
                          type="text" 
                          className="form-input" 
                          style={{ 
                            padding: '0.75rem 1rem',
                            fontSize: '0.95rem', 
                            fontWeight: 700,
                            borderColor: trailers.some(t => t.serialNumber === formData.serialNumber) ? '#fecdd3' : undefined,
                            backgroundColor: trailers.some(t => t.serialNumber === formData.serialNumber) ? '#fff1f2' : 'var(--bg-card)' 
                          }}
                          placeholder="e.g. 10001" 
                          value={formData.serialNumber} 
                          onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })} 
                        />
                      </div>
                      
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Trailer Model *</label>
                        <select 
                          className="form-select" 
                          style={{ padding: '0.75rem 1rem', fontSize: '0.95rem', fontWeight: 700, background: 'var(--bg-card)' }}
                          value={formData.model} 
                          onChange={e => setFormData({...formData, model: e.target.value})} 
                          required
                        >
                          <option value="">Select Trailer Model...</option>
                          {localModelCategories.map(cat => (
                            <optgroup key={cat.name} label={cat.name}>
                              {cat.models.map(m => <option key={m} value={m}>{m}</option>)}
                            </optgroup>
                          ))}
                        </select>
                        {formData.model && !localSpecSheetTemplates[formData.model] && (
                          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#ea580c', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <AlertCircle size={14} /> No Excel template available for this model.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Dealer & Sales Info */}
                  <div style={{ padding: '1.25rem', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-default)' }}>
                    <h3 style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '1rem', letterSpacing: '0.05em' }}>Dealer & Sales Info</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Dealer Name *</label>
                        <select 
                          className="form-select" 
                          style={{ padding: '0.75rem 1rem', fontSize: '0.95rem', background: 'var(--bg-card)' }}
                          value={formData.name} 
                          onChange={e => setFormData({...formData, name: e.target.value, dealerLocation: ''})} 
                          required
                        >
                          <option value="">Select Dealer...</option>
                          {dealers.map(d => (
                            <option key={d.id} value={d.name}>{d.name}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Branch Location</label>
                        <select 
                          className="form-select" 
                          style={{ padding: '0.75rem 1rem', fontSize: '0.95rem', background: 'var(--bg-card)' }}
                          value={formData.dealerLocation} 
                          onChange={e => setFormData({...formData, dealerLocation: e.target.value})} 
                          disabled={!formData.name}
                        >
                          <option value="">Select Address...</option>
                          {dealers.find(d => d.name === formData.name)?.addresses?.map(addr => (
                            <option key={addr} value={addr}>{addr}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.75rem' }}>Sales Person</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        style={{ padding: '0.75rem 1rem', fontSize: '0.95rem', background: 'var(--bg-card)' }}
                        placeholder="e.g. John Doe"
                        value={formData.salesPerson} 
                        onChange={e => setFormData({...formData, salesPerson: e.target.value})} 
                      />
                    </div>
                  </div>

                  {/* Specifications & Pricing */}
                  <div style={{ padding: '1.25rem', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-default)' }}>
                    <h3 style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '1rem', letterSpacing: '0.05em' }}>Specifications & Pricing</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>🎨 Trailer Color</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          style={{ padding: '0.75rem 1rem', fontSize: '0.95rem', background: 'var(--bg-card)' }}
                          placeholder="e.g. White, Red" 
                          value={formData.trailer_color} 
                          onChange={e => setFormData({...formData, trailer_color: e.target.value})} 
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>🔌 Trailer Plug</label>
                        <select 
                          className="form-select"
                          style={{ padding: '0.75rem 1rem', fontSize: '0.95rem', background: 'var(--bg-card)' }}
                          value={formData.trailer_plug}
                          onChange={e => setFormData({...formData, trailer_plug: e.target.value})}
                        >
                          <option value="">Select Plug...</option>
                          <option value="7 RV Molded Plug">7 RV Molded Plug</option>
                          <option value="7 Pole Semi Plug">7 Pole Semi Plug</option>
                          <option value="6 Pole Molded Plug">6 Pole Molded Plug</option>
                          <option value="4 Way Flat">4 Way Flat</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      {userRole === 'manager' && (
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.75rem', color: '#d97706', fontWeight: 800 }}>Sale Price ($)</label>
                          <input 
                            key={isPriceUnlockedGlobally ? 'unlocked-backlog' : 'locked-backlog'}
                            type={isPriceUnlockedGlobally ? "number" : "password"} 
                            className="form-input" 
                            style={{ padding: '0.75rem 1rem', fontSize: '0.95rem', borderColor: 'rgba(217, 119, 6, 0.3)', background: 'rgba(217, 119, 6, 0.05)', color: '#d97706', fontWeight: 800 }}
                            placeholder={isPriceUnlockedGlobally ? "0.00" : "••••••"}
                            value={formData.sale_price} 
                            onChange={e => setFormData({...formData, sale_price: e.target.value.replace(/[^0-9.]/g, '')})} 
                            onFocus={() => {
                              if (!isPriceUnlockedGlobally && onUnlockPrices) {
                                onUnlockPrices();
                              }
                            }}
                          />
                        </div>
                      )}
                      <div className="form-group" style={{ marginBottom: 0, gridColumn: userRole === 'manager' ? undefined : 'span 2' }}>
                        <label className="form-label" style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>Promised Shipping</label>
                        <input 
                          type="date" 
                          min={new Date().toISOString().split('T')[0]}
                          className="form-input" 
                          style={{ padding: '0.75rem 1rem', fontSize: '0.95rem', background: 'var(--bg-card)' }}
                          value={formData.promisedShippingDate} 
                          onChange={e => setFormData({...formData, promisedShippingDate: e.target.value})} 
                        />
                      </div>
                    </div>
                  </div>

                  {/* Readiness & Priority */}
                  <div style={{ padding: '1.25rem', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-default)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h3 style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Parts Readiness</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: formData.isPriority ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-card)', padding: '0.4rem 0.8rem', borderRadius: '8px', border: `1px solid ${formData.isPriority ? '#ef4444' : 'var(--border-default)'}` }}>
                        <input 
                          type="checkbox" 
                          id="priority-check"
                          checked={formData.isPriority} 
                          onChange={e => setFormData({...formData, isPriority: e.target.checked})}
                          style={{ width: '16px', height: '16px', accentColor: '#ef4444' }}
                        />
                        <label htmlFor="priority-check" style={{ fontSize: '0.75rem', fontWeight: 800, color: formData.isPriority ? '#ef4444' : 'var(--text-secondary)', cursor: 'pointer' }}>HIGH PRIORITY</label>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                      {Object.entries(formData.partsStatus).map(([key, val]) => (
                        <label key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '1rem 0.5rem', background: val ? 'rgba(34, 197, 94, 0.1)' : 'var(--bg-card)', borderRadius: '10px', border: `2px solid ${val ? 'var(--accent)' : 'var(--border-default)'}`, transition: 'all 0.2s', boxShadow: val ? '0 4px 12px rgba(34, 197, 94, 0.15)' : 'none' }}>
                          <input type="checkbox" checked={val} onChange={e => setFormData({...formData, partsStatus: {...formData.partsStatus, [key]: e.target.checked}})} style={{ width: '18px', height: '18px', accentColor: 'var(--accent)' }} />
                          <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: val ? 'var(--accent)' : 'var(--text-muted)' }}>{key}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={handleGenerateQuote}
                    style={{ 
                      height: '3.5rem', 
                      fontSize: '1rem', 
                      borderRadius: '12px', 
                      border: '2px solid var(--accent)',
                      color: 'var(--accent)',
                      background: 'transparent',
                      fontWeight: 700
                    }}
                  >
                    Get Quote
                  </button>
                  <button 
                    type="submit" 
                    className="btn btn-primary" 
                    style={{ 
                      height: '3.5rem', 
                      fontSize: '1rem', 
                      borderRadius: '12px', 
                      position: 'relative',
                      opacity: trailers.some(t => t.serialNumber === formData.serialNumber) ? 0.6 : 1
                    }}
                    disabled={trailers.some(t => t.serialNumber === formData.serialNumber)}
                  >
                    Confirm Registration <ArrowRight size={18} />
                    <div className="reco-badge-tag" style={{ 
                      position: 'absolute', 
                      top: '-12px', 
                      right: '12px', 
                      background: 'var(--bg-main)', 
                      color: 'var(--text-primary)', 
                      padding: '4px 10px', 
                      borderRadius: '8px', 
                      fontSize: '0.65rem', 
                      fontWeight: 900,
                      border: '1.5px solid var(--accent)',
                      boxShadow: 'var(--shadow-md)'
                    }}>
                      RECOMMENDED: BAY {suggestedBay}
                    </div>
                  </button>
                </div>
              </form>

              {formData.model && (
                <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '2px dashed var(--border-default)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Estimated Build Time</span>
                    <span style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-primary)' }}>{totalHours}h</span>
                  </div>
                  {Object.entries(selectedModelHours || {}).filter(([p]) => p !== 'shipping' && p !== 'backlog').map(([phase, hours]) => (
                    <div key={phase} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border-default)' }}>
                      <span style={{ fontSize: '0.8125rem', textTransform: 'capitalize', color: 'var(--text-secondary)', fontWeight: 600 }}>{phase}</span>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--text-primary)' }}>{hours}h</span>
                    </div>
                  ))}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', marginTop: '1rem' }}>
                    {selectedModelHours && Object.values(selectedModelHours).map((h, i) => (
                      <div key={i} style={{ height: '4px', background: h > 0 ? '#3b82f6' : '#e2e8f0', borderRadius: '2px' }} />
                    ))}
                  </div>
                </div>
              )}
            </section>
          ) : (
            <div style={{ padding: '2rem', background: 'var(--bg-card)', borderRadius: '16px', border: '2px dashed var(--border-default)', textAlign: 'center' }}>
              <div style={{ padding: '1.25rem', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '12px', marginBottom: '1.25rem', width: 'fit-content', margin: '0 auto 1.25rem' }}>
                <LayoutGrid size={32} color="var(--accent)" />
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Read-Only Access</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>You are logged in as a <strong>Worker</strong>. Unit registration and management is restricted to Managers.</p>
            </div>
          )}
        </div>

        {/* List Section */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem' }}>
             <h2 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Existing Backlog ({backlogTrailers.length})</h2>
             <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
               <input 
                 type="text" 
                 placeholder="Filter backlog..." 
                 style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-card)', color: 'var(--text-primary)', width: '240px', fontSize: '0.875rem' }}
                 value={searchQuery}
                 onChange={e => setSearchQuery(e.target.value)}
               />
             </div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {backlogTrailers.length > 0 ? (() => {
                  let cumulativeBacklogHours = 0;
                  return backlogTrailers.map(t => {
                    const modelHours = localTargetHours[t.model] || {};
                    // Correct build hours calculation (excluding backlog/shipping)
                    const actualBuildHours = PHASES.filter(p => p.id !== 'backlog' && p.id !== 'shipping').reduce((sum, p) => {
                      return sum + (modelHours[p.id] || PHASE_METADATA[p.id].defaultTargetHours);
                    }, 0);
                    
                    // Estimate = (Active Floor Delay) + (Hours of units ahead in backlog / 4 bays)
                    const estimateHours = activeFloorDelayHours + (cumulativeBacklogHours / BAYS_COUNT);
                    const estimatedDate = addHours(new Date(), estimateHours);
                    
                    // Add current unit's hours for the NEXT unit's calculation
                    cumulativeBacklogHours += actualBuildHours;

                    return (
                      <div key={t.id} className="backlog-item-card">
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{t.model}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {t.serialNumber} • {t.name}
                            <span className="reco-badge-tag" style={{ marginLeft: '0.2rem' }}>RECO: {suggestedBay}</span>
                            {userRole === 'manager' && t.sale_price !== undefined && (
                              <span 
                                onClick={(e) => {
                                  if (!isPriceUnlockedGlobally && onUnlockPrices) {
                                    e.stopPropagation();
                                    onUnlockPrices();
                                  }
                                }}
                                style={{ 
                                  color: '#10b981', 
                                  fontWeight: 900, 
                                  background: 'rgba(16, 185, 129, 0.1)', 
                                  padding: '1px 5px', 
                                  borderRadius: '4px', 
                                  fontSize: '0.75rem',
                                  cursor: isPriceUnlockedGlobally ? 'default' : 'pointer'
                                }}
                              >
                                {isPriceUnlockedGlobally ? (t.sale_price != null ? `$${t.sale_price.toLocaleString()}` : 'NOT SET') : '••••••'}
                              </span>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.3rem' }}>
                          {t.partsStatus && Object.entries(t.partsStatus).map(([key, val]) => (
                            <div 
                              key={key} 
                              onClick={() => handleTogglePart(t, key as any)}
                              style={{ 
                                padding: '0.25rem 0.75rem', 
                                borderRadius: '99px', 
                                background: val ? 'rgba(34, 197, 94, 0.1)' : 'var(--priority-bg)', 
                                color: val ? '#22c55e' : '#ef4444', 
                                fontSize: '0.65rem', 
                                fontWeight: 800, 
                                textTransform: 'uppercase', 
                                letterSpacing: '0.05em',
                                border: `1px solid ${val ? 'rgba(34, 197, 94, 0.2)' : 'var(--priority-border)'}`,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                userSelect: 'none',
                                minWidth: '60px',
                                textAlign: 'center'
                              }}
                            >
                              {key}
                            </div>
                          ))}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)' }}>
                          <Clock size={14} />
                          <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{actualBuildHours}h Build</span>
                        </div>

                        {confirmingDeleteId === t.id ? (
                          <div style={{ gridColumn: '4 / 6', display: 'flex', gap: '0.5rem', background: '#fee2e2', padding: '0.5rem', borderRadius: '8px', border: '1px solid #ef4444' }}>
                            <button 
                              onClick={() => {
                                onUpdateTrailer(t.id, { isArchived: true, archivedAt: Date.now(), isDeleted: true });
                                setConfirmingDeleteId(null);
                              }}
                              style={{ flex: 1, padding: '0.4rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer' }}
                            >
                              CONFIRM
                            </button>
                            <button 
                              onClick={() => setConfirmingDeleteId(null)}
                              style={{ flex: 1, padding: '0.4rem', background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer' }}
                            >
                              CANCEL
                            </button>
                          </div>
                        ) : (
                          <>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent)' }}>
                                <Calendar size={12} />
                                <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Est. Start Date</span>
                              </div>
                              <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                                {format(estimatedDate, 'MMM d, h:mm a')}
                              </div>
                            </div>

                            {userRole === 'manager' && (
                              <button 
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmingDeleteId(t.id);
                                }}
                                style={{ 
                                  width: '36px', 
                                  height: '36px', 
                                  borderRadius: '10px', 
                                  border: '1px solid #fee2e2', 
                                  background: '#fff', 
                                  color: '#ef4444', 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                }}
                                onMouseOver={(e) => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.borderColor = '#fca5a5'; }}
                                onMouseOut={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#fee2e2'; }}
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    );
                  });
                })() : (
                  <div style={{ padding: '4rem', textAlign: 'center', background: 'var(--bg-card)', borderRadius: '12px', border: '2px dashed var(--border-default)', color: 'var(--text-muted)' }}>
                    No units found in backlog matching your filters.
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Pending Quotes Section */}
          <div style={{ marginTop: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              Pending Quotes
              <span style={{ fontSize: '0.8rem', background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: '12px', color: 'var(--text-muted)' }}>
                {quoteTrailers.length}
              </span>
            </h2>
            
            <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-default)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
              {quoteTrailers.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', borderTop: '1px solid var(--border-default)' }}>
                  {quoteTrailers.map(quote => (
                    <div key={quote.id} style={{ padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background-color 0.2s', background: 'var(--bg-card)' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)' }}>{quote.serialNumber}</span>
                          <span style={{ fontSize: '0.8rem', background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>{quote.model}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                          <span>Sales Rep: {quote.salesPerson || 'N/A'}</span>
                          <span>Dealer: {quote.name !== '---' ? quote.name : 'N/A'}</span>
                          {quote.sale_price && <span style={{ color: '#059669' }}>Price: ${quote.sale_price.toLocaleString()}</span>}
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          onClick={() => {
                            setFormData({
                              name: quote.name !== '---' ? quote.name : '',
                              model: quote.model,
                              serialNumber: nextSuggestedSerial || '',
                              station: 'B1',
                              isPriority: quote.isPriority || false,
                              partsStatus: quote.partsStatus || { tyres: false, steel: false, parts: false },
                              promisedShippingDate: quote.promisedShippingDate || '',
                              sale_price: quote.sale_price ? quote.sale_price.toString() : '',
                              trailer_color: quote.trailer_color || '',
                              trailer_plug: quote.trailer_plug || '',
                              salesPerson: quote.salesPerson || '',
                              dealerLocation: quote.dealerLocation || ''
                            });
                            setApprovingQuoteId(quote.id);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          style={{
                            padding: '0.6rem 1.25rem',
                            borderRadius: '8px',
                            background: '#10b981',
                            color: 'white',
                            border: 'none',
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'background-color 0.2s'
                          }}
                        >
                          <CheckCircle size={16} /> Approve
                        </button>
                        
                        {userRole === 'manager' && onDeleteTrailer && (
                          <button 
                            onClick={() => {
                              if (window.confirm(`Are you sure you want to completely delete quote ${quote.serialNumber}? This cannot be undone.`)) {
                                onDeleteTrailer(quote.id);
                                setToastMessage('Quote Rejected & Deleted');
                                setTimeout(() => setToastMessage(null), 3000);
                              }
                            }}
                            style={{
                              padding: '0.6rem 1.25rem',
                              borderRadius: '8px',
                              background: '#fff',
                              color: '#ef4444',
                              border: '1px solid #fee2e2',
                              fontWeight: 700,
                              cursor: 'pointer',
                              fontSize: '0.9rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              transition: 'all 0.2s'
                            }}
                          >
                            <Trash2 size={16} /> Deny
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No pending quotes found.
                </div>
              )}
            </div>
          </div>
          
          {toastMessage && (
            <div style={{
              position: 'fixed',
              bottom: '24px',
              right: '24px',
              background: '#10b981',
              color: 'white',
              padding: '16px 24px',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              zIndex: 9999,
              fontWeight: 600,
              animation: 'slideUp 0.3s ease-out'
            }}>
              <CheckCircle size={20} />
              {toastMessage}
            </div>
          )}
        </div>
      );
    };
