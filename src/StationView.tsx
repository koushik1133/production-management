import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MapPin } from 'lucide-react';
import { supabase } from './lib/supabase';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragStartEvent, DragOverEvent } from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import type { Trailer, StationId, PhaseId, UserRole } from './types';
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
  userRole: UserRole;
}

const StationView: React.FC<Props> = ({ trailers, setTrailers, onUpdateTrailer, bayCapacities, onUpdateCapacity, localTargetHours, userRole }) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedTrailerId, setSelectedTrailerId] = useState<string | null>(null);

  // Stable references to prevent sync jumps
  const trailersRef = useRef(trailers);
  const activeIdRef = useRef(activeId);
  
  useEffect(() => {
    trailersRef.current = trailers;
  }, [trailers]);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const isMobileView = useMemo(() => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.innerWidth <= 768);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { 
      activationConstraint: isMobileView ? { distance: 9999 } : { distance: 3 } 
    }),
    useSensor(TouchSensor, {
      activationConstraint: isMobileView ? { distance: 9999 } : { distance: 8 }
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const dragId = event.active.id as string;
    setActiveId(dragId);

    // Snapshot at drag START for potential undo/redo alignment or just local stability
    const draggedTrailer = trailersRef.current.find(t => t.id === dragId);
    if (draggedTrailer) {
      // We can implement local snapshotting here if needed, 
      // but for now we focus on vertical_order sync.
    }
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
      setTrailers(prev => {
        const activeIdx = prev.findIndex(t => t.id === activeId);
        if (activeIdx === -1) return prev;
        
        const updatedTrailer = { ...prev[activeIdx], station: overStation as StationId };
        const newTrailers = [...prev];
        newTrailers[activeIdx] = updatedTrailer;

        // Sync ref immediately
        trailersRef.current = newTrailers;
        return newTrailers;
      });
    }
  };

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    const activeId = active.id as string;
    
    setActiveId(null);
    
    const trailer = trailersRef.current.find(t => t.id === activeId);
    
    if (trailer && over) {
      try {
        const overId = over.id as string;
        const currentItems = trailersRef.current;
        
        // Get units in target station, sorted by vertical_order
        const stationTrailers = currentItems
          .filter(t => t.station === trailer.station && !t.isArchived && !t.isDeleted)
          .sort((a, b) => (a.vertical_order ?? 0) - (b.vertical_order ?? 0));

        const currentIdx = stationTrailers.findIndex(t => t.id === activeId);
        const overIsCard = stationTrailers.some(t => t.id === overId);
        const targetIdx = overIsCard
          ? stationTrailers.findIndex(t => t.id === overId)
          : stationTrailers.length - 1;

        if (currentIdx === -1) return;

        // Reorder and assign sequential whole-number vertical_orders
        const reordered = arrayMove([...stationTrailers], currentIdx, targetIdx)
          .map((t, idx) => ({ ...t, vertical_order: idx * 1000 }));

        // Optimistic local update
        setTrailers(prev => {
          const updatedList = prev.map(t => {
            const updated = reordered.find(r => r.id === t.id);
            return updated ? updated : t;
          });
          
          return [...updatedList].sort((a, b) => {
            if (a.station === b.station && a.vertical_order !== undefined && b.vertical_order !== undefined) {
              return a.vertical_order - b.vertical_order;
            }
            return 0;
          });
        });

        // Batch persist to DB
        await Promise.all([
          supabase.from('trailers').update({
            station: trailer.station,
            vertical_order: reordered.find(r => r.id === activeId)?.vertical_order ?? 0,
          }).eq('id', activeId),
          ...reordered
            .filter(t => t.id !== activeId)
            .map(t => supabase.from('trailers').update({ vertical_order: t.vertical_order }).eq('id', t.id))
        ]);

      } catch (err) {
        console.error('StationView DragEnd Error:', err);
      }
    }
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
                userRole={userRole}
              />
            );
          })}
          <DragOverlay>
            {activeTrailer ? <TrailerCard trailer={activeTrailer} localTargetHours={localTargetHours} userRole={userRole} /> : null}
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
          userRole={userRole}
        />
      )}

      {/* Mobile-only responsive styles for Bay page */}
      <style>{`
        @media (max-width: 768px) {

          /* Page scrolls vertically - show all bays stacked, no clipping */
          .bay-page .main-content {
            flex-direction: column !important;
            overflow-x: hidden !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch !important;
            padding: 0.75rem !important;
            gap: 1rem !important;
            height: auto !important;
            min-height: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            /* Remove fixed height constraint so page can grow */
            flex: 0 0 auto !important;
            display: block !important;
          }

          /* Each bay column: full width, grows naturally to show ALL cards */
          .bay-page .kanban-column {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;   /* ← NO cap, all cards visible */
            overflow: visible !important;
            display: flex !important;
            flex-direction: column !important;
            border-radius: 16px !important;
            padding: 0 !important;
            margin-bottom: 1rem !important;
          }

          /* Cards container: natural height, no scroll trap */
          .bay-page .cards-container {
            flex: 0 0 auto !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            padding: 0.5rem !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 0.75rem !important;
          }

          /* Column header compact */
          .bay-page .column-header {
            padding: 0.6rem 0.75rem !important;
            flex-shrink: 0 !important;
          }

          /* Column footer always visible at bottom of its column */
          .bay-page .column-footer {
            flex-shrink: 0 !important;
            padding: 0.6rem 0.75rem !important;
          }

          /* Header bar compact */
          .bay-page .header {
            height: auto !important;
            padding: 0.6rem 1rem !important;
            flex-wrap: wrap !important;
            gap: 0.5rem !important;
          }

          /* Let the whole page scroll, not locked to 100vh */
          .bay-page.app-container {
            height: auto !important;
            min-height: 100vh !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch !important;
          }

          /* Kill hover transforms on mobile - they intercept touch scroll */
          .bay-page .trailer-card:hover,
          .bay-page .trailer-card:active {
            transform: none !important;
            box-shadow: var(--shadow-sm) !important;
          }

          /* Disable pointer-events that cause scroll interference */
          .bay-page .trailer-card {
            cursor: pointer !important;
          }
        }
      `}</style>
    </div>
  );
};

export default StationView;
