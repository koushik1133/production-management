import React, { useState, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { StationId, Trailer } from '../types';
import { TrailerCard } from './TrailerCard';

interface Props {
  id: StationId;
  trailers: Trailer[];
  onUpdateTrailer?: (id: string, updates: Partial<Trailer>) => void;
  onCardClick?: (trailer: Trailer) => void;
  workload?: { stage: number; pipeline: number; leadTime: number };
  capacity?: number;
  onUpdateCapacity?: (capacity: number) => void;
}

export const StationColumn: React.FC<Props> = ({ id, trailers, onUpdateTrailer, onCardClick, workload, capacity, onUpdateCapacity }) => {
  const { setNodeRef } = useDroppable({
    id,
  });

  const [localCapacity, setLocalCapacity] = useState<string>(capacity?.toString() || '');

  useEffect(() => {
    setLocalCapacity(capacity?.toString() || '');
  }, [capacity]);

  const handleCapacitySubmit = () => {
    const val = parseFloat(localCapacity);
    onUpdateCapacity?.(isNaN(val) ? 0 : val);
  };

  return (
    <div className="kanban-column" ref={setNodeRef}>
      <div className="column-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className="column-title" style={{ color: 'var(--accent)', fontWeight: 800 }}>BAY {id}</span>
          
          <div className="bay-header-input-wrapper" title="Bay Output (Target Hours/Week)">
            <input 
              type="number" 
              placeholder="Log Hrs" 
              className="bay-time-input"
              style={{ width: '60px', height: '24px', fontSize: '0.65rem' }}
              value={localCapacity}
              onChange={(e) => setLocalCapacity(e.target.value)}
              onBlur={handleCapacitySubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCapacitySubmit();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem', paddingTop: '0.5rem', borderTop: '1px dashed rgba(56, 189, 248, 0.2)' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.05em' }}>EST. LEAD TIME:</span>
            <span style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--text-primary)' }}>{workload.leadTime.toFixed(1)} <span style={{ fontSize: '0.7rem' }}>Weeks</span></span>
          </div>
        </div>
      )}
    </div>
  );
};
