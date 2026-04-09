import React from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { History, FileText, Send, Crown } from 'lucide-react';
import type { Trailer } from '../types';
import { Modal } from './Modal';

interface Props {
  trailer: Trailer;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Trailer>) => void;
}

export const TrailerDetailsModal: React.FC<Props> = ({ trailer, isOpen, onClose, onUpdate }) => {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editForm, setEditForm] = React.useState({
    name: trailer.name,
    model: trailer.model,
    serialNumber: trailer.serialNumber,
    partsStatus: trailer.partsStatus || { steel: false, tyres: false, parts: false },
    expectedDueDate: trailer.expectedDueDate || '',
    expectedShippingDate: trailer.expectedShippingDate || ''
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
                <label className="form-label">Expected Shipping Date</label>
                <input 
                  type="date"
                  className="form-input" 
                  value={editForm.expectedShippingDate} 
                  onChange={e => setEditForm({...editForm, expectedShippingDate: e.target.value})}
                />
             </div>
          </div>
        ) : (
          <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{trailer.name}</span>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>SN: {trailer.serialNumber}</span>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div>
                <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Expected Due</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{trailer.expectedDueDate ? format(new Date(trailer.expectedDueDate + 'T12:00:00'), 'MMM d, yyyy') : 'NOT SET'}</span>
              </div>
              <div>
                <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Shipping Date</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{trailer.expectedShippingDate ? format(new Date(trailer.expectedShippingDate + 'T12:00:00'), 'MMM d, yyyy') : 'NOT SET'}</span>
              </div>
            </div>
          </div>
        )}

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
