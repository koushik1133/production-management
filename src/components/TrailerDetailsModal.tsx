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

  const handleSaveNotes = () => {
    onUpdate(trailer.id, { notes: localNotes });
  };

  const togglePriority = () => {
    onUpdate(trailer.id, { isPriority: !trailer.isPriority });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${trailer.serialNumber} • ${trailer.model}`}>
      <div className="details-container">
        <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>CUSTOMER / OPERATOR</span>
          <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{trailer.name}</span>
        </div>

        {!trailer.isArchived && (
          <div className="details-priority-banner" style={{ background: trailer.isPriority ? '#fee2e2' : '#f8fafc', borderColor: trailer.isPriority ? '#fca5a5' : '#e2e8f0' }}>
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
                rows={4} 
                placeholder="Add production issues, part delays, or specific instructions..."
                value={localNotes}
                onChange={(e) => setLocalNotes(e.target.value)}
              />
              <button className="btn btn-primary" style={{ marginTop: '0.75rem', width: '100%' }} onClick={handleSaveNotes}>
                <Send size={14} />
                Update Notes
              </button>
            </>
          )}
        </div>

        <div className="section-title" style={{ marginTop: '2rem' }}>
          <History size={16} />
          <span>Audit Log / History</span>
        </div>
        <div className="audit-log">
          {trailer.history.slice().reverse().map((log, idx) => (
            <div key={idx} className="audit-item">
              <div className="audit-dot" />
              <div className="audit-content">
                <div className="audit-header">
                  <span className="audit-phase">{log.phase.toUpperCase()}</span>
                  <span className="audit-time">{formatDistanceToNow(log.enteredAt)} ago</span>
                </div>
                <div className="audit-meta" style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                  <span style={{ color: '#94a3b8' }}>Entered:</span> {format(log.enteredAt, 'MMM d, h:mm a')}
                  {log.exitedAt && (
                    <>
                      <span style={{ margin: '0 0.5rem', opacity: 0.3 }}>•</span>
                      <span style={{ color: '#2563eb' }}>Stayed for {formatLogDuration(log.duration || 0)}</span>
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
