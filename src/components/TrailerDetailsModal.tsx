import React, { useState, useEffect } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { History, FileText, Send, Crown, Trash2, Image as ImageIcon, DollarSign, Download } from 'lucide-react';
import type { Trailer, PhaseId, ShippedTrailer, UserRole } from '../types';
import { BAY_WEEKLY_HOURS, calculateTrailerRemainingHours, PHASES } from '../types';
import { Modal } from './Modal';
import { injectTrailerDataIntoSpec } from '../lib/injectSpecSheet';
import { supabase } from '../lib/supabase';

interface Props {
  trailer: Trailer;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Trailer>) => void;
  allTrailers?: Trailer[];
  localTargetHours: Record<string, Record<PhaseId, number>>;
  localSpecSheetTemplates?: Record<string, string>;
  onDeleteTrailer?: (id: string) => void;
  shippedTrailers?: ShippedTrailer[];
  userRole: UserRole;
  isPriceUnlockedGlobally?: boolean;
  onUnlockPrices?: () => boolean;
  initialMode?: 'view' | 'edit';
}

export const TrailerDetailsModal: React.FC<Props> = ({ trailer, isOpen, onClose, onUpdate, allTrailers = [], localTargetHours, localSpecSheetTemplates = {}, onDeleteTrailer, shippedTrailers = [], userRole, isPriceUnlockedGlobally, onUnlockPrices, initialMode = 'view' }) => {
  const [isEditing, setIsEditing] = React.useState(initialMode === 'edit');
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  const [heavyData, setHeavyData] = useState<{
    spec_sheet_file?: string | null;
    inspection_sheet_file?: string | null;
    photo_1_url?: string | null;
    photo_2_url?: string | null;
    photo_3_url?: string | null;
  }>({});
  const [isLoadingHeavy, setIsLoadingHeavy] = useState(false);

  useEffect(() => {
    if (!isOpen || !trailer.id) return;
    
    // Check if we already have the data in the passed trailer prop to avoid redundant loads
    if (trailer.spec_sheet_file !== undefined) {
      setHeavyData({
        spec_sheet_file: trailer.spec_sheet_file,
        inspection_sheet_file: trailer.inspection_sheet_file,
        photo_1_url: trailer.photo_1_url,
        photo_2_url: trailer.photo_2_url,
        photo_3_url: trailer.photo_3_url
      });
      return;
    }

    const loadHeavyTrailer = async () => {
      setIsLoadingHeavy(true);
      try {
        const { data } = await supabase
          .from('trailers')
          .select('spec_sheet_file, inspection_sheet_file, photo_1_url, photo_2_url, photo_3_url')
          .eq('id', trailer.id)
          .single();
        if (data) {
          setHeavyData({
            spec_sheet_file: data.spec_sheet_file || null,
            inspection_sheet_file: data.inspection_sheet_file || null,
            photo_1_url: data.photo_1_url || null,
            photo_2_url: data.photo_2_url || null,
            photo_3_url: data.photo_3_url || null
          });
        }
      } catch (err) {
        console.error("Error loading heavy fields for trailer modal:", err);
      } finally {
        setIsLoadingHeavy(false);
      }
    };
    loadHeavyTrailer();
  }, [trailer.id, isOpen, trailer.spec_sheet_file]);

  const [localShippedRecord, setLocalShippedRecord] = useState<ShippedTrailer | null>(null);

  useEffect(() => {
    if (!isOpen || !trailer.isArchived || !trailer.serialNumber) return;
    
    const found = shippedTrailers.find(s => s.serial_number === trailer.serialNumber);
    if (found && found.photo_1_url !== undefined) {
      setLocalShippedRecord(found);
      return;
    }

    const loadShippedRecord = async () => {
      try {
        const { data } = await supabase
          .from('shipped_trailers')
          .select('photo_1_url, photo_2_url, photo_3_url')
          .eq('serial_number', trailer.serialNumber)
          .single();
        if (data) {
          setLocalShippedRecord(data as ShippedTrailer);
        }
      } catch (err) {
        console.error("Error loading shipped record in details modal:", err);
      }
    };
    loadShippedRecord();
  }, [trailer.serialNumber, trailer.isArchived, isOpen, shippedTrailers]);

  const specSheetFile = trailer.spec_sheet_file !== undefined ? trailer.spec_sheet_file : heavyData.spec_sheet_file;
  const inspectionSheetFile = trailer.inspection_sheet_file !== undefined ? trailer.inspection_sheet_file : heavyData.inspection_sheet_file;

  const [editForm, setEditForm] = useState({
    name: trailer.name || '',
    notes: trailer.notes || '',
    isPriority: trailer.isPriority || false,
    promisedShippingDate: trailer.promisedShippingDate || '',
    serialNumber: trailer.serialNumber || '',
    partsStatus: trailer.partsStatus || { steel: false, tyres: false, parts: false },
    sale_price: trailer.sale_price?.toString() || '',
    spec_sheet_file: specSheetFile || undefined,
    inspection_sheet_file: inspectionSheetFile || undefined
  });

  useEffect(() => {
    if (specSheetFile !== undefined || inspectionSheetFile !== undefined) {
      setEditForm(prev => ({
        ...prev,
        spec_sheet_file: specSheetFile || undefined,
        inspection_sheet_file: inspectionSheetFile || undefined
      }));
    }
  }, [specSheetFile, inspectionSheetFile]);

  const [localNotes, setLocalNotes] = React.useState(trailer.notes || '');

  const handleGenerateSpecSheet = async () => {
    if (!trailer.trailer_color || !trailer.trailer_plug || !trailer.sale_price) {
      alert("Please fill in the missing Color, Plug, and Sale Price before generating the Spec Sheet.");
      setIsEditing(true);
      return;
    }

    const templateBase64 = localSpecSheetTemplates[trailer.model];
    if (!templateBase64) return;
    try {
      const injected = await injectTrailerDataIntoSpec(
        templateBase64,
        trailer.serialNumber,
        trailer.name,
        trailer.trailer_color,
        trailer.trailer_plug,
        trailer.sale_price || undefined,
        trailer.salesPerson,
        trailer.dealerLocation,
        trailer.dealerCommonAddress
      );
      handleSpecSheetUpdate(injected);
    } catch (error) {
      console.error("Failed to generate spec sheet", error);
    }
  };

  const handleSpecSheetUpdate = (newFileBase64: string) => {
    setEditForm(prev => ({ 
      ...prev, 
      spec_sheet_file: newFileBase64 
    }));
    
    onUpdate(trailer.id, { 
      spec_sheet_file: newFileBase64
    });
  };

  const phaseTimes = React.useMemo(() => {
    const result: Record<string, { h: number, m: number }> = {};
    PHASES.forEach(p => {
      const entries = trailer.history.filter(h => h.phase === p.id);
      let totalMs = 0;
      
      entries.forEach(log => {
        if (log.phaseManualHours !== undefined || log.bayManualHours !== undefined) {
          const manualHrs = log.phaseManualHours !== undefined ? log.phaseManualHours : (log.bayManualHours || 0);
          totalMs += manualHrs * 60 * 60 * 1000;
        } else {
          totalMs += (log.duration || (log.exitedAt ? log.exitedAt - log.enteredAt : Date.now() - log.enteredAt));
        }
      });
      
      const totalMins = Math.floor(Math.max(0, totalMs) / (1000 * 60));
      result[p.id] = { 
        h: Math.floor(totalMins / 60), 
        m: totalMins % 60 
      };
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
      sale_price: editForm.sale_price ? parseFloat(editForm.sale_price) : (editForm.sale_price === '' ? null : undefined),
      notes: localNotes 
    };
    onUpdate(trailer.id, updates);
    setIsEditing(false);
  };

  const togglePriority = () => {
    onUpdate(trailer.id, { isPriority: !trailer.isPriority });
  };

  return (
    <>
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
                    onChange={e => {
                      const val = e.target.value;
                      setEditForm({ ...editForm, serialNumber: val });
                    }}
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
                  onFocus={(e) => e.target.showPicker()}
                  style={{ background: 'rgba(255,255,255,0.02)', fontWeight: 700 }}
                />
              </div>
              <div style={{ background: 'var(--priority-bg)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--priority-border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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
              {userRole === 'manager' && (
                <div style={{ background: 'rgba(217, 119, 6, 0.05)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(217, 119, 6, 0.2)' }}>
                  <label className="form-label" style={{ color: '#d97706', fontSize: '0.75rem', fontWeight: 800 }}>Sale Price ($)</label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      key={isPriceUnlockedGlobally ? 'unlocked-edit' : 'locked-edit'}
                      type={isPriceUnlockedGlobally ? "number" : "password"}
                      className="form-input" 
                      placeholder={isPriceUnlockedGlobally ? "0.00" : "••••••"}
                      style={{ borderColor: '#d97706', background: 'var(--bg-card)', fontWeight: 700, color: 'var(--text-primary)' }}
                      value={editForm.sale_price}
                      onChange={e => setEditForm({ ...editForm, sale_price: e.target.value })}
                      onFocus={() => {
                        if (!isPriceUnlockedGlobally && onUnlockPrices) {
                          onUnlockPrices();
                        }
                      }}
                    />
                    <DollarSign size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#d97706' }} />
                  </div>
                </div>
              )}
              <div style={{ gridColumn: 'span 2', background: 'rgba(59, 130, 246, 0.05)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                <label className="form-label" style={{ fontSize: '0.65rem', color: '#1d4ed8', marginBottom: '1rem', display: 'block', fontWeight: 800 }}>SPEC SHEET (EXCEL)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {editForm.spec_sheet_file ? (
                    <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                      <button 
                        type="button"
                        className="btn btn-secondary" 
                        onClick={() => {
                          const a = document.createElement('a');
                          a.href = editForm.spec_sheet_file!;
                          const baseName = (editForm.serialNumber || trailer.model || 'Trailer').trim();
                          a.download = `${baseName}_SpecSheet.xlsx`;
                          a.click();
                        }}
                        style={{ padding: '0.5rem', fontSize: '0.8rem', flex: 1 }}
                      >
                        Download
                      </button>
                      <label className="btn btn-primary shimmer" style={{ padding: '0.5rem', fontSize: '0.8rem', flex: 1, margin: 0, cursor: 'pointer', textAlign: 'center' }}>
                        Replace
                        <input 
                          type="file" 
                          accept=".xlsx,.xls" 
                          style={{ display: 'none' }} 
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (evt) => {
                                if (evt.target?.result) {
                                  handleSpecSheetUpdate(evt.target.result as string);
                                }
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>No spec sheet available.</span>
                      {localSpecSheetTemplates[trailer.model] && (
                        <button
                          type="button"
                          className="btn btn-primary shimmer"
                          onClick={handleGenerateSpecSheet}
                          style={{ padding: '0.5rem', fontSize: '0.8rem', width: '100%' }}
                        >
                          Generate from Model Template
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ gridColumn: 'span 2', marginTop: '1rem' }}>
                <button 
                  className="btn btn-primary" 
                  style={{ width: '100%', padding: '0.85rem', borderRadius: '12px', fontWeight: 900, fontSize: '0.9rem' }}
                  onClick={handleSaveAll}
                  disabled={isDuplicateSerial}
                >
                  {isDuplicateSerial ? 'SERIAL ALREADY EXISTS!' : 'SAVE CHANGES'}
                </button>
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
                        background: 'var(--bg-card)', padding: '12px', borderRadius: '12px', border: '1px solid var(--priority-border)',
                        boxShadow: 'var(--shadow-lg)', zIndex: 100, width: '180px'
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
                        style={{ width: '30px', height: '30px', borderRadius: '8px', border: '1px solid var(--priority-border)', background: 'var(--priority-bg)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                        title="Delete Trailer"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: userRole === 'manager' ? '1fr 1fr 1fr' : '1fr 1fr', gap: '1rem' }}>
              {userRole === 'manager' && (
                <div 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isPriceUnlockedGlobally && onUnlockPrices) {
                      onUnlockPrices();
                    }
                  }}
                  style={{ background: 'rgba(217, 119, 6, 0.05)', padding: '0.75rem 1.25rem', borderRadius: '16px', border: '1px solid rgba(217, 119, 6, 0.2)', textAlign: 'right', cursor: isPriceUnlockedGlobally ? 'default' : 'pointer' }}
                >
                  <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#d97706', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem' }}>
                    <DollarSign size={10} /> Sale Price
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 900, color: '#d97706' }}>
                    {isPriceUnlockedGlobally ? (trailer.sale_price != null ? `$${trailer.sale_price.toLocaleString()}` : 'NOT SET') : '••••••'}
                  </div>
                </div>
              )}
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

            <div style={{ padding: '1.25rem', background: 'rgba(16, 185, 129, 0.05)', borderRadius: '16px', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <History size={16} color="#0d9488" />
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0d9488', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Production Hours</span>
                </div>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0d9488', background: 'var(--bg-card)', padding: '2px 10px', borderRadius: '99px', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
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
                    <div key={phase.id} style={{ background: 'var(--bg-card)', padding: '0.6rem', borderRadius: '12px', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-sm)' }}>
                      <div style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.025em' }}>{phase.title}</div>
                      <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-secondary)', borderRadius: '6px', padding: '4px 8px', border: '1.5px solid var(--border-default)' }}>
                        <input 
                          type="text"
                          inputMode="numeric"
                          style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '1rem', fontWeight: 900, color: 'var(--text-primary)', textAlign: 'left', outline: 'none' }}
                          value={time.h || ''}
                          placeholder="0"
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, '');
                            if (raw === '') { updateManualTime(0); return; }
                            const v = Math.max(0, parseInt(raw, 10));
                            updateManualTime(v);
                          }}
                        />
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginLeft: '4px' }}>h</span>
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
              const shipped = shippedTrailers.find(s => s.serial_number === trailer.serialNumber) || localShippedRecord;
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
              <div style={{ padding: '1rem', background: 'rgba(34, 197, 94, 0.05)', borderRadius: '12px', border: '1px solid rgba(34, 197, 94, 0.1)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                   <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#15803d', textTransform: 'uppercase' }}>Customer Name</span>
                   <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', display: 'block' }}>{trailer.name || '—'}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {!isEditing && (specSheetFile || localSpecSheetTemplates[trailer.model]) && (
          <>
            <div className="section-title" style={{ marginTop: '2rem' }}><FileText size={16} /><span>Spec Sheet (Excel)</span></div>
            <div style={{ marginBottom: '2rem', background: 'rgba(59, 130, 246, 0.05)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Excel Spec Sheet</span>
              {isLoadingHeavy ? (
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading...</span>
              ) : specSheetFile ? (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => {
                      const a = document.createElement('a');
                      a.href = specSheetFile!;
                      const baseName = (trailer.serialNumber || trailer.model || 'Trailer').trim();
                      a.download = `${baseName}_SpecSheet.xlsx`;
                      a.click();
                    }}
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  >
                    Download
                  </button>
                  <label className="btn btn-primary shimmer" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', cursor: 'pointer', margin: 0 }}>
                    Replace
                    <input 
                      type="file" 
                      accept=".xlsx,.xls" 
                      style={{ display: 'none' }} 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (evt) => {
                            if (evt.target?.result) {
                              handleSpecSheetUpdate(evt.target.result as string);
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                </div>
              ) : (
                <button 
                  className="btn btn-primary shimmer" 
                  onClick={handleGenerateSpecSheet}
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                >
                  Generate from Template
                </button>
              )}
            </div>
          </>
        )}

        <div className="section-title"><span>Parts Readiness Status</span></div>
        <div className="parts-container" style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          {(['steel', 'tyres', 'parts'] as const).map(part => (
            <button
              key={part} onClick={() => togglePart(part)}
              style={{ 
                flex: 1, 
                padding: '0.75rem', 
                borderRadius: '12px', 
                border: '1px solid', 
                borderColor: editForm.partsStatus[part] ? 'rgba(34, 197, 94, 0.3)' : 'var(--border-default)', 
                background: editForm.partsStatus[part] ? 'rgba(34, 197, 94, 0.1)' : 'var(--bg-card)', 
                color: editForm.partsStatus[part] ? '#166534' : 'var(--text-muted)', 
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

        {!trailer.isArchived && !isEditing && (
          <div className="details-priority-banner" style={{ background: trailer.isPriority ? 'var(--priority-bg)' : 'var(--bg-secondary)', borderColor: trailer.isPriority ? 'var(--priority-border)' : 'var(--border-default)', marginBottom: '2rem' }}>
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

        <div className="section-title"><ImageIcon size={16} /><span>Photos & Documents</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
          {(() => {
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
              <>
                {[1, 2, 3].map(num => {
                  const field = `photo_${num}_url` as keyof Trailer;
                  const url = (trailer[field] !== undefined ? trailer[field] : (heavyData as any)[field]) as string | undefined;

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
                        cursor: isLoadingHeavy ? 'default' : 'pointer',
                        overflow: 'hidden',
                        transition: 'all 0.2s'
                      }}>
                        {isLoadingHeavy ? (
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Loading...</span>
                        ) : url ? (
                          <img src={url} alt={`Photo ${num}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : !trailer.isArchived ? (
                          <>
                            <ImageIcon size={20} color="var(--text-muted)" />
                            <span style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: '4px' }}>Add Photo {num}</span>
                          </>
                        ) : (
                          <span style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>No Photo</span>
                        )}
                        {!trailer.isArchived && !isLoadingHeavy && (
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
                      {url && !trailer.isArchived && !isLoadingHeavy && (
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

          {/* Inspection Sheet Box */}
          <div style={{ position: 'relative' }}>
            <label style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center', 
              height: '100px', 
              background: inspectionSheetFile ? 'transparent' : 'rgba(16, 185, 129, 0.05)', 
              border: '1px dashed rgba(16, 185, 129, 0.4)', 
              borderRadius: '12px', 
              cursor: isLoadingHeavy ? 'default' : 'pointer',
              overflow: 'hidden',
              transition: 'all 0.2s'
            }}>
              {isLoadingHeavy ? (
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Loading...</span>
              ) : inspectionSheetFile ? (
                inspectionSheetFile.startsWith('data:image/') ? (
                  <img src={inspectionSheetFile} alt="Inspection" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#059669' }}>
                    <FileText size={24} />
                    <span style={{ fontSize: '0.6rem', fontWeight: 800, marginTop: '4px' }}>DOCUMENT</span>
                  </div>
                )
              ) : !trailer.isArchived ? (
                <>
                  <FileText size={20} color="rgba(16, 185, 129, 0.6)" />
                  <span style={{ fontSize: '0.6rem', fontWeight: 800, color: '#059669', textTransform: 'uppercase', marginTop: '4px', textAlign: 'center' }}>Add<br/>Inspection</span>
                </>
              ) : (
                <span style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'center' }}>No<br/>Inspection</span>
              )}
              {!trailer.isArchived && !isLoadingHeavy && (
                <input 
                  type="file" 
                  accept="image/*,.pdf" 
                  style={{ display: 'none' }} 
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.type.startsWith('image/')) {
                        const base64 = await fileToBase64(file);
                        onUpdate(trailer.id, { inspection_sheet_file: base64 });
                      } else {
                        const reader = new FileReader();
                        reader.onload = (evt) => {
                          if (evt.target?.result) {
                            onUpdate(trailer.id, { inspection_sheet_file: evt.target.result as string });
                          }
                        };
                        reader.readAsDataURL(file);
                      }
                    }
                  }}
                />
              )}
            </label>
            {inspectionSheetFile && !isLoadingHeavy && (
              <button
                className="btn-icon"
                style={{ position: 'absolute', top: '4px', left: '4px', background: 'rgba(0,0,0,0.5)', padding: '4px' }}
                onClick={(e) => {
                  e.preventDefault();
                  const a = document.createElement('a');
                  a.href = inspectionSheetFile!;
                  const baseName = (trailer.serialNumber || trailer.model || 'Trailer').trim();
                  a.download = `${baseName}_InspectionSheet`;
                  a.click();
                }}
              >
                <Download size={12} color="#fff" />
              </button>
            )}
            {inspectionSheetFile && !trailer.isArchived && !isLoadingHeavy && (
              <button 
                onClick={(e) => {
                  e.preventDefault();
                  onUpdate(trailer.id, { inspection_sheet_file: undefined });
                }}
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
              </>
            );
          })()}
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

    </>
  );
};
