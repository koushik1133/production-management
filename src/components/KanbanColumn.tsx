import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { PhaseId, Trailer } from '../types';
import { TrailerCard } from './TrailerCard';

interface Props {
  id: PhaseId;
  title: string;
  trailers: Trailer[];
  onCardClick?: (trailer: Trailer) => void;
  onUpdateTrailer?: (id: string, updates: Partial<Trailer>) => void;
  onShipRequest?: (trailer: Trailer) => void;
  workload?: { stage: number; pipeline: number };
  highlightedId?: string | null;
}

export const KanbanColumn: React.FC<Props> = React.memo(({ id, title, trailers, onCardClick, onUpdateTrailer, onShipRequest, workload, highlightedId }) => {
  const { setNodeRef } = useDroppable({
    id,
  });

  return (
    <div className="kanban-column" ref={setNodeRef}>
      <div className="column-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="column-title" style={{ fontSize: '0.9rem' }}>{title}</span>
          {trailers.length > 0 && id !== 'shipping' && (
            <div className="bay-header-input-wrapper">
              <input 
                type="number" 
                placeholder="Log Hrs" 
                className="bay-time-input"
                style={{ width: '60px', height: '24px', fontSize: '0.65rem' }}
                value={trailers[0].history.find(h => h.phase === id && !h.exitedAt)?.phaseManualHours || ''}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  const trailer = trailers[0];
                  const updatedHistory = trailer.history.map(h => 
                    h.phase === id && !h.exitedAt 
                      ? { ...h, phaseManualHours: isNaN(val) ? undefined : val } 
                      : h
                  );
                  onUpdateTrailer?.(trailer.id, { history: updatedHistory });
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
        </div>
        <span className="column-count">{trailers.length}</span>
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
              onShipRequest={onShipRequest}
              onCardClick={() => onCardClick?.(trailer)}
              isHighlighted={trailer.id === highlightedId}
            />
          ))}
        </SortableContext>
      </div>
      {workload !== undefined && (
        <div className="column-footer" style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Current Stage</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--accent)' }}>{Math.round(workload.stage)}h</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Pipeline Total</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0ea5e9' }}>{Math.round(workload.pipeline)}h</span>
          </div>
        </div>
      )}
    </div>
  );
});
