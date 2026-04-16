import React from 'react';
import { formatDistanceToNow, format, differenceInCalendarDays, subDays } from 'date-fns';
import { History, FileText, Send, Crown, Calculator, CalendarClock } from 'lucide-react';
import type { Trailer } from '../types';
import { BAY_WEEKLY_HOURS, calculateTrailerRemainingHours, PHASES } from '../types';
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

  const phaseTimes = React.useMemo(() => {
    const result: Record<string, { h: number, m: number }> = {};
    PHASES.forEach(p => {
      const entries = trailer.history.filter(h => h.phase === p.id);
      const manualHours = entries.reduce((sum, h) => sum + (h.phaseManualHours || h.bayManualHours || 0), 0);
      const hasManual = entries.some(h => (h.phaseManualHours !== undefined || h.bayManualHours !== undefined));
      
      if (hasManual) {
        const positiveManual = Math.max(0, manualHours);
        result[p.id] = { 
          h: Math.floor(positiveManual), 
          m: Math.round((positiveManual % 1) * 60) 
        };
      } else {
        const durationMs = Math.max(0, entries.reduce((sum, log) => {
          return sum + (log.duration || (log.exitedAt ? log.exitedAt - log.enteredAt : Date.now() - log.enteredAt));
        }, 0));
        const totalMins = Math.floor(durationMs / (1000 * 60));
        result[p.id] = { 
          h: Math.floor(totalMins / 60), 
          m: totalMins % 60 
        };
      }
    });
    return result;
  }, [trailer.history]);

  const totalTimeDisplay = React.useMemo(() => {
    const activePhases = PHASES.filter(p => !['backlog', 'shipping'].includes(p.id));
    const totalMinutes = activePhases.reduce((sum, p) => {
      const time = phaseTimes[p.id] || { h: 0, m: 0 };
      return sum + (time.h * 60) + time.m;
    }, 0);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}h ${m}m`;
  }, [phaseTimes]);

  const formatLogDuration = (ms: number) => {
    const totalMinutes = Math.floor(ms / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const isDuplicateSerial = allTrailers.some(t => t.serialNumber === editForm.serialNumber && t.id !== trailer.id);

  const handleSaveAll = () => {
    if (isDuplicateSerial) return;
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
                 <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                   <span>Serial Number</span>
                   {isDuplicateSerial && (
                     <span style={{ color: '#ef4444', fontSize: '0.7rem', fontWeight: 800 }}>ALREADY EXISTS!</span>
                   )}
                 </label>
                 <input 
                   className="form-input" 
                   style={{ 
                     borderColor: isDuplicateSerial ? '#fecdd3' : undefined,
                     backgroundColor: isDuplicateSerial ? '#fff1f2' : undefined 
                   }}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                <span style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.1 }}>{trailer.name}</span>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>SN: {trailer.serialNumber} • {trailer.model}</span>
              </div>
              {!trailer.isArchived && (
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {isEditing && (
                    <button 
                      className="btn btn-primary btn-sm" 
                      onClick={handleSaveAll} 
                      disabled={isDuplicateSerial}
                      style={{ 
                        background: '#2563eb', 
                        padding: '4px 12px', 
                        fontSize: '0.7rem',
                        opacity: isDuplicateSerial ? 0.6 : 1
                      }}
                    >
                      Save
                    </button>
                  )}
                  <button 
                    className={`btn btn-sm ${isEditing ? 'btn-danger' : 'btn-secondary'}`}
                    onClick={() => setIsEditing(!isEditing)}
                    style={{ padding: '4px 12px', fontSize: '0.7rem' }}
                  >
                    {isEditing ? 'Cancel' : 'Edit Info'}
                  </button>
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div>
                <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Expected Due</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{trailer.expectedDueDate ? format(new Date(trailer.expectedDueDate + 'T12:00:00'), 'MMM d, yyyy') : 'NOT SET'}</span>
              </div>
              <div>
                <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Promised Shipping</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{trailer.promisedShippingDate ? format(new Date(trailer.promisedShippingDate + 'T12:00:00'), 'MMM d, yyyy') : 'NOT SET'}</span>
              </div>
            </div>

            {/* Production Time Summary - Consolidate HH:MM Editing */}
            <div style={{ padding: '1.25rem', background: '#f0fdfa', borderRadius: '16px', border: '1px solid #99f6e4' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <History size={16} color="#0d9488" />
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0d9488', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Production Hours</span>
                </div>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0d9488', background: 'white', padding: '2px 10px', borderRadius: '99px', border: '1px solid #99f6e4' }}>
                  Total: {totalTimeDisplay}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.75rem' }}>
                {PHASES.filter(p => !['backlog', 'shipping'].includes(p.id)).map(phase => {
                  const time = phaseTimes[phase.id] || { h: 0, m: 0 };

                  const updateManualTime = (newH: number) => {
                    const decimalVal = newH; // Hours only
                    const updatedHistory = [...trailer.history];
                    let targetIdx = -1;
                    for (let i = updatedHistory.length - 1; i >= 0; i--) {
                      if (updatedHistory[i].phase === phase.id) { targetIdx = i; break; }
                    }
                    if (targetIdx !== -1) {
                      updatedHistory[targetIdx] = { 
                        ...updatedHistory[targetIdx], 
                        phaseManualHours: decimalVal, 
                        bayManualHours: decimalVal 
                      };
                      onUpdate(trailer.id, { history: updatedHistory });
                    }
                  };

                  return (
                    <div key={phase.id} style={{ background: 'white', padding: '0.6rem', borderRadius: '12px', border: '1px solid #ccfbf1', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
                      <div style={{ fontSize: '0.6rem', fontWeight: 800, color: '#134e4a', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.025em' }}>{phase.title}</div>
                      <div style={{ display: 'flex', alignItems: 'center', background: '#f0fdfa', borderRadius: '6px', padding: '4px 8px', border: '1.5px solid #f0fdfa' }}>
                        <input 
                          type="text"
                          inputMode="numeric"
                          style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '1rem', fontWeight: 900, color: '#134e4a', textAlign: 'left', outline: 'none' }}
                          value={time.h || ''}
                          placeholder="0"
                          onChange={(e) => {
                            const v = Math.max(0, parseInt(e.target.value.replace(/\D/g, ''), 10) || 0);
                            updateManualTime(v);
                          }}
                        />
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginLeft: '4px' }}>h</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sequential Queue Completion Range */}
            {!trailer.isArchived && trailer.station !== 'None' && (() => {
              const getHours = (t: Trailer) => calculateTrailerRemainingHours(t);

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
          const remainingHours = calculateTrailerRemainingHours(trailer);

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
