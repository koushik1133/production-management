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
import type { DragStartEvent, DragOverEvent } from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import type { Trailer, StationId, PhaseId } from './types';
import { STATIONS, PHASE_METADATA, calculateTrailerRemainingHours } from './types';
import { TrailerCard } from './components/TrailerCard';
import { StationColumn } from './components/StationColumn';
import { TrailerDetailsModal } from './components/TrailerDetailsModal';

interface Props {
  trailers: Trailer[];
  setTrailers: React.Dispatch<React.SetStateAction<Trailer[]>>;
  onUpdateTrailer: (id: string, updates: Partial<Trailer>) => void;
  bayCapacities: Record<StationId, number>;
  onUpdateCapacity: (id: StationId, capacity: number) => void;
  localTargetHours: Record<string, Record<PhaseId, number>>;
}

const StationView: React.FC<Props> = ({ trailers, setTrailers, onUpdateTrailer, bayCapacities, onUpdateCapacity, localTargetHours }) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedTrailerId, setSelectedTrailerId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
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

    if (overStation) {
      if (activeTrailer.station !== overStation) {
        setTrailers(prev => {
          const activeIdx = prev.findIndex(t => t.id === activeId);
          const overIdx = prev.findIndex(t => t.id === overId);
          let newIdx;
          if (isOverStation) newIdx = prev.length;
          else newIdx = overIdx;

          const updated = { ...activeTrailer, station: overStation };
          const newTrailers = [...prev];
          newTrailers.splice(activeIdx, 1);
          newTrailers.splice(newIdx, 0, updated);
          return newTrailers;
        });
      } else if (activeId !== overId) {
        setTrailers(prev => {
          const oldIndex = prev.findIndex(t => t.id === activeId);
          const newIndex = prev.findIndex(t => t.id === overId);
          return arrayMove(prev, oldIndex, newIndex);
        });
      }
    }
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active && over) {
      const activeId = active.id as string;
      const trailer = trailers.find(t => t.id === activeId);
      if (trailer) {
        // Calculate new dateStarted for persistence in current sorted view
        const columnTrailers = trailers.filter(t => t.station === trailer.station);
        const indexInCol = columnTrailers.findIndex(t => t.id === activeId);
        
        let newDateStarted = trailer.dateStarted;
        const above = columnTrailers[indexInCol - 1];
        const below = columnTrailers[indexInCol + 1];

        if (above && below) {
          newDateStarted = (above.dateStarted + below.dateStarted) / 2;
        } else if (above) {
          newDateStarted = above.dateStarted - 1000;
        } else if (below) {
          newDateStarted = below.dateStarted + 1000;
        }

        onUpdateTrailer(activeId, { 
          station: trailer.station,
          dateStarted: newDateStarted 
        });
      }
    }
    setActiveId(null);
  };
  
  const selectedTrailer = trailers.find(t => t.id === selectedTrailerId);
  const activeTrailer = activeId ? trailers.find(t => t.id === activeId) : null;

  const getStationWorkloadData = (stationId: StationId) => {
    const stationTrailers = trailers.filter(t => t.station === stationId && !t.isArchived);
    const totals = stationTrailers.reduce((acc, t) => {
      const remainingHours = calculateTrailerRemainingHours(t, localTargetHours);
      
      // stage-only hours for some logic possibly, 
      // but for pipeline it's straightforward now.
      const currentPhaseTarget = localTargetHours[t.model]?.[t.currentPhase] || PHASE_METADATA[t.currentPhase].defaultTargetHours;
      return {
        stage: acc.stage + currentPhaseTarget,
        pipeline: acc.pipeline + remainingHours
      };
    }, { stage: 0, pipeline: 0 });

    const capacity = bayCapacities[stationId] || 40;
    const leadTimeWeeks = capacity > 0 ? totals.pipeline / capacity : 0;
    const leadTimeDays = Math.round(leadTimeWeeks * 7);
    
    const leadTimeDisplay = leadTimeWeeks > 0 
      ? `${leadTimeWeeks.toFixed(1)} Weeks (~${leadTimeDays} Days)`
      : '0 Weeks';

    return {
      ...totals,
      leadTime: leadTimeWeeks,
      leadTimeDisplay,
      capacity
    };
  };

  return (
    <div className="app-container bay-page">
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

      <main className="main-content" style={{ justifyContent: 'center', alignItems: 'stretch' }}>
        <DndContext 
          sensors={sensors} 
          collisionDetection={closestCorners} 
          onDragStart={handleDragStart} 
          onDragOver={handleDragOver} 
          onDragEnd={handleDragEnd}
        >
          {STATIONS.map((station) => {
            const workloadData = getStationWorkloadData(station);
            return (
              <StationColumn 
                key={station} 
                id={station} 
                trailers={trailers.filter(t => t.station === station && !t.isArchived)} 
                onUpdateTrailer={onUpdateTrailer} 
                onCardClick={(t) => setSelectedTrailerId(t.id)}
                workload={workloadData}
                capacity={workloadData.capacity}
                onUpdateCapacity={(cap) => onUpdateCapacity(station, cap)}
                localTargetHours={localTargetHours}
              />
            );
          })}
          <DragOverlay>
            {activeTrailer ? <TrailerCard trailer={activeTrailer} localTargetHours={localTargetHours} /> : null}
          </DragOverlay>
        </DndContext>
      </main>

      {selectedTrailer && (
        <TrailerDetailsModal 
          trailer={selectedTrailer} 
          isOpen={true} 
          onClose={() => setSelectedTrailerId(null)} 
          onUpdate={onUpdateTrailer} 
          localTargetHours={localTargetHours}
        />
      )}
    </div>
  );
};

export default StationView;
