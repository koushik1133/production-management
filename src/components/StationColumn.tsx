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
  const { setNodeRef } = useDroppable({
    id,
  });

  return (
    <div className="kanban-column" ref={setNodeRef} style={{ background: '#f8fafc' }}>
      <div className="column-header">
        <span className="column-title" style={{ color: 'var(--accent)', fontWeight: 800 }}>BAY {id}</span>
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
