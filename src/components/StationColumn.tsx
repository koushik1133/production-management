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
  totalHours?: number;
}

export const StationColumn: React.FC<Props> = ({ id, trailers, onUpdateTrailer, onCardClick, totalHours }) => {
  const { setNodeRef } = useDroppable({
    id,
  });

  return (
    <div className="kanban-column" ref={setNodeRef} style={{ background: '#f8fafc' }}>
      <div className="column-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span className="column-title" style={{ color: 'var(--accent)', fontWeight: 800 }}>BAY {id}</span>
          {totalHours !== undefined && (
            <div style={{ 
              background: '#fef3c7', 
              color: '#92400e', 
              padding: '0.2rem 0.6rem', 
              borderRadius: '6px', 
              fontSize: '0.7rem', 
              fontWeight: 800,
              border: '1px solid #fde68a',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem'
            }}>
              <span style={{ opacity: 0.7 }}>WORKLOAD:</span>
              <span>{Math.round(totalHours)}h</span>
            </div>
          )}
        </div>
        <span className="column-count" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{trailers.length} units</span>
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
