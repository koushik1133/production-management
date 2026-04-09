import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Clock, Hash, MapPin, Calendar, Crown, StickyNote, Truck } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import type { Trailer, StationId } from '../types';
import { STATIONS, PHASE_METADATA, MODEL_TARGET_HOURS } from '../types';

interface Props {
  trailer: Trailer;
  onUpdateTrailer?: (id: string, updates: Partial<Trailer>) => void;
  onCardClick?: () => void;
  onShipRequest?: (trailer: Trailer) => void;
  hideCustomerName?: boolean;
  hideShipButton?: boolean;
}

export const TrailerCard: React.FC<Props> = React.memo(({ 
  trailer, 
  onUpdateTrailer, 
  onCardClick,
  onShipRequest,
  hideCustomerName,
  hideShipButton 
}) => {
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

  const style = {
    transition,
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  const currentLog = trailer.history.find(h => h.phase === trailer.currentPhase && !h.exitedAt);
  const timeInPhase = currentLog ? formatDistanceToNow(currentLog.enteredAt) : '0m';

  // Bottleneck Detection: Model-Specific Target
  const hoursRemaining = currentLog ? (Date.now() - currentLog.enteredAt) / (1000 * 60 * 60) : 0;
  
  // FIXED: Look up target hours for this specific MODEL and PHASE
  const targetHours = MODEL_TARGET_HOURS[trailer.model]?.[trailer.currentPhase] 
    || PHASE_METADATA[trailer.currentPhase].defaultTargetHours;
    
  const isBottleneck = hoursRemaining > targetHours;

  const handleStationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation();
    onUpdateTrailer?.(trailer.id, { station: e.target.value as StationId });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`trailer-card ${isBottleneck ? 'is-bottleneck' : ''}`}
      {...attributes}
      {...listeners}
      onClick={() => onCardClick?.()}
    >
      {trailer.isPriority && (
        <Crown className="priority-badge" size={18} fill="#ef4444" stroke="#ef4444" />
      )}
      
      <div className="card-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
        <div className="card-title" style={{ flex: 1, minWidth: 0 }}>
          <span className="card-model" style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{trailer.model}</span>
          {!hideCustomerName && (
            <span className="card-customer" style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{trailer.name}</span>
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
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '2px',
            flexShrink: 0
          }}>
            <span style={{ fontSize: '0.6rem', fontWeight: 800, color: trailer.isPriority ? '#be123c' : '#3b82f6', textTransform: 'uppercase' }}>Due Date</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 900, color: trailer.isPriority ? '#e11d48' : '#1d4ed8' }}>
              {format(new Date(trailer.expectedDueDate + 'T12:00:00'), 'MMM d')}
            </span>
          </div>
        )}
      </div>
      
      <div className="card-meta">
        <div className="card-meta-item">
          <Hash className="card-meta-icon" />
          <span>{trailer.serialNumber}</span>
        </div>
        
        <div 
          className="card-meta-item station-badge-wrapper" 
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="bay-selector-pill">
            <MapPin size={12} className="bay-icon" />
            <span className="bay-label">BAY</span>
            <select 
              className="bay-select" 
              value={trailer.station}
              onChange={handleStationChange}
              onClick={(e) => e.stopPropagation()}
            >
              {STATIONS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
              <option value="None">Off</option>
            </select>
          </div>
        </div>

        <div className="card-meta-item">
          <Calendar className="card-meta-icon" />
          <span>Started {format(trailer.dateStarted, 'MMM d, yyyy')}</span>
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
        <div className="card-meta-item">
          <Clock className="card-meta-icon" style={{ color: isBottleneck ? 'white' : 'var(--accent)' }} />
          <span className={`card-time ${isBottleneck ? 'bottleneck-active' : ''}`}>{timeInPhase}</span>
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
