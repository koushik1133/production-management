import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Clock, Hash, MapPin, Calendar, Crown, StickyNote, Truck } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import type { Trailer, StationId } from '../types';
import { STATIONS, PHASE_METADATA } from '../types';

interface Props {
  trailer: Trailer;
  onUpdateTrailer?: (id: string, updates: Partial<Trailer>) => void;
  onCardClick?: () => void;
  hideCustomerName?: boolean;
  hideShipButton?: boolean;
}

export const TrailerCard: React.FC<Props> = ({ 
  trailer, 
  onUpdateTrailer, 
  onCardClick,
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

  // Bottleneck Detection: More than targetHours
  const hoursRemaining = currentLog ? (Date.now() - currentLog.enteredAt) / (1000 * 60 * 60) : 0;
  const targetHours = PHASE_METADATA[trailer.currentPhase].defaultTargetHours;
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
      
      <div className="card-header-row">
        <div className="card-title">
          <span className="card-model">{trailer.model}</span>
          {!hideCustomerName && (
            <span className="card-customer">{trailer.name}</span>
          )}
        </div>
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

      <div className="card-footer">
        <div className="card-meta-item">
          <Clock className="card-meta-icon" style={{ color: isBottleneck ? 'white' : 'var(--accent)' }} />
          <span className={`card-time ${isBottleneck ? 'bottleneck-active' : ''}`}>{timeInPhase}</span>
        </div>
        
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          {trailer.notes && (
            <StickyNote size={14} style={{ color: 'var(--text-muted)' }} />
          )}
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
              onUpdateTrailer?.(trailer.id, { isArchived: true, archivedAt: Date.now() });
            }}
          >
            <Truck size={16} /> Mark as Shipped
          </button>
        </div>
      )}
    </div>
  );
};
