import React from 'react';
import { formatDistanceToNow, format, differenceInCalendarDays, subDays } from 'date-fns';
import { History, FileText, Send, Crown, Calculator, CalendarClock, Clock } from 'lucide-react';
import type { Trailer } from '../types';
import { MODEL_TARGET_HOURS, PHASES, BAY_WEEKLY_HOURS } from '../types';
import { Modal } from './Modal';

interface Props {
  trailer: Trailer;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Trailer>) => void;
  allTrailers?: Trailer[];
}

export const TrailerDetailsModal: React.FC<Props> = ({ trailer, isOpen, onClose, onUpdate, allTrailers = [] }) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editForm, setEditForm] = React.useState({
    name: trailer.name,
    model: trailer.model,
    serialNumber: trailer.serialNumber,
    partsStatus: trailer.partsStatus || { steel: false, tyres: false, parts: false },
    expectedDueDate: trailer.expectedDueDate || '',
    promisedShippingDate: trailer.promisedShippingDate || ''
  });
  const [localNotes, setLocalNotes] = React.useState(trailer.notes || '');

  const formatLogDuration = (ms: number) => {
    const totalMinutes = Math.floor(ms / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const handleSaveAll = () => {
    onUpdate(trailer.id, { 
      ...editForm,
      notes: localNotes 
    });
    setIsEditing(false);
  };

  const togglePriority = () => {
    onUpdate(trailer.id, { isPriority: !trailer.isPriority });
  };

  const togglePart = (part: keyof typeof editForm.partsStatus) => {
    const newStatus = { ...editForm.partsStatus, [part]: !editForm.partsStatus[part] };
    setEditForm({ ...editForm, partsStatus: newStatus });
    // Auto-save parts status for immediate feedback if not in full edit mode
    if (!isEditing) {
      onUpdate(trailer.id, { partsStatus: newStatus });
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={isEditing ? `Editing: ${trailer.serialNumber}` : `${trailer.serialNumber} • ${trailer.model}`}
    >
      <div className="details-container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>PRODUCTION UNIT DATA</span>
          </div>
          {!trailer.isArchived && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {isEditing && (
                <button className="btn btn-primary" onClick={handleSaveAll} style={{ background: '#2563eb' }}>
                  Save Changes
                </button>
              )}
              <button 
                className={`btn btn-sm ${isEditing ? 'btn-danger' : 'btn-secondary'}`}
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? 'Cancel Edits' : 'Edit Unit Info'}
              </button>
            </div>
          )}
        </div>

        {isEditing ? (
          <div className="edit-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
             <div className="form-group">
                <label className="form-label">Customer Name</label>
                <input 
                  className="form-input" 
                  value={editForm.name} 
                  onChange={e => setEditForm({...editForm, name: e.target.value})}
                />
             </div>
             <div className="form-group">
                <label className="form-label">Serial Number</label>
                <input 
                  className="form-input" 
                  value={editForm.serialNumber} 
                  onChange={e => setEditForm({...editForm, serialNumber: e.target.value})}
                />
             </div>
             <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Trailer Model</label>
                <input 
                  className="form-input" 
                  value={editForm.model} 
                  onChange={e => setEditForm({...editForm, model: e.target.value})}
                />
             </div>
             <div className="form-group">
                <label className="form-label">Expected Due Date</label>
                <input 
                  type="date"
                  className="form-input" 
                  value={editForm.expectedDueDate} 
                  onChange={e => setEditForm({...editForm, expectedDueDate: e.target.value})}
                />
             </div>
             <div className="form-group">
                <label className="form-label">Promised Shipping Date</label>
                <input 
                  type="date"
                  className="form-input" 
                  value={editForm.promisedShippingDate} 
                  onChange={e => setEditForm({...editForm, promisedShippingDate: e.target.value})}
                />
             </div>
          </div>
        ) : (
          <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{trailer.name}</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>SN: {trailer.serialNumber}</span>
            </div>
            
            <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Hours Logged (Current Stage)</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{trailer.currentPhase.toUpperCase()}: {Math.round(MODEL_TARGET_HOURS[trailer.model]?.[trailer.currentPhase] || 0)}h target</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'white', padding: '0.4rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                <Clock size={16} color="var(--accent)" />
                <input 
                  type="number"
                  placeholder="0"
                  style={{ width: '60px', border: 'none', background: 'transparent', fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', outline: 'none', textAlign: 'center' }}
                  value={(() => {
                    const currentLog = trailer.history.find(h => h.phase === trailer.currentPhase && !h.exitedAt);
                    return currentLog?.bayManualHours || currentLog?.phaseManualHours || '';
                  })()}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    const updatedHistory = trailer.history.map(h => 
                      h.phase === trailer.currentPhase && !h.exitedAt 
                        ? { ...h, bayManualHours: isNaN(val) ? undefined : val, phaseManualHours: isNaN(val) ? undefined : val } 
                        : h
                    );
                    onUpdate?.(trailer.id, { history: updatedHistory });
                  }}
                />
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>Hrs</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div>
                <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Expected Due</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{trailer.expectedDueDate ? format(new Date(trailer.expectedDueDate + 'T12:00:00'), 'MMM d, yyyy') : 'NOT SET'}</span>
              </div>
              <div>
                <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Promised Shipping Date</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{trailer.promisedShippingDate ? format(new Date(trailer.promisedShippingDate + 'T12:00:00'), 'MMM d, yyyy') : 'NOT SET'}</span>
              </div>
            </div>

            {/* Sequential Queue Completion Range */}
            {!trailer.isArchived && trailer.station !== 'None' && (() => {
              // Helper: get remaining build hours for any trailer
              const getHours = (t: Trailer) => {
                const idx = PHASES.findIndex(p => p.id === t.currentPhase);
                if (idx === -1) return 0;
                return PHASES.slice(idx).reduce((sum, p) => {
                  if (p.id === 'shipping') return sum;
                  if (t.finishingType === 'Paint' && p.id === 'outsource') return sum;
                  if (t.finishingType === 'Outsource' && p.id === 'paint') return sum;
                  if (!t.finishingType && p.id === 'outsource') return sum;
                  return sum + (MODEL_TARGET_HOURS[t.model]?.[p.id] || 0);
                }, 0);
              };

              const myHours = getHours(trailer);
              if (myHours === 0) return null;

              // Sort all active bay-mates by dateStarted (oldest first = they go first)
              const bayQueue = allTrailers
                .filter(t => t.station === trailer.station && !t.isArchived && t.currentPhase !== 'shipping')
                .sort((a, b) => a.dateStarted - b.dateStarted);

              const myIndex = bayQueue.findIndex(t => t.id === trailer.id);
              const trailersAhead = myIndex > 0 ? bayQueue.slice(0, myIndex) : [];
              const hoursAhead = trailersAhead.reduce((sum, t) => sum + getHours(t), 0);
              const totalHours = hoursAhead + myHours; // hours until this trailer is done

              const bayWeeklyHours = BAY_WEEKLY_HOURS[trailer.station] ?? 40;

              // Best (100% efficiency): all hours / full bay capacity
              const bestDays = Math.ceil((totalHours / bayWeeklyHours) * 7);
              const bestDate = new Date();
              bestDate.setDate(bestDate.getDate() + bestDays);

              // Worst (80% efficiency): ×1.25 multiplier
              const worstDays = Math.ceil(bestDays * 1.25);
              const worstDate = new Date();
              worstDate.setDate(worstDate.getDate() + worstDays);

              const dueDate = trailer.expectedDueDate ? new Date(trailer.expectedDueDate + 'T12:00:00') : null;
              const bestLate  = dueDate ? bestDate  > dueDate : false;
              const worstLate = dueDate ? worstDate > dueDate : false;

              const bgColor     = bestLate ? '#fff1f2' : worstLate ? '#fffbeb' : '#f0f9ff';
              const borderColor = bestLate ? '#fecdd3' : worstLate ? '#fde68a' : '#bae6fd';
              const textColor   = bestLate ? '#9f1239' : worstLate ? '#78350f' : '#0c4a6e';
              const labelColor  = bestLate ? '#be123c' : worstLate ? '#92400e' : '#0369a1';

              return (
                <div style={{ padding: '1rem', background: bgColor, borderRadius: '12px', border: `1px solid ${borderColor}` }}>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 800, color: labelColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Est. Completion Range
                    </span>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: labelColor, background: 'rgba(255,255,255,0.6)', padding: '2px 8px', borderRadius: '99px' }}>
                      {myIndex >= 0 ? `#${myIndex + 1} in ${trailer.station} queue` : trailer.station} · {myHours}h
                    </span>
                  </div>

                  {/* Date range */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                    <span style={{ fontSize: '1rem', fontWeight: 900, color: textColor }}>{format(bestDate, 'MMM d')}</span>
                    <span style={{ fontSize: '0.75rem', color: labelColor, fontWeight: 700 }}>→</span>
                    <span style={{ fontSize: '1rem', fontWeight: 900, color: textColor }}>{format(worstDate, 'MMM d, yyyy')}</span>
                  </div>

                  {/* Context */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 600, color: labelColor }}>
                      ✓ Best: 100% efficiency
                      {hoursAhead > 0 && <span style={{ display: 'block', opacity: 0.8 }}>{hoursAhead}h ahead + {myHours}h mine</span>}
                    </div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 600, color: labelColor }}>
                      ⏳ Worst: 80% efficiency
                      <span style={{ display: 'block', opacity: 0.8 }}>{bayWeeklyHours}h/wk bay capacity</span>
                    </div>
                  </div>

                  {/* Warning */}
                  {(bestLate || worstLate) && (
                    <div style={{ marginTop: '0.6rem', padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.5)', borderRadius: '8px', fontSize: '0.65rem', fontWeight: 700, color: bestLate ? '#9f1239' : '#b45309' }}>
                      {bestLate ? '🔴 Even best-case exceeds expected due date' : '🟡 Worst-case may exceed expected due date'}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* VIN & Invoice — shown when data has been collected */}
            {(trailer.vinDate || trailer.invoiceNumber) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', padding: '1rem', background: '#f0fdf4', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
                <div>
                  <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#15803d', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>VIN Date</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#14532d' }}>
                    {trailer.vinDate ? format(new Date(trailer.vinDate + 'T12:00:00'), 'MMM d, yyyy') : '—'}
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#15803d', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Invoice Number</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#14532d' }}>
                    {trailer.invoiceNumber || '—'}
                  </span>
                </div>
              </div>
            )}

          </div>
        )}

        {/* Smart Production Planner Section */}
        {trailer.expectedDueDate && trailer.promisedShippingDate && !trailer.isArchived && (() => {
          const today = new Date();
          const promised = new Date(trailer.promisedShippingDate + 'T12:00:00');
          const shopDeadline = subDays(promised, 2);
          const daysToDeadline = differenceInCalendarDays(shopDeadline, today);
          const gapBetweenDueAndPromised = differenceInCalendarDays(promised, new Date(trailer.expectedDueDate + 'T12:00:00'));

          // Calculate remaining hours
          const phaseIndex = PHASES.findIndex(p => p.id === trailer.currentPhase);
          const remainingHours = PHASES.slice(phaseIndex).reduce((sum, p) => {
            if (p.id === 'shipping') return sum;
            return sum + (MODEL_TARGET_HOURS[trailer.model]?.[p.id] || 0);
          }, 0);

          const hoursPerDay = daysToDeadline > 0 ? (remainingHours / daysToDeadline).toFixed(1) : remainingHours.toFixed(1);

          return (
            <div style={{ marginTop: '1.5rem', marginBottom: '2rem', padding: '1.25rem', background: '#f0f9ff', borderRadius: '16px', border: '1px solid #bae6fd' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <Calculator size={18} color="#0369a1" />
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Smart Production Planner</span>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                <div style={{ background: 'white', padding: '1rem', borderRadius: '12px', border: '1px solid #e0f2fe' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0284c7', marginBottom: '0.25rem' }}>
                    <CalendarClock size={14} />
                    <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase' }}>Shop floor deadline</span>
                  </div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0c4a6e' }}>{format(shopDeadline, 'MMM d')}</div>
                  <div style={{ fontSize: '0.7rem', color: '#0369a1', fontWeight: 600 }}>2-day buffer included</div>
                </div>

                <div style={{ background: '#0369a1', padding: '1rem', borderRadius: '12px', color: 'white' }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', display: 'block', marginBottom: '0.25rem', opacity: 0.8 }}>Required Velocity</span>
                  <div style={{ fontSize: '1.1rem', fontWeight: 900 }}>{hoursPerDay}h / Day</div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, opacity: 0.9 }}>To hit {remainingHours}h total</div>
                </div>
              </div>

              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'rgba(255,255,255,0.5)', borderRadius: '10px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0369a1' }}>
                  Timeline Buffer: 
                  <span style={{ color: gapBetweenDueAndPromised < 3 ? '#b91c1c' : '#0369a1', marginLeft: '0.5rem' }}>
                    {gapBetweenDueAndPromised} Days Gap
                  </span>
                </span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0369a1' }}>
                  Work Days Left: {Math.max(0, daysToDeadline)}
                </span>
              </div>
            </div>
          );
        })()}

        <div className="section-title">
          <span>Parts Readiness Status</span>
        </div>
        <div className="parts-container" style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          {(['steel', 'tyres', 'parts'] as const).map(part => (
            <button
              key={part}
              onClick={() => togglePart(part)}
              style={{
                flex: 1,
                padding: '0.75rem',
                borderRadius: '12px',
                border: '1px solid',
                borderColor: editForm.partsStatus[part] ? '#22c55e' : '#e2e8f0',
                background: editForm.partsStatus[part] ? '#f0fdf4' : 'white',
                color: editForm.partsStatus[part] ? '#166534' : '#64748b',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.25rem',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <span style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase' }}>{part}</span>
              <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{editForm.partsStatus[part] ? 'READY' : 'WAITING'}</span>
            </button>
          ))}
        </div>

        {!trailer.isArchived && (
          <div className="details-priority-banner" style={{ background: trailer.isPriority ? '#fee2e2' : '#f8fafc', borderColor: trailer.isPriority ? '#fca5a5' : '#e2e8f0', marginBottom: '2rem' }}>
            <div className="priority-label" style={{ color: trailer.isPriority ? '#b91c1c' : 'var(--text-secondary)' }}>
              <Crown size={16} fill={trailer.isPriority ? '#b91c1c' : 'transparent'} />
              <span>{trailer.isPriority ? 'High Priority Unit' : 'Standard Priority'}</span>
            </div>
            <button className={`btn btn-sm ${trailer.isPriority ? 'btn-danger' : 'btn-secondary'}`} onClick={togglePriority}>
              {trailer.isPriority ? 'Remove Priority' : 'Set High Priority'}
            </button>
          </div>
        )}

        <div className="section-title">
          <FileText size={16} />
          <span>Production Notes</span>
        </div>
        <div className="notes-editor">
          {trailer.isArchived ? (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem', color: '#475569', fontSize: '0.9rem', fontStyle: localNotes ? 'normal' : 'italic' }}>
              {localNotes || 'No production notes recorded for this unit.'}
            </div>
          ) : (
            <>
              <textarea 
                className="form-input" 
                rows={3} 
                placeholder="Add production issues, part delays, or specific instructions..."
                value={localNotes}
                onChange={(e) => setLocalNotes(e.target.value)}
              />
              {isEditing ? (
                <button className="btn btn-primary" style={{ marginTop: '1rem', width: '100%', padding: '1rem', fontSize: '1rem' }} onClick={handleSaveAll}>
                  Save All Unit Modifications
                </button>
              ) : (
                <button className="btn btn-primary" style={{ marginTop: '0.75rem', width: '100%' }} onClick={handleSaveAll}>
                  <Send size={14} />
                  Update Production Notes
                </button>
              )}
            </>
          )}
        </div>

        <div className="section-title" style={{ marginTop: '2.5rem' }}>
          <History size={16} />
          <span>Unit Production History</span>
        </div>
        <div className="audit-log">
          {trailer.history.slice().reverse().map((log, idx) => (
            <div key={idx} className="audit-item">
              <div className="audit-dot" />
              <div className="audit-content">
                <div className="audit-header">
                  <span className="audit-phase" style={{ color: 'var(--accent)', fontWeight: 800 }}>{log.phase.toUpperCase()}</span>
                  <span className="audit-time">{formatDistanceToNow(log.enteredAt)} ago</span>
                </div>
                <div className="audit-meta" style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: '#64748b' }}>
                  <span style={{ color: '#94a3b8' }}>Entered at:</span> {format(log.enteredAt, 'MMM d, h:mm a')}
                  {log.exitedAt && (
                    <>
                      <span style={{ margin: '0 0.5rem', opacity: 0.3 }}>•</span>
                      <span style={{ color: '#2563eb', fontWeight: 700 }}>{formatLogDuration(log.duration || 0)} duration</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
};
