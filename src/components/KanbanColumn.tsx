import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { PhaseId, Trailer, StationId, UserRole } from '../types';
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
  suggestedBay?: StationId;
  localTargetHours: Record<string, Record<PhaseId, number>>;
  userRole: UserRole;
}

export const KanbanColumn: React.FC<Props> = React.memo(({ id, title, trailers, onCardClick, onUpdateTrailer, onShipRequest, workload, highlightedId, suggestedBay, localTargetHours, userRole }) => {
  const { setNodeRef } = useDroppable({
    id,
  });

  return (
    <div className="kanban-column" ref={setNodeRef}>
      <div className="column-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)' }} />
          <span className="column-title" style={{ fontSize: '0.85rem', fontWeight: 900, letterSpacing: '0.05em' }}>{title}</span>
        </div>
        <span className="column-count" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', fontWeight: 800 }}>{trailers.length}</span>
      </div>
      <div className="cards-container">
        <SortableContext
          items={Array.from(new Set(trailers.map((t) => t.id)))}
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
                suggestedBay={suggestedBay}
                localTargetHours={localTargetHours}
                userRole={userRole}
              />
          ))}
        </SortableContext>
      </div>
      {workload !== undefined && (
        <div className="column-footer" style={{ 
          marginTop: '1.25rem', 
          paddingTop: '1.25rem', 
          borderTop: '1px solid var(--border-default)', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '0.5rem',
          background: 'transparent'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Stage</span>
            <span style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--accent)' }}>{Math.round(workload.stage)}h</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pipeline Total</span>
            <span style={{ fontSize: '1rem', fontWeight: 900, color: '#0ea5e9' }}>{Math.round(workload.pipeline)}h</span>
          </div>
        </div>
      )}
    </div>
  );
});
