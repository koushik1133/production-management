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
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { Trailer, StationId } from './types';
import { STATIONS, PHASES, PHASE_METADATA, MODEL_TARGET_HOURS } from './types';
import { TrailerCard } from './components/TrailerCard';
import { StationColumn } from './components/StationColumn';
import { TrailerDetailsModal } from './components/TrailerDetailsModal';

interface Props {
  trailers: Trailer[];
  onUpdateTrailer: (id: string, updates: Partial<Trailer>) => void;
}

const StationView: React.FC<Props> = ({ trailers, onUpdateTrailer }) => {
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

    if (overStation && activeTrailer.station !== overStation) {
      onUpdateTrailer(activeId, { station: overStation });
    }
  };

  const handleDragEnd = () => setActiveId(null);
  
  const selectedTrailer = trailers.find(t => t.id === selectedTrailerId);
  const activeTrailer = activeId ? trailers.find(t => t.id === activeId) : null;

  const getStationWorkload = (stationId: StationId) => {
    const stationTrailers = trailers.filter(t => t.station === stationId && !t.isArchived);
    return stationTrailers.reduce((acc, t) => {
      const fromPhaseIndex = PHASES.findIndex(p => p.id === t.currentPhase);
      if (fromPhaseIndex === -1) return acc;
      
      const remainingPhases = PHASES.slice(fromPhaseIndex);
      let stageRem = 0;
      let pipelineRem = 0;

      remainingPhases.forEach((phase) => {
        if (phase.id === 'paint' && t.finishingType === 'Outsource') return;
        if (phase.id === 'outsource' && t.finishingType === 'Paint') return;
        if (!t.finishingType && phase.id === 'outsource') return;

        const target = MODEL_TARGET_HOURS[t.model]?.[phase.id]
          || PHASE_METADATA[phase.id].defaultTargetHours;

        let res = target;
        if (phase.id === t.currentPhase) {
          const currentLog = t.history.find(h => h.phase === t.currentPhase && !h.exitedAt);
          const loggedInCurrent = (currentLog?.bayManualHours || currentLog?.phaseManualHours || 0);
          res = Math.max(0, target - loggedInCurrent);
          stageRem = res;
        }

        pipelineRem += res;
      });

      return {
        stage: acc.stage + stageRem,
        pipeline: acc.pipeline + pipelineRem
      };
    }, { stage: 0, pipeline: 0 });
  };

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
              trailers={trailers.filter(t => t.station === station && !t.isArchived)} 
              onUpdateTrailer={onUpdateTrailer} 
              onCardClick={(t) => setSelectedTrailerId(t.id)}
              workload={getStationWorkload(station)}
            />
          ))}
          <DragOverlay>
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
