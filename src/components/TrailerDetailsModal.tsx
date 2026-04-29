import React, { useState } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { History, FileText, Send, Crown, Trash2, Image as ImageIcon } from 'lucide-react';
import type { Trailer, PhaseId, ShippedTrailer, UserRole } from '../types';
import { BAY_WEEKLY_HOURS, calculateTrailerRemainingHours, PHASES } from '../types';
import { Modal } from './Modal';

interface Props {
  trailer: Trailer;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Trailer>) => void;
  allTrailers?: Trailer[];
  localTargetHours: Record<string, Record<PhaseId, number>>;
  onDeleteTrailer?: (id: string) => void;
  shippedTrailers?: ShippedTrailer[];
  userRole: UserRole;
}

export const TrailerDetailsModal: React.FC<Props> = ({ trailer, isOpen, onClose, onUpdate, allTrailers = [], localTargetHours, onDeleteTrailer, shippedTrailers = [], userRole }) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [editForm, setEditForm] = useState({
    name: trailer.name || '',
    notes: trailer.notes || '',
    isPriority: trailer.isPriority || false,
    promisedShippingDate: trailer.promisedShippingDate || '',
    serialNumber: trailer.serialNumber || '',
    partsStatus: trailer.partsStatus || { steel: false, tyres: false, parts: false }
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

  const togglePart = (part: keyof typeof editForm.partsStatus) => {
    const newStatus = { ...editForm.partsStatus, [part]: !editForm.partsStatus[part] };
    setEditForm({ ...editForm, partsStatus: newStatus });
    if (!isEditing) {
      onUpdate(trailer.id, { partsStatus: newStatus });
    }
  };

  const handleSaveAll = () => {
    if (isDuplicateSerial) return;
    const updates: Partial<Trailer> = {
      ...editForm,
      notes: localNotes 
    };
    onUpdate(trailer.id, updates);
    setIsEditing(false);
  };

  const togglePriority = () => {
    onUpdate(trailer.id, { isPriority: !trailer.isPriority });
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
              <div>
                <label className="form-label" style={{ color: 'var(--text-muted)' }}>Customer / PO</label>
                <input 
                  className="form-input" 
                  value={editForm.name} 
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="Customer Name or Stock"
                  style={{ background: 'rgba(255,255,255,0.02)', fontWeight: 700 }}
                />
              </div>
              <div>
                <label className="form-label" style={{ color: 'var(--text-muted)' }}>Serial Number</label>
                <input 
                  className="form-input" 
                  value={editForm.serialNumber} 
                  onChange={e => setEditForm({ ...editForm, serialNumber: e.target.value })}
                  style={{ background: 'rgba(255,255,255,0.02)', fontWeight: 700 }}
                />
              </div>
              <div>
                <label className="form-label" style={{ color: 'var(--text-muted)' }}>Promised Shipping Date</label>
                <input 
                  type="date"
                  className="form-input" 
                  value={editForm.promisedShippingDate} 
                  onChange={e => setEditForm({ ...editForm, promisedShippingDate: e.target.value })}
                  style={{ background: 'rgba(255,255,255,0.02)', fontWeight: 700 }}
                />
              </div>
              <div style={{ background: '#fff1f2', padding: '1rem', borderRadius: '12px', border: '1px solid #fecdd3', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input 
                  type="checkbox" 
                  checked={editForm.isPriority} 
                  onChange={e => setEditForm({ ...editForm, isPriority: e.target.checked })} 
                  style={{ width: '20px', height: '20px' }}
                />
                <label style={{ fontSize: '0.85rem', fontWeight: 800, color: '#be123c', letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Crown size={18} /> SET AS HIGH PRIORITY UNIT
                </label>
              </div>
          </div>
        ) : (
          <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <span style={{ background: 'var(--accent)15', color: 'var(--accent)', padding: '4px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 900, textTransform: 'uppercase' }}>{trailer.serialNumber}</span>
                  {trailer.isPriority && (
                    <span style={{ background: '#ef444415', color: '#ef4444', padding: '4px 12px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Crown size={14} /> PRIORITY
                    </span>
                  )}
                </div>
                <h1 style={{ fontSize: '2.25rem', fontWeight: 900, letterSpacing: '-0.03em', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>{trailer.model}</h1>
                <p style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{trailer.name || 'Generic Stock'}</p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {!trailer.isArchived && (
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    {isEditing && (
                      <button 
                        className="btn btn-primary btn-sm" 
                        onClick={handleSaveAll} 
                        disabled={isDuplicateSerial}
                        style={{ background: '#2563eb', padding: '4px 12px', fontSize: '0.7rem', opacity: isDuplicateSerial ? 0.6 : 1 }}
                      >
                        Save
                      </button>
                    )}
                    {userRole === 'manager' && (
                      <button 
                        className={`btn btn-sm ${isEditing ? 'btn-danger' : 'btn-secondary'}`}
                        onClick={() => setIsEditing(!isEditing)}
                        style={{ padding: '4px 12px', fontSize: '0.7rem' }}
                      >
                        {isEditing ? 'Cancel' : 'Edit Info'}
                      </button>
                    )}
                  </div>
                )}
                
                {onDeleteTrailer && userRole === 'manager' && (
                  <div style={{ position: 'relative' }}>
                    {showDeleteConfirm ? (
                      <div className="delete-confirm-popover" style={{ 
                        position: 'absolute', right: 0, top: '100%', marginTop: '8px',
                        background: 'white', padding: '12px', borderRadius: '12px', border: '1px solid #fecdd3',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', zIndex: 100, width: '180px'
                      }}>
                        <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#9f1239', marginBottom: '8px', lineHeight: 1.2 }}>Delete this unit permanently?</p>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button 
                            className="btn btn-sm btn-danger" 
                            style={{ flex: 1, padding: '4px', fontSize: '0.65rem' }}
                            onClick={() => onDeleteTrailer(trailer.id)}
                          >
                            Delete
                          </button>
                          <button 
                            className="btn btn-sm btn-secondary" 
                            style={{ flex: 1, padding: '4px', fontSize: '0.65rem' }}
                            onClick={() => setShowDeleteConfirm(false)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button 
                        onClick={() => setShowDeleteConfirm(true)}
                        style={{ width: '30px', height: '30px', borderRadius: '8px', border: '1px solid #fee2e2', background: '#fff1f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                        title="Delete Trailer"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem 1.25rem', borderRadius: '16px', border: '1px solid var(--border-default)', textAlign: 'right' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Promised Date</div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {trailer.promisedShippingDate ? format(new Date(trailer.promisedShippingDate), 'MMM d, yyyy') : 'NOT SET'}
                </div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem 1.25rem', borderRadius: '16px', border: '1px solid var(--border-default)', textAlign: 'right' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Time in Shop</div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--accent)' }}>{formatDistanceToNow(trailer.dateStarted)}</div>
              </div>
            </div>

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
                    const decimalVal = newH;
                    const updatedHistory = [...trailer.history];
                    let targetIdx = -1;
                    for (let i = updatedHistory.length - 1; i >= 0; i--) {
                      if (updatedHistory[i].phase === phase.id) { targetIdx = i; break; }
                    }
                    if (targetIdx !== -1) {
                      updatedHistory[targetIdx] = { ...updatedHistory[targetIdx], phaseManualHours: decimalVal, bayManualHours: decimalVal };
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
                            const raw = e.target.value.replace(/\D/g, '');
                            if (raw === '') { updateManualTime(0); return; }
                            const v = Math.max(0, parseInt(raw, 10));
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

            {!trailer.isArchived && trailer.station !== 'None' && (() => {
              const getHours = (t: Trailer) => calculateTrailerRemainingHours(t, localTargetHours);
              const myHours = getHours(trailer);
              if (myHours === 0) return null;
              const bayQueue = allTrailers.filter(t => t.station === trailer.station && !t.isArchived && t.currentPhase !== 'shipping').sort((a, b) => a.dateStarted - b.dateStarted);
              const myIndex = bayQueue.findIndex(t => t.id === trailer.id);
              const trailersAhead = myIndex > 0 ? bayQueue.slice(0, myIndex) : [];
              const hoursAhead = trailersAhead.reduce((sum, t) => sum + getHours(t), 0);
              const totalHours = hoursAhead + myHours;
              const bayWeeklyHours = BAY_WEEKLY_HOURS[trailer.station] ?? 40;
              const bestDays = Math.ceil((totalHours / bayWeeklyHours) * 7);
              const bestDate = new Date(); bestDate.setDate(bestDate.getDate() + bestDays);
              const worstDays = Math.ceil(bestDays * 1.25);
              const worstDate = new Date(); worstDate.setDate(worstDate.getDate() + worstDays);
              const dueDate = trailer.promisedShippingDate ? new Date(trailer.promisedShippingDate + 'T12:00:00') : null;
              const bestLate = dueDate ? bestDate > dueDate : false;
              const worstLate = dueDate ? worstDate > dueDate : false;
              const bgColor = bestLate ? '#fff1f2' : (worstLate ? '#fffbeb' : '#f0f9ff');
              const borderColor = bestLate ? '#fecdd3' : (worstLate ? '#fde68a' : '#bae6fd');
              const textColor = bestLate ? '#9f1239' : (worstLate ? '#78350f' : '#0c4a6e');
              const labelColor = bestLate ? '#be123c' : (worstLate ? '#92400e' : '#0369a1');

              return (
                <div style={{ padding: '1rem', background: bgColor, borderRadius: '12px', border: `1px solid ${borderColor}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 800, color: labelColor, textTransform: 'uppercase' }}>Est. Completion Range</span>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: labelColor, background: 'rgba(255,255,255,0.6)', padding: '2px 8px', borderRadius: '99px' }}>
                      {myIndex >= 0 ? `#${myIndex + 1} in ${trailer.station} queue` : trailer.station} · {myHours}h
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                    <span style={{ fontSize: '1rem', fontWeight: 900, color: textColor }}>{format(bestDate, 'MMM d')}</span>
                    <span style={{ fontSize: '0.75rem', color: labelColor }}>→</span>
                    <span style={{ fontSize: '1rem', fontWeight: 900, color: textColor }}>{format(worstDate, 'MMM d, yyyy')}</span>
                  </div>
                  {(bestLate || worstLate) && (
                    <div style={{ marginTop: '0.6rem', padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.5)', borderRadius: '8px', fontSize: '0.65rem', fontWeight: 700, color: bestLate ? '#9f1239' : '#b45309' }}>
                      {bestLate ? '🔴 Even best-case exceeds expected due date' : '🟡 Worst-case may exceed expected due date'}
                    </div>
                  )}
                </div>
              );
            })()}

            {trailer.isArchived && (() => {
              const shipped = shippedTrailers.find(s => s.serial_number === trailer.serialNumber);
              if (!shipped) return null;
              const photos = [shipped.photo_1_url, shipped.photo_2_url, shipped.photo_3_url].filter(Boolean) as string[];
              if (photos.length === 0) return null;
              return (
                <div style={{ marginTop: '1rem', padding: '1.25rem', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '16px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
                    <ImageIcon size={16} color="var(--accent)" />
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent)' }}>Shipping Documentation</h3>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${photos.length}, 1fr)`, gap: '0.75rem' }}>
                    {photos.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer" style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-default)', display: 'block' }}>
                        <img src={url} alt="" style={{ width: '100%', height: '100px', objectFit: 'cover' }} />
                      </a>
                    ))}
                  </div>
                </div>
              );
            })()}

            {trailer.name && (
              <div style={{ padding: '1rem', background: '#f0fdf4', borderRadius: '12px', border: '1px solid #bbf7d0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                   <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#15803d', textTransform: 'uppercase' }}>Customer Name</span>
                   <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#14532d', display: 'block' }}>{trailer.name || '—'}</span>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="section-title"><span>Parts Readiness Status</span></div>
        <div className="parts-container" style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          {(['steel', 'tyres', 'parts'] as const).map(part => (
            <button
              key={part} onClick={() => togglePart(part)}
              style={{ flex: 1, padding: '0.75rem', borderRadius: '12px', border: '1px solid', borderColor: editForm.partsStatus[part] ? '#22c55e' : '#e2e8f0', background: editForm.partsStatus[part] ? '#f0fdf4' : 'white', color: editForm.partsStatus[part] ? '#166534' : '#64748b', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}
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
              {trailer.isPriority ? 'Remove' : 'Set High'}
            </button>
          </div>
        )}

        <div className="section-title"><FileText size={16} /><span>Production Notes</span></div>
        <div className="notes-editor">
          <textarea 
            className="form-input" rows={3} value={localNotes}
            onChange={(e) => setLocalNotes(e.target.value)}
            style={{ width: '100%', marginBottom: '1rem' }}
          />
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleSaveAll}><Send size={14} /> Update Notes</button>
        </div>

        <div className="section-title"><ImageIcon size={16} /><span>Production Photos</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
          {[1, 2, 3].map(num => {
            const field = `photo_${num}_url` as keyof Trailer;
            const url = trailer[field] as string | undefined;
            
            const fileToBase64 = (file: File): Promise<string> => {
              return new Promise((resolve) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = (e) => {
                  const img = new window.Image();
                  img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    const max = 1200;
                    if (width > height && width > max) { height *= max / width; width = max; }
                    else if (height > max) { width *= max / height; height = max; }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.6));
                  };
                  img.src = e.target?.result as string;
                };
              });
            };

            return (
              <div key={num} style={{ position: 'relative' }}>
                <label style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  height: '100px', 
                  background: url ? 'transparent' : 'rgba(255,255,255,0.02)', 
                  border: '1px dashed var(--border-default)', 
                  borderRadius: '12px', 
                  cursor: 'pointer',
                  overflow: 'hidden',
                  transition: 'all 0.2s'
                }}>
                  {url ? (
                    <img src={url} alt={`Photo ${num}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : !trailer.isArchived ? (
                    <>
                      <ImageIcon size={20} color="var(--text-muted)" />
                      <span style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '4px' }}>Add Photo {num}</span>
                    </>
                  ) : (
                    <span style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>No Photo</span>
                  )}
                  {!trailer.isArchived && (
                    <input 
                      type="file" 
                      accept="image/*" 
                      style={{ display: 'none' }} 
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const base64 = await fileToBase64(file);
                          onUpdate(trailer.id, { [field]: base64 });
                        }
                      }}
                    />
                  )}
                </label>
                {url && !trailer.isArchived && (
                  <button 
                    onClick={() => onUpdate(trailer.id, { [field]: null })}
                    style={{ 
                      position: 'absolute', top: '-8px', right: '-8px', 
                      width: '24px', height: '24px', borderRadius: '50%', 
                      background: '#ef4444', color: 'white', border: '2px solid white', 
                      display: 'flex', alignItems: 'center', justifyContent: 'center', 
                      cursor: 'pointer', zIndex: 10, boxShadow: '0 2px 4px rgba(0,0,0,0.2)' 
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="section-title" style={{ marginTop: '2.5rem' }}><History size={16} /><span>Unit History</span></div>
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
                  <span>Entered at:</span> {format(log.enteredAt, 'MMM d, h:mm a')}
                  {log.exitedAt && (
                    <><span style={{ margin: '0 0.5rem', opacity: 0.3 }}>•</span><span style={{ color: '#2563eb', fontWeight: 700 }}>{formatLogDuration(log.duration || 0)}</span></>
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
