import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { StationId, Trailer } from '../types';
import { TrailerCard } from './TrailerCard';

interface Props {
  id: StationId;
  trailers: Trailer[];
  onUpdateTrailer?: (id: string, updates: Partial<Trailer>) => void;
  onCardClick?: (trailer: Trailer) => void;
}

export const StationColumn: React.FC<Props> = ({ id, trailers, onUpdateTrailer, onCardClick }) => {
  const { setNodeRef, isOver } = useDroppable({
    id,
  });

  return (
    <div className={`kanban-column ${isOver ? 'is-over' : ''}`} ref={setNodeRef} style={{ background: '#f8fafc' }}>
      <div className="column-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className="column-title" style={{ color: 'var(--accent)', fontWeight: 800 }}>BAY {id}</span>
          
          {trailers.length > 0 && (
            <div className="bay-header-input-wrapper">
              <input 
                type="number" 
                placeholder="Logged Hrs" 
                className="bay-time-input"
                value={(trailers[0].history || []).find(h => h.phase === trailers[0].currentPhase && !h.exitedAt)?.bayManualHours || ''}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  const trailer = trailers[0];
                  const updatedHistory = (trailer.history || []).map(h => 
                    h.phase === trailer.currentPhase && !h.exitedAt 
                      ? { ...h, bayManualHours: isNaN(val) ? undefined : val } 
                      : h
                  );
                  onUpdateTrailer?.(trailer.id, { history: updatedHistory });
                }}
              />
            </div>
          )}
        </div>
        <span className="column-count" style={{ fontSize: '0.75rem', fontWeight: 600 }}>{trailers.length} units</span>
      </div>
      <div className="cards-container">
        <SortableContext
          items={trailers.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {trailers.map((trailer) => (
            <TrailerCard 
              key={trailer.id} 
              trailer={trailer} 
              onUpdateTrailer={onUpdateTrailer}
              onCardClick={() => onCardClick?.(trailer)}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
};
