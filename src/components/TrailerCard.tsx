import React, { useEffect, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Clock, Hash, MapPin, Calendar, Crown, StickyNote, Truck } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import type { Trailer, StationId } from '../types';
import { STATIONS, PHASE_METADATA, MODEL_TARGET_HOURS, PHASES } from '../types';

interface Props {
  trailer: Trailer;
  onUpdateTrailer?: (id: string, updates: Partial<Trailer>) => void;
  onCardClick?: () => void;
  onShipRequest?: (trailer: Trailer) => void;
  hideCustomerName?: boolean;
  hideShipButton?: boolean;
  isHighlighted?: boolean;
  suggestedBay?: StationId;
}

export const TrailerCard: React.FC<Props> = React.memo(({ 
  trailer, 
  onUpdateTrailer, 
  onCardClick,
  onShipRequest,
  hideCustomerName,
  hideShipButton,
  isHighlighted,
  suggestedBay
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: trailer.id,
    data: {
      type: 'Trailer',
      trailer
    }
  });

  useEffect(() => {
    if (isHighlighted && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isHighlighted]);

  const style = {
    transition,
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  const currentLog = trailer.history.find(h => h.phase === trailer.currentPhase && !h.exitedAt);
  const timeInPhase = currentLog ? formatDistanceToNow(currentLog.enteredAt) : '0m';

  const hoursRemaining = currentLog ? (Date.now() - currentLog.enteredAt) / (1000 * 60 * 60) : 0;
  const targetHours = MODEL_TARGET_HOURS[trailer.model]?.[trailer.currentPhase] 
    || PHASE_METADATA[trailer.currentPhase].defaultTargetHours;
  const isBottleneck = hoursRemaining > targetHours;

  const handleStationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation();
    onUpdateTrailer?.(trailer.id, { station: e.target.value as StationId });
  };

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        (cardRef as any).current = node;
      }}
      style={style}
      className={`trailer-card ${isBottleneck ? 'is-bottleneck' : ''} ${isHighlighted ? 'is-highlighted' : ''}`}
      {...attributes}
      {...listeners}
      onClick={() => onCardClick?.()}
    >
      <div className="card-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
        <div className="card-title" style={{ flex: 1, minWidth: 0 }}>
          <span className="card-model" style={{ 
            display: 'block', 
            whiteSpace: 'nowrap', 
            overflow: 'hidden', 
            textOverflow: 'ellipsis',
            fontSize: '0.95rem'
          }}>{trailer.model}</span>
          {!hideCustomerName && (
            <span className="card-customer" style={{ 
              display: 'block', 
              whiteSpace: 'nowrap', 
              overflow: 'hidden', 
              textOverflow: 'ellipsis',
              fontSize: '0.75rem'
            }}>{trailer.name}</span>
          )}
        </div>
        {trailer.expectedDueDate && (
          <div style={{ 
            marginLeft: '0.75rem',
            padding: '0.4rem 0.6rem', 
            background: trailer.isPriority ? '#fff1f2' : '#eff6ff', 
            borderRadius: '8px', 
            border: `1px solid ${trailer.isPriority ? '#fecdd3' : '#dbeafe'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}>
            {trailer.isPriority && <Crown size={14} fill="#ef4444" color="#ef4444" />}
            <Calendar size={12} color={trailer.isPriority ? '#be123c' : '#2563eb'} />
            <span style={{ 
              fontSize: '0.75rem', 
              fontWeight: 700, 
              color: trailer.isPriority ? '#be123c' : '#2563eb',
              whiteSpace: 'nowrap'
            }}>
              {format(new Date(trailer.expectedDueDate), 'MMM d')}
            </span>
          </div>
        )}
      </div>
      
      <div className="card-meta">
        <div className="card-meta-item">
          <Hash className="card-meta-icon" />
          <span>{trailer.serialNumber}</span>
          {trailer.currentPhase === 'backlog' && trailer.station === 'None' && suggestedBay && (
            <span className="reco-badge-tag" style={{ marginLeft: '0.5rem' }}>
              RECO: {suggestedBay}
            </span>
          )}
        </div>
        
        <div 
          className="card-meta-item station-badge-wrapper" 
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bay:</span>
              <select 
                className="bay-select"
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#0f172a',
                  padding: '2px 8px',
                  cursor: 'pointer',
                  outline: 'none'
                }}
                value={trailer.station}
                onChange={(e) => onUpdateTrailer?.(trailer.id, { station: e.target.value as StationId })}
                onClick={(e) => e.stopPropagation()}
              >
                <option value="None">Off</option>
                {STATIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="card-meta-item">
          <Calendar className="card-meta-icon" />
          <span>Started {format(trailer.dateStarted, 'MMM d')}</span>
        </div>
      </div>
      
      {trailer.notes && (
        <div style={{ 
          marginTop: '0.25rem', 
          padding: '0.5rem 0.75rem', 
          background: '#f8fafc', 
          borderRadius: '8px', 
          border: '1px solid #f1f5f9',
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'start'
        }}>
          <StickyNote size={14} style={{ color: '#64748b', marginTop: '2px', flexShrink: 0 }} />
          <p style={{ 
            fontSize: '0.75rem', 
            color: '#475569', 
            margin: 0, 
            lineHeight: '1.4', 
            fontStyle: 'italic',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
          }}>
            {trailer.notes}
          </p>
        </div>
      )}

      <div className="card-footer">
          <div className="card-meta-item" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
              <div className="card-meta-item">
                <Clock className="card-meta-icon" style={{ color: isBottleneck ? 'white' : 'var(--accent)', width: '12px', height: '12px' }} />
                <span className={`card-time ${isBottleneck ? 'bottleneck-active' : ''}`} style={{ fontSize: '0.65rem' }}>{timeInPhase} (Stage: {Math.round(targetHours)}h)</span>
              </div>
              <div className="card-meta-item">
                <Hash className="card-meta-icon" style={{ color: isBottleneck ? 'white' : '#0ea5e9', width: '12px', height: '12px' }} />
                <span style={{ fontSize: '0.65rem', color: isBottleneck ? 'white' : 'var(--text-secondary)' }}>Pipeline: {Math.round(
                  (() => {
                    let pipe = Math.max(0, targetHours - (currentLog?.bayManualHours || currentLog?.phaseManualHours || 0));
                    const pIdx = PHASES.findIndex(p => p.id === trailer.currentPhase);
                    if (pIdx !== -1) {
                      PHASES.slice(pIdx + 1).forEach(f => {
                        if (f.id !== 'shipping') pipe += (MODEL_TARGET_HOURS[trailer.model]?.[f.id] || 0);
                      });
                    }
                    return pipe;
                  })()
                )}h</span>
              </div>
            </div>
            
            {trailer.currentPhase !== 'shipping' && trailer.currentPhase !== 'backlog' && (
              <div 
                className="log-hours-pill" 
                style={{ padding: '2px 6px', background: isBottleneck ? 'rgba(255,255,255,0.2)' : '#f1f5f9', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <span style={{ fontSize: '0.55rem', fontWeight: 800, color: isBottleneck ? 'white' : '#64748b' }}>LOG:</span>
                <input 
                  type="number"
                  placeholder="0"
                  style={{ width: '32px', border: 'none', background: 'transparent', fontSize: '0.7rem', fontWeight: 700, color: isBottleneck ? 'white' : 'var(--text-primary)', padding: 0, outline: 'none', textAlign: 'center' }}
                  value={currentLog?.bayManualHours || currentLog?.phaseManualHours || ''}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    const updatedHistory = trailer.history.map(h => 
                      h.phase === trailer.currentPhase && !h.exitedAt 
                        ? { ...h, bayManualHours: isNaN(val) ? undefined : val, phaseManualHours: isNaN(val) ? undefined : val } 
                        : h
                    );
                    onUpdateTrailer?.(trailer.id, { history: updatedHistory });
                  }}
                />
              </div>
            )}
          </div>
        
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          {trailer.finishingType && (
            <span className="badge-finishing" data-type={trailer.finishingType}>
              {trailer.finishingType}
            </span>
          )}
        </div>
      </div>

      {trailer.currentPhase === 'shipping' && !hideShipButton && (
        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #f1f1f4' }}>
          <button 
            className="btn btn-primary" 
            style={{ width: '100%', gap: '0.75rem', background: '#10b981' }} 
            onClick={(e) => {
              e.stopPropagation();
              if (onShipRequest) onShipRequest(trailer);
              else onUpdateTrailer?.(trailer.id, { isArchived: true, archivedAt: Date.now() });
            }}
          >
            <Truck size={16} /> Mark as Shipped
          </button>
        </div>
      )}
    </div>
  );
});
