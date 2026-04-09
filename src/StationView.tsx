import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MapPin } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragStartEvent, DragOverEvent, DragEndEvent } from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import type { Trailer, StationId } from './types';
import { STATIONS } from './types';
import { TrailerCard } from './components/TrailerCard';
import { StationColumn } from './components/StationColumn';
import { TrailerDetailsModal } from './components/TrailerDetailsModal';

interface Props {
  trailers: Trailer[];
  onUpdateTrailer: (id: string, updates: Partial<Trailer>) => void;
  onUpdateTrailersBatch?: (updates: (Partial<Trailer> & { id: string })[]) => Promise<void>;
  onDragChange?: (id: string | null) => void;
}

const StationView: React.FC<Props> = ({ trailers, onUpdateTrailer, onUpdateTrailersBatch, onDragChange }) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedTrailerId, setSelectedTrailerId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const draggingId = event.active.id as string;
    setActiveId(draggingId);
    onDragChange?.(draggingId);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;
    const activeTrailer = trailers.find(t => t.id === activeId);
    if (!activeTrailer) return;

    const isOverStation = STATIONS.some(s => s === overId);
    let overStation: StationId | null = null;
    if (isOverStation) overStation = overId as StationId;
    else {
      const overTrailer = trailers.find(t => t.id === overId);
      if (overTrailer) overStation = overTrailer.station;
    }

    if (overStation && activeTrailer.station !== overStation) {
      // Find trailers in target station
      const othersInStation = trailers.filter(t => t.station === overStation && !t.isArchived);
      const overTrailer = othersInStation.find(ot => ot.id === overId);
      
      let newPos: number;
      if (overTrailer) {
        newPos = (overTrailer.position ?? 0) - 0.5;
      } else {
        const maxPos = othersInStation.reduce((max, ot) => Math.max(max, ot.position ?? 0), -1);
        newPos = maxPos + 1;
      }

      onUpdateTrailer(activeId, { station: overStation, position: newPos });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    onDragChange?.(null);
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeTrailer = trailers.find(t => t.id === activeId);
    if (!activeTrailer) return;

    const overTrailer = trailers.find(t => t.id === overId);
    const isOverStation = STATIONS.some(s => s === overId);
    const targetStation = isOverStation ? (overId as StationId) : overTrailer?.station;

    if (!targetStation) return;

    // REORDERING within same station
    if (activeTrailer.station === targetStation && activeId !== overId && overTrailer) {
      const currentInStation = trailers
        .filter(t => t.station === targetStation && !t.isArchived)
        .sort((a, b) => 
          (a.position ?? 0) - (b.position ?? 0) || 
          a.dateStarted - b.dateStarted || 
          a.id.localeCompare(b.id)
        );
        
      const oldIndex = currentInStation.findIndex(t => t.id === activeId);
      const newIndex = currentInStation.findIndex(t => t.id === overId);

      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(currentInStation, oldIndex, newIndex);
        const updates = reordered.map((t, idx) => ({
          id: t.id,
          position: idx
        }));

        await onUpdateTrailersBatch?.(updates);
      }
    }
  };
  
  const selectedTrailer = trailers.find(t => t.id === selectedTrailerId);
  const activeTrailer = activeId ? trailers.find(t => t.id === activeId) : null;

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-left">
          <Link to="/" className="btn btn-secondary">
            <ArrowLeft size={16} />
            Back to Pipeline
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '1rem' }}>
            <MapPin size={20} color="var(--accent)" />
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Bay Management</h1>
          </div>
        </div>
      </header>

      <main className="main-content">
        <DndContext 
          sensors={sensors} 
          collisionDetection={closestCorners} 
          onDragStart={handleDragStart} 
          onDragOver={handleDragOver} 
          onDragEnd={handleDragEnd}
        >
          {STATIONS.map((station) => (
            <StationColumn 
              key={station} 
              id={station} 
              trailers={trailers
                .filter(t => t.station === station && !t.isArchived)
                .sort((a, b) => 
                  (a.position ?? 0) - (b.position ?? 0) || 
                  a.dateStarted - b.dateStarted || 
                  a.id.localeCompare(b.id)
                )
              } 
              onUpdateTrailer={onUpdateTrailer} 
              onCardClick={(t) => setSelectedTrailerId(t.id)}
            />
          ))}
          <DragOverlay className="drag-overlay-active">
            {activeTrailer ? <TrailerCard trailer={activeTrailer} /> : null}
          </DragOverlay>
        </DndContext>
      </main>

      {selectedTrailer && (
        <TrailerDetailsModal 
          trailer={selectedTrailer} 
          isOpen={true} 
          onClose={() => setSelectedTrailerId(null)} 
          onUpdate={onUpdateTrailer} 
        />
      )}
    </div>
  );
};

export default StationView;
