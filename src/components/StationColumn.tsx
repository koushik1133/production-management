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
  workload?: { stage: number; pipeline: number };
}

export const StationColumn: React.FC<Props> = ({ id, trailers, onUpdateTrailer, onCardClick, workload }) => {
  const { setNodeRef } = useDroppable({
    id,
  });

  return (
    <div className="kanban-column" ref={setNodeRef}>
      <div className="column-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className="column-title" style={{ color: 'var(--accent)', fontWeight: 800 }}>BAY {id}</span>
          
          {trailers.length > 0 && (
            <div className="bay-header-input-wrapper">
              <input 
                type="number" 
                placeholder="Logged Hrs" 
                className="bay-time-input"
                value={trailers[0].history.find(h => h.phase === trailers[0].currentPhase && !h.exitedAt)?.bayManualHours || ''}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  const trailer = trailers[0];
                  const updatedHistory = trailer.history.map(h => 
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
      {workload !== undefined && (
        <div className="column-footer" style={{ 
          marginTop: 'auto', 
          padding: '1rem', 
          borderTop: '2px solid var(--accent)', 
          background: 'rgba(56, 189, 248, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.05em' }}>STAGE LOAD:</span>
            <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--accent)' }}>{Math.round(workload.stage)}h</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#0ea5e9', letterSpacing: '0.05em' }}>PIPELINE TOTAL:</span>
            <span style={{ fontSize: '1rem', fontWeight: 800, color: '#0ea5e9' }}>{Math.round(workload.pipeline)}h</span>
          </div>
        </div>
      )}
    </div>
  );
};
