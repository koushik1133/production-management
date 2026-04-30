import React, { useEffect, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Clock, Hash, Calendar, Crown, StickyNote, Truck, Layers } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import type { Trailer, StationId, PhaseId, UserRole } from '../types';
import { STATIONS, PHASE_METADATA, calculateTrailerRemainingHours } from '../types';

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
  isTVMode?: boolean;
  localTargetHours: Record<string, Record<PhaseId, number>>;
  isOverlay?: boolean;
  userRole: UserRole;
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
  showPhaseBadge,
  isTVMode,
  localTargetHours,
  isOverlay,
  userRole
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
    disabled: userRole !== 'manager',
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
    transition: isDragging ? 'none' : transition,
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? (isOverlay ? 1 : 0.3) : 1,
    zIndex: isDragging ? (isOverlay ? 1000 : 10) : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
    touchAction: 'none'
  };

  const currentLog = trailer.history.find(h => h.phase === trailer.currentPhase && !h.exitedAt);
  const timeInPhase = currentLog ? formatDistanceToNow(currentLog.enteredAt) : '0m';

  const hoursRemaining = currentLog ? (Date.now() - currentLog.enteredAt) / (1000 * 60 * 60) : 0;
  const targetHours = localTargetHours[trailer.model]?.[trailer.currentPhase] 
    || PHASE_METADATA[trailer.currentPhase].defaultTargetHours;
  const isBottleneck = trailer.currentPhase !== 'backlog' && hoursRemaining > targetHours;

  const timeToShipping = calculateTrailerRemainingHours(trailer, localTargetHours);

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        (cardRef as any).current = node;
      }}
      style={style}
      className={`trailer-card hover-lift ${isBottleneck ? 'is-bottleneck' : ''} ${isHighlighted ? 'is-highlighted' : ''}`}
      {...attributes}
      {...listeners}
      onClick={() => onCardClick?.()}
    >
      <div className="card-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
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
              padding: isTVMode ? '0.2rem 0.4rem' : '0.3rem 0.6rem', 
              background: 'var(--bg-secondary)', 
              color: 'var(--accent)', 
              borderRadius: '8px', 
              fontSize: isTVMode ? '0.6rem' : '0.7rem', 
              fontWeight: 900, 
              alignItems: 'center', 
              gap: '0.3rem',
              border: '1px solid var(--border-default)',
              whiteSpace: 'nowrap'
            }}>
              <span style={{ fontSize: isTVMode ? '0.55rem' : '0.6rem' }}>{Math.round(timeToShipping)}H TO SHIP</span>
            </div>
          )}

          {trailer.promisedShippingDate && !isTVMode && (
            <div style={{ 
              padding: '0.3rem 0.6rem', 
              background: trailer.isPriority ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 255, 255, 0.03)', 
              borderRadius: '8px', 
              border: `1px solid ${trailer.isPriority ? 'rgba(239, 68, 68, 0.2)' : 'var(--border-default)'}`,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              whiteSpace: 'nowrap'
            }}>
              {trailer.isPriority && <Crown size={12} fill="#ef4444" color="#ef4444" />}
              <Calendar size={12} color={trailer.isPriority ? '#ef4444' : 'var(--text-muted)'} />
              <span style={{ 
                fontSize: '0.75rem', 
                fontWeight: 700, 
                color: trailer.isPriority ? '#f87171' : 'var(--text-secondary)'
              }}>
                {format(new Date(trailer.promisedShippingDate), 'MMM d')}
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
               background: 'var(--bg-secondary)',
               color: 'var(--text-secondary)',
               padding: '2px 8px',
               borderRadius: '4px',
               fontSize: '0.65rem',
               fontWeight: 800,
               textTransform: 'uppercase',
               border: '1px solid var(--border-default)'
             }}>
               <Layers size={10} color="var(--text-muted)" strokeWidth={3} />
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
            {!isTVMode ? (
                <select 
                  className="bay-select"
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    padding: '2px 8px',
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                  value={trailer.station}
                  onChange={(e) => onUpdateTrailer?.(trailer.id, { station: e.target.value as StationId })}
                  onClick={(e) => e.stopPropagation()}
                >
                  <option value="None" style={{ background: 'var(--bg-card)' }}>Off</option>
                  {STATIONS.map(s => <option key={s} value={s} style={{ background: 'var(--bg-card)' }}>{s}</option>)}
                </select>
            ) : (
              <span style={{ 
                fontSize: '0.75rem', 
                fontWeight: 800, 
                color: 'var(--text-primary)',
                background: 'var(--bg-secondary)',
                padding: '2px 8px',
                borderRadius: '6px',
                border: '1px solid var(--border-default)'
              }}>
                {trailer.station === 'None' ? 'Off' : trailer.station}
              </span>
            )}
          </div>
        </div>

        {!isTVMode && (
          <div className="card-meta-item">
            <Calendar className="card-meta-icon" />
            <span>Started {format(trailer.dateStarted, 'MMM d')}</span>
          </div>
        )}
      </div>
      
      {trailer.notes && !isTVMode && (
        <div style={{ 
          marginTop: '0.25rem', 
          padding: '0.5rem 0.75rem', 
          background: 'rgba(255, 255, 255, 0.02)', 
          borderRadius: '8px', 
          border: '1px solid var(--border-default)',
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

      {!isTVMode && (
        <div className="card-footer">
            <div className="card-meta-item" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                <div className="card-meta-item">
                  <Clock className="card-meta-icon" style={{ color: 'var(--accent)', width: '12px', height: '12px' }} />
                  <span className="card-time" style={{ fontSize: '0.65rem' }}>{timeInPhase} (Stage: {Math.round(targetHours)}h)</span>
                </div>
                <div className="card-meta-item">
                  <Hash className="card-meta-icon" style={{ color: '#0ea5e9', width: '12px', height: '12px' }} />
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Pipeline: {Math.round(calculateTrailerRemainingHours(trailer, localTargetHours))}h</span>
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
      )}

      {trailer.currentPhase === 'shipping' && !hideShipButton && (
        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-default)' }}>
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
