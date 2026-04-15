import React, { useEffect, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Clock, Hash, Calendar, Crown, StickyNote, Truck, Layers } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import type { Trailer, StationId } from '../types';
import { STATIONS, PHASE_METADATA, MODEL_TARGET_HOURS, calculateTrailerRemainingHours } from '../types';

interface Props {
  trailer: Trailer;
  onUpdateTrailer?: (id: string, updates: Partial<Trailer>) => void;
  onCardClick?: () => void;
  onShipRequest?: (trailer: Trailer) => void;
  hideCustomerName?: boolean;
  hideShipButton?: boolean;
  isHighlighted?: boolean;
  suggestedBay?: StationId;
  showPhaseBadge?: boolean;
}

export const TrailerCard: React.FC<Props> = React.memo(({ 
  trailer, 
  onUpdateTrailer, 
  onCardClick,
  onShipRequest,
  hideCustomerName,
  hideShipButton,
  isHighlighted,
  suggestedBay,
  showPhaseBadge
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
  const isBottleneck = trailer.currentPhase !== 'backlog' && hoursRemaining > targetHours;

  const timeToShipping = calculateTrailerRemainingHours(trailer);

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        (cardRef as any).current = node;
      }}
      style={{ ...style, position: 'relative' }}
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
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem', marginLeft: '0.75rem' }}>
          {/* Time to Shipping Indicator */}
          {trailer.currentPhase !== 'shipping' && (
            <div style={{ 
              display: 'flex', 
              padding: '0.3rem 0.6rem', 
              background: '#eff6ff', 
              color: '#2563eb', 
              borderRadius: '8px', 
              fontSize: '0.7rem', 
              fontWeight: 900, 
              alignItems: 'center', 
              gap: '0.3rem',
              border: '1px solid #dbeafe',
              whiteSpace: 'nowrap'
            }}>
              <span style={{ fontSize: '0.6rem' }}>{Math.round(timeToShipping)}H TO SHIP</span>
            </div>
          )}

          {trailer.expectedDueDate && (
            <div style={{ 
              padding: '0.3rem 0.6rem', 
              background: trailer.isPriority ? '#fff1f2' : '#f8fafc', 
              borderRadius: '8px', 
              border: `1px solid ${trailer.isPriority ? '#fecdd3' : '#e2e8f0'}`,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              whiteSpace: 'nowrap'
            }}>
              {trailer.isPriority && <Crown size={12} fill="#ef4444" color="#ef4444" />}
              <Calendar size={12} color={trailer.isPriority ? '#be123c' : '#64748b'} />
              <span style={{ 
                fontSize: '0.75rem', 
                fontWeight: 700, 
                color: trailer.isPriority ? '#be123c' : '#64748b'
              }}>
                {format(new Date(trailer.expectedDueDate), 'MMM d')}
              </span>
            </div>
          )}
        </div>
      </div>
      
      <div className="card-meta">
        <div className="card-meta-item">
          <Hash className="card-meta-icon" />
          <span>{trailer.serialNumber}</span>
          {showPhaseBadge && (
             <div style={{
               marginLeft: '0.5rem',
               display: 'flex',
               alignItems: 'center',
               gap: '0.3rem',
               background: '#f1f5f9',
               color: '#475569',
               padding: '2px 8px',
               borderRadius: '4px',
               fontSize: '0.65rem',
               fontWeight: 800,
               textTransform: 'uppercase',
               border: '1px solid #e2e8f0'
             }}>
               <Layers size={10} color="#64748b" strokeWidth={3} />
               {PHASE_METADATA[trailer.currentPhase].title}
             </div>
          )}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase' }}>Bay</span>
            <select 
              className="bay-select"
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
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
                <Clock className="card-meta-icon" style={{ color: 'var(--accent)', width: '12px', height: '12px' }} />
                <span className="card-time" style={{ fontSize: '0.65rem' }}>{timeInPhase} (Stage: {Math.round(targetHours)}h)</span>
              </div>
              <div className="card-meta-item">
                <Hash className="card-meta-icon" style={{ color: '#0ea5e9', width: '12px', height: '12px' }} />
                <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Pipeline: {Math.round(calculateTrailerRemainingHours(trailer))}h</span>
              </div>
            </div>
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
