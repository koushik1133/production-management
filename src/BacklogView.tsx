import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, ArrowRight, Clock, Trash2, Calendar } from 'lucide-react';
import { PHASES, PHASE_METADATA } from './types';
import type { Trailer, StationId, PhaseId } from './types';
import { addHours, format } from 'date-fns';

interface Props {
  onAddTrailer: (trailer: Trailer) => void;
  onUpdateTrailer: (id: string, updates: Partial<Trailer>) => void;
  trailers: Trailer[];
  suggestedBay: StationId;
  nextSuggestedSerial?: string;
  localModelCategories: { name: string, models: string[] }[];
  localTargetHours: Record<string, Record<PhaseId, number>>;
}

export const BacklogView: React.FC<Props> = ({ onAddTrailer, onUpdateTrailer, trailers, suggestedBay, nextSuggestedSerial, localModelCategories, localTargetHours }) => {
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

  const handleTogglePart = (trailer: Trailer, partKey: keyof NonNullable<Trailer['partsStatus']>) => {
    const currentStatus = trailer.partsStatus || { tyres: false, steel: false, parts: false };
    onUpdateTrailer(trailer.id, {
      partsStatus: {
        ...currentStatus,
        [partKey]: !currentStatus[partKey]
      }
    });
  };

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
    promisedShippingDate: ''
  });

  const selectedModelHours = formData.model ? localTargetHours[formData.model] : null;
  const totalHours = selectedModelHours ? Object.entries(selectedModelHours).reduce((a, [p, h]) => (p !== 'shipping' && p !== 'backlog') ? a + (h as number) : a, 0) : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.model) return;

    const newTrailer: Trailer = {
      id: crypto.randomUUID(),
      name: formData.name || '---',
      model: formData.model,
      serialNumber: formData.serialNumber || `UNIT-${Math.floor(10000 + Math.random() * 90000)}`,
      isPriority: formData.isPriority,
      dateStarted: Date.now(),
      currentPhase: 'backlog',
      history: [{ phase: 'backlog', enteredAt: Date.now() }],
      partsStatus: formData.partsStatus,
      promisedShippingDate: formData.promisedShippingDate,
      isArchived: false,
      isDeleted: false,
      station: 'None'
    };

    onAddTrailer(newTrailer);
    
    setFormData({ 
      name: '', 
      model: '', 
      serialNumber: '', 
      station: 'B1', 
      isPriority: false, 
      partsStatus: { tyres: false, steel: false, parts: false },
      promisedShippingDate: ''
    });
  };

  return (
    <div className="backlog-page-wrapper">
      <div className="backlog-header-section">
        <div className="backlog-title-group">
          <h1 className="backlog-page-title">Backlog Manager</h1>
          <p className="backlog-page-subtitle">Management of units awaiting production slot assignment.</p>
        </div>
        <button className="btn btn-secondary backlog-nav-btn" onClick={() => navigate('/')}>
          <LayoutGrid size={20} /> <span className="btn-text">Open Kanban View</span>
        </button>
      </div>

      <div className="backlog-grid-layout">
        {/* Registration Section */}
        <div style={{ position: 'sticky', top: '2rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Registration Form</h2>
          <section className="registration-card" style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-lg)' }}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.65rem', display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span>Serial Number</span>
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
                    height: '42px', 
                    fontSize: '0.9rem', 
                    fontWeight: 700,
                    borderColor: trailers.some(t => t.serialNumber === formData.serialNumber) ? '#fecdd3' : undefined,
                    backgroundColor: trailers.some(t => t.serialNumber === formData.serialNumber) ? '#fff1f2' : undefined 
                  }}
                  placeholder="e.g. 10001" 
                  value={formData.serialNumber} 
                  onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })} 
                />
              </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.65rem' }}>Customer / PO</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    style={{ height: '38px', fontSize: '0.9rem' }}
                    value={formData.name} 
                    onChange={e => setFormData({...formData, name: e.target.value})} 
                    placeholder="e.g. Stock" 
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.65rem' }}>LANE TRAILERS *</label>
                <select 
                  className="form-select" 
                  style={{ height: '42px', fontSize: '0.9rem', fontWeight: 700 }}
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
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', padding: '1.25rem', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-default)' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.65rem', color: 'var(--accent)' }}>Promised Shipping Date</label>
                  <input 
                    type="date" 
                    className="form-input" 
                    style={{ height: '38px', fontSize: '0.85rem' }}
                    value={formData.promisedShippingDate} 
                    onChange={e => setFormData({...formData, promisedShippingDate: e.target.value})} 
                  />
                </div>
              </div>

              <div style={{ padding: '1.25rem', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-default)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <label className="form-label" style={{ fontSize: '0.65rem', color: '#166534', margin: 0 }}>Parts Readiness</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input 
                      type="checkbox" 
                      id="priority-check"
                      checked={formData.isPriority} 
                      onChange={e => setFormData({...formData, isPriority: e.target.checked})}
                      style={{ width: '16px', height: '16px' }}
                    />
                    <label htmlFor="priority-check" style={{ fontSize: '0.7rem', fontWeight: 800, color: '#be123c', cursor: 'pointer' }}>HIGH PRIORITY</label>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                  {Object.entries(formData.partsStatus).map(([key, val]) => (
                    <label key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', padding: '0.75rem 0.4rem', background: val ? 'rgba(34, 197, 94, 0.1)' : 'var(--bg-card)', borderRadius: '10px', border: `1px solid ${val ? 'var(--accent)' : 'var(--border-default)'}`, transition: 'all 0.2s' }}>
                      <input type="checkbox" checked={val} onChange={e => setFormData({...formData, partsStatus: {...formData.partsStatus, [key]: e.target.checked}})} style={{ width: '16px', height: '16px' }} />
                      <span style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', color: val ? 'var(--accent)' : 'var(--text-muted)' }}>{key}</span>
                    </label>
                  ))}
                </div>
              </div>

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
                <div style={{ 
                  position: 'absolute', 
                  top: '-12px', 
                  right: '12px', 
                  background: '#000', 
                  color: '#fff', 
                  padding: '2px 8px', 
                  borderRadius: '6px', 
                  fontSize: '0.65rem', 
                  fontWeight: 900,
                  border: '2px solid #fff',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                }}>
                  RECOMMENDED: BAY {suggestedBay}
                </div>
              </button>
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
        </div>

        {/* List Section */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
             <h2 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Existing Backlog ({backlogTrailers.length})</h2>
             <input 
              type="text" 
              placeholder="Filter backlog..." 
              style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-card)', color: 'var(--text-primary)', width: '240px', fontSize: '0.875rem' }}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
             />
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
                          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a' }}>{t.model}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {t.serialNumber} • {t.name}
                            <span style={{ background: '#000', color: '#fff', padding: '1px 5px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 900 }}>RECO: {suggestedBay}</span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.3rem' }}>
                          {t.partsStatus && Object.entries(t.partsStatus).map(([key, val]) => (
                            <div 
                              key={key} 
                              onClick={() => handleTogglePart(t, key as any)}
                              style={{ 
                                padding: '0.3rem 0.6rem', 
                                borderRadius: '6px', 
                                background: val ? '#dcfce7' : '#fee2e2', 
                                color: val ? '#166534' : '#991b1b', 
                                fontSize: '0.65rem', 
                                fontWeight: 800, 
                                textTransform: 'uppercase', 
                                border: `1px solid ${val ? '#22c55e' : '#ef4444'}`,
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

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#64748b' }}>
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
                              style={{ flex: 1, padding: '0.4rem', background: 'white', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer' }}
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
        </div>
      );
    };
