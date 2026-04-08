import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, ArrowRight, Clock, Trash2, Calendar } from 'lucide-react';
import { MODEL_CATEGORIES, MODEL_TARGET_HOURS } from './types';
import type { Trailer, StationId } from './types';
import { addHours, format } from 'date-fns';

interface Props {
  onAddTrailer: (trailer: Trailer) => void;
  onUpdateTrailer: (id: string, updates: Partial<Trailer>) => void;
  trailers: Trailer[];
}

export const BacklogView: React.FC<Props> = ({ onAddTrailer, onUpdateTrailer, trailers }) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const activeFloorTrailers = trailers.filter(t => !t.isArchived && t.currentPhase !== 'backlog');
  const factoryWorkloadHours = activeFloorTrailers.reduce((sum, t) => {
    const hours = MODEL_TARGET_HOURS[t.model];
    if (!hours) return sum;
    return sum + (hours[t.currentPhase] || 0);
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
    }
  });

  const selectedModelHours = formData.model ? MODEL_TARGET_HOURS[formData.model] : null;
  const totalHours = selectedModelHours ? Object.entries(selectedModelHours).reduce((a, [p, h]) => p !== 'shipping' ? a + h : a, 0) : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.model) return;

    const newTrailer: Trailer = {
      id: Math.random().toString(36).substr(2, 9),
      name: formData.name || '---',
      model: formData.model,
      serialNumber: formData.serialNumber || `LT-${Math.floor(10000 + Math.random() * 90000)}`,
      station: formData.station,
      isPriority: formData.isPriority,
      dateStarted: Date.now(),
      currentPhase: 'backlog',
      history: [{ phase: 'backlog', enteredAt: Date.now() }],
      partsStatus: formData.partsStatus
    };

    onAddTrailer(newTrailer);
    setFormData({ name: '', model: '', serialNumber: '', station: 'B1', isPriority: false, partsStatus: { tyres: false, steel: false, parts: false } });
  };

  return (
    <div className="backlog-page" style={{ padding: '2rem 3rem', maxWidth: '1600px', margin: '0 auto', background: '#f8fafc', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2.5rem' }}>
        <div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 900, letterSpacing: '-0.04em', color: '#0f172a' }}>Backlog Manager</h1>
          <p style={{ color: '#64748b', fontSize: '1.1rem', marginTop: '0.25rem' }}>Management of units awaiting production slot assignment.</p>
        </div>
        <button className="btn btn-secondary" style={{ padding: '0.75rem 1.25rem' }} onClick={() => navigate('/')}>
          <LayoutGrid size={20} /> Open Kanban View
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(400px, 1fr) 2fr', gap: '3rem', alignItems: 'start' }}>
        {/* Registration Section */}
        <div style={{ position: 'sticky', top: '2rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', marginBottom: '1.5rem' }}>Registration Form</h2>
          <section className="registration-card" style={{ background: 'white', padding: '2rem', borderRadius: 'var(--radius-lg)', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="form-group">
                <label className="form-label">Serial Number *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  required
                  value={formData.serialNumber} 
                  onChange={e => setFormData({...formData, serialNumber: e.target.value})} 
                  placeholder="e.g. LT-12345" 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Customer / Purchase Order</label>
                <input type="text" className="form-input" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Stock" />
              </div>

              <div className="form-group">
                <label className="form-label">Official Lane Model *</label>
                <select className="form-select" value={formData.model} onChange={e => setFormData({...formData, model: e.target.value})} required>
                  <option value="">Select Trailer Model...</option>
                  {MODEL_CATEGORIES.map(cat => (
                    <optgroup key={cat.name} label={cat.name}>
                      {cat.models.map(m => <option key={m} value={m}>{m}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div style={{ padding: '1.5rem', background: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid #e2e8f0' }}>
                <label className="form-label" style={{ marginBottom: '1rem' }}>Parts Readiness</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                  {Object.entries(formData.partsStatus).map(([key, val]) => (
                    <label key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '1rem 0.5rem', background: val ? '#dcfce7' : 'white', borderRadius: '8px', border: `1px solid ${val ? '#22c55e' : '#e2e8f0'}`, transition: 'all 0.2s' }}>
                      <input type="checkbox" checked={val} onChange={e => setFormData({...formData, partsStatus: {...formData.partsStatus, [key]: e.target.checked}})} style={{ width: '18px', height: '18px' }} />
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>{key}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button type="submit" className="btn btn-primary" style={{ height: '4rem', fontSize: '1.1rem' }}>
                Register New Unit <ArrowRight size={20} />
              </button>
            </form>

            {formData.model && (
              <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '2px dashed #f1f5f9' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#64748b' }}>Estimated Build Time</span>
                  <span style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a' }}>{totalHours}h</span>
                </div>
                {Object.entries(selectedModelHours || {}).filter(([p]) => p !== 'shipping').map(([phase, hours]) => (
                  <div key={phase} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.4rem', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: '0.8125rem', textTransform: 'capitalize', color: '#64748b', fontWeight: 600 }}>{phase}</span>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 800, color: '#0f172a' }}>{hours}h</span>
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
             <h2 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8' }}>Existing Backlog ({backlogTrailers.length})</h2>
             <input 
              type="text" 
              placeholder="Filter backlog..." 
              style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0', width: '240px', fontSize: '0.875rem' }}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
             />
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {backlogTrailers.length > 0 ? (() => {
                  let cumulativeBacklogHours = 0;
                  return backlogTrailers.map(t => {
                    const modelHours = MODEL_TARGET_HOURS[t.model] || {};
                    const totalBuildHours = Object.entries(modelHours).reduce((a, [p, h]) => (p !== 'shipping' && p !== 'backlog') ? a + (h as number) : a, 0);
                    
                    // Estimate = (Active Floor Delay) + (Hours of units ahead in backlog / 4 bays)
                    const estimateHours = activeFloorDelayHours + (cumulativeBacklogHours / BAYS_COUNT);
                    const estimatedDate = addHours(new Date(), estimateHours);
                    
                    // Add current unit's hours for the NEXT unit's calculation
                    cumulativeBacklogHours += totalBuildHours;

                    return (
                      <div key={t.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1fr 1.2fr 48px', alignItems: 'center', gap: '1rem' }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a' }}>{t.model}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>{t.serialNumber} • {t.name}</div>
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
                          <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{totalBuildHours}h Build</span>
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
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '0.5rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#3b82f6' }}>
                                <Calendar size={12} />
                                <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Est. Start Date</span>
                              </div>
                              <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b' }}>
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
                  <div style={{ padding: '4rem', textAlign: 'center', background: 'white', borderRadius: '12px', border: '2px dashed #e2e8f0', color: '#94a3b8' }}>
                    No units found in backlog matching your filters.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    };
