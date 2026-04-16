import { useState, useEffect, useMemo, useRef } from 'react';
import { Routes, Route, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
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
import type {
  DragStartEvent,
  DragOverEvent,
  DragEndEvent
} from '@dnd-kit/core';
import {
  sortableKeyboardCoordinates,
  arrayMove
} from '@dnd-kit/sortable';

import { KanbanColumn } from './components/KanbanColumn';
import { TrailerCard } from './components/TrailerCard';
import { TrailerDetailsModal } from './components/TrailerDetailsModal';
import { Modal } from './components/Modal';
import { BacklogView } from './BacklogView';
import TVView from './TVView';
import StationView from './StationView';
import { ArchiveView } from './ArchiveView';
import { ScheduleView } from './ScheduleView';
import { CatalogView } from './CatalogView';
import { BookOpen } from 'lucide-react';

import { 
  Search, 
  Plus, 
  MapPin,
  Tv,
  Download,
  Upload,
  Clock,
  Archive,
  Crown,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Calendar
} from 'lucide-react';

import type { Trailer, PhaseId, StationId } from './types';
import { 
  PHASES, 
  MODEL_CATEGORIES, 
  MODEL_TARGET_HOURS,
  STATIONS,
  PHASE_METADATA
} from './types';

import { exportToCsv, parseCsv } from './utils/CsvUtils';
import logo from './assets/logo.jpeg';
import './App.css';

import { supabase } from './lib/supabase';

function Dashboard({ 
  trailers, 
  setTrailers, 
  updateTrailer, 
  isConnected, 
  addTrailer, 
  suggestedBay, 
  runwayWeeks,
  nextSuggestedSerial 
}: { 
  trailers: Trailer[], 
  setTrailers: React.Dispatch<React.SetStateAction<Trailer[]>>,
  updateTrailer: (id: string, updates: Partial<Trailer>) => void,
  isConnected: boolean,
  addTrailer: (trailer: Trailer) => Promise<void>,
  suggestedBay: StationId,
  runwayWeeks: number,
  nextSuggestedSerial?: string
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightedTrailerId = searchParams.get('highlight');
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (highlightedTrailerId) {
      const timer = setTimeout(() => {
        setSearchParams({});
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [highlightedTrailerId, setSearchParams]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const [isRecapModalOpen, setIsRecapModalOpen] = useState(false);
  const [selectedTrailerId, setSelectedTrailerId] = useState<string | null>(null);
  
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);

  const scrollBoard = (direction: 'left' | 'right') => {
    if (mainContentRef.current) {
      const amount = 400;
      mainContentRef.current.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
    }
  };

  const [newTrailerData, setNewTrailerData] = useState({
    serialNumber: '',
    name: '',
    model: '',
    station: 'None' as StationId,
    isPriority: false,
    expectedDueDate: '',
    promisedShippingDate: ''
  });

  const totalHoursForNewModel = useMemo(() => {
    if (!newTrailerData.model) return 0;
    const modelHours = MODEL_TARGET_HOURS[newTrailerData.model];
    if (!modelHours) return 0;
    return Object.entries(modelHours).reduce((a, [p, h]) => p !== 'shipping' ? a + (h as number) : a, 0);
  }, [newTrailerData.model]);


  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, { 
      activationConstraint: { 
        delay: 250, 
        tolerance: 5 
      } 
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const filteredTrailers = useMemo(() => {
    return trailers.filter(t => !t.isArchived && (
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      t.serialNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.model.toLowerCase().includes(searchQuery.toLowerCase())
    ));
  }, [trailers, searchQuery]);

  const getPhaseWorkload = (phaseId: PhaseId) => {
    if (phaseId === 'shipping') return { stage: 0, pipeline: 0 };
    
    return trailers
      .filter(t => t.currentPhase === phaseId && !t.isArchived)
      .reduce((acc, t) => {
        // 1. Stage Work (current phase only)
        const target = (MODEL_TARGET_HOURS[t.model]?.[phaseId] || 0);
        const currentLog = t.history.find(h => h.phase === t.currentPhase && !h.exitedAt);
        const loggedInCurrent = (currentLog?.bayManualHours || currentLog?.phaseManualHours || 0);
        const stageRem = Math.max(0, target - loggedInCurrent);
        
        // 2. Pipeline Work (this phase + all future phases)
        let pipelineRem = stageRem;
        const phaseIdx = PHASES.findIndex(p => p.id === phaseId);
        if (phaseIdx !== -1) {
          PHASES.slice(phaseIdx + 1).forEach(futurePhase => {
            if (futurePhase.id !== 'shipping') {
              pipelineRem += (MODEL_TARGET_HOURS[t.model]?.[futurePhase.id] || 0);
            }
          });
        }

        return {
          stage: acc.stage + stageRem,
          pipeline: acc.pipeline + pipelineRem
        };
      }, { stage: 0, pipeline: 0 });
  };

  // Calculate Global Work Remaining
  const totalWorkRemaining = trailers.reduce((sum, t) => {
    // If unit is in shipping or archived, it has 0 work remaining
    if (t.currentPhase === 'shipping' || t.isArchived) return sum;

    const phaseIndex = PHASES.findIndex(p => p.id === t.currentPhase);
    if (phaseIndex === -1) return sum;
    
    // Sum target hours for current phase AND all subsequent phases
    const remainingForThisTrailer = PHASES.slice(phaseIndex).reduce((pSum, p) => {
      // 1. Skip backlog and shipping as they are not build work
      if (p.id === 'backlog' || p.id === 'shipping') return pSum;

      // 2. Logic for Finishing (Paint vs Outsource)
      if (t.finishingType === 'Paint' && p.id === 'outsource') return pSum;
      if (t.finishingType === 'Outsource' && p.id === 'paint') return pSum;
      if (!t.finishingType && p.id === 'outsource') return pSum;

      const target = (MODEL_TARGET_HOURS[t.model]?.[p.id] || 0);
      return pSum + target;
    }, 0);
    
    return sum + remainingForThisTrailer;
  }, 0);

  // Global Workload and Suggestions are now passed as props from App

  const totalProductionTime = useMemo(() => {
    return trailers.reduce((total, t) => {
      if (t.isArchived || t.currentPhase === 'shipping') return total;
      
      const trailerTotalHours = PHASES.reduce((pSum, p) => {
        if (p.id === 'backlog' || p.id === 'shipping') return pSum;
        if (t.finishingType === 'Paint' && p.id === 'outsource') return pSum;
        if (t.finishingType === 'Outsource' && p.id === 'paint') return pSum;
        if (!t.finishingType && p.id === 'outsource') return pSum;
        return pSum + (MODEL_TARGET_HOURS[t.model]?.[p.id] || 0);
      }, 0);
      
      return total + trailerTotalHours;
    }, 0);
  }, [trailers]);

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

    const isOverColumn = PHASES.some(p => p.id === overId);
    let overPhase: PhaseId | null = null;
    if (isOverColumn) overPhase = overId as PhaseId;
    else {
      const overTrailer = trailers.find(t => t.id === overId);
      if (overTrailer) overPhase = overTrailer.currentPhase;
    }

    if (overPhase) {
      if (activeTrailer.currentPhase !== overPhase) {
        setTrailers(prev => {
          const activeIndex = prev.findIndex(t => t.id === activeId);
          const overIndex = prev.findIndex(t => t.id === overId);
          
          let newIndex;
          if (isOverColumn) {
            newIndex = prev.length;
          } else {
            newIndex = overIndex;
          }

          const now = Date.now();
          const updatedHistory = [...activeTrailer.history];
          const currentLogIndex = updatedHistory.findIndex(h => h.phase === activeTrailer.currentPhase && !h.exitedAt);
          if (currentLogIndex !== -1) {
            const prevLog = updatedHistory[currentLogIndex];
            updatedHistory[currentLogIndex] = { ...prevLog, exitedAt: now, duration: now - prevLog.enteredAt };
          }
          updatedHistory.push({ phase: overPhase as PhaseId, enteredAt: now });

          const updatedTrailer = { ...activeTrailer, currentPhase: overPhase as PhaseId, history: updatedHistory };
          const newTrailers = [...prev];
          newTrailers.splice(activeIndex, 1);
          newTrailers.splice(newIndex, 0, updatedTrailer);
          return newTrailers;
        });
      } else if (activeId !== overId) {
        // Reorder within same column
        setTrailers(prev => {
          const oldIndex = prev.findIndex(t => t.id === activeId);
          const newIndex = prev.findIndex(t => t.id === overId);
          const moved = arrayMove(prev, oldIndex, newIndex);
          return moved;
        });
      }
    }
  };

  const [pendingShippingTrailer, setPendingShippingTrailer] = useState<Trailer | null>(null);
  const [shippingForm, setShippingForm] = useState({ invoiceNumber: '', vinDate: '' });

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    const activeId = active.id as string;
    const trailer = trailers.find(t => t.id === activeId);
    
    if (trailer && over) {
      // 1. Interpolate dateStarted to persist manual order (Dashboard uses dateStarted DESC)
      const columnTrailers = trailers.filter(t => t.currentPhase === trailer.currentPhase);
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

      // ALWAYS prompt for VIN/Invoice when entering Shipping from ANY phrase (if data is missing)
      if (trailer.currentPhase === 'shipping' && (!trailer.vinDate || !trailer.invoiceNumber)) {
        setPendingShippingTrailer(trailer);
      }
      
      // SYNC FINAL STATE TO SUPABASE
      const { error } = await supabase
        .from('trailers')
        .update({
          currentPhase: trailer.currentPhase,
          history: trailer.history,
          dateStarted: newDateStarted
        })
        .eq('id', trailer.id);
        
      if (error) console.error('Error syncing drag movement:', error);
      
      if (newDateStarted !== trailer.dateStarted) {
        setTrailers(prev => prev.map(t => t.id === activeId ? { ...t, dateStarted: newDateStarted } : t));
      }
    }
    
    setActiveId(null);
  };

  const handleShipSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingShippingTrailer) return;
    
    const updates: Partial<Trailer> = {
      invoiceNumber: shippingForm.invoiceNumber,
      vinDate: shippingForm.vinDate
    };
    
    // Move to shipping is already in the 'trailers' state via handleDragOver,
    // here we just add the details and archive it as it's the final stage.
    updates.isArchived = true;
    updates.archivedAt = Date.now();
    
    await updateTrailer(pendingShippingTrailer.id, updates);
    setPendingShippingTrailer(null);
    setShippingForm({ invoiceNumber: '', vinDate: '' });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const imported = parseCsv(text) as Trailer[];
      
      const { error } = await supabase
        .from('trailers')
        .insert(imported);
      
      if (error) console.error('Error importing CSV:', error);
    };
    reader.readAsText(file);
  };

  const [isAdding, setIsAdding] = useState(false);

  const handleAddTrailer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrailerData.model) {
      alert("Missing Required Field: Please select an Official Model.");
      return;
    }
    
    setIsAdding(true);
    try {
      const newId = Math.random().toString(36).substr(2, 9);
      const newTrailer: Trailer = {
        id: newId,
        name: newTrailerData.name || '---',
        model: newTrailerData.model,
        serialNumber: newTrailerData.serialNumber || `UNIT-${Math.floor(10000 + Math.random() * 90000)}`,
        station: newTrailerData.station,
        isPriority: newTrailerData.isPriority,
        dateStarted: Date.now(),
        currentPhase: 'backlog',
        history: [{ phase: 'backlog', enteredAt: Date.now() }],
        expectedDueDate: newTrailerData.expectedDueDate,
        promisedShippingDate: newTrailerData.promisedShippingDate
      };
      
      await addTrailer(newTrailer);
      setIsAddModalOpen(false);
      setNewTrailerData({ 
        serialNumber: '',
        name: '', 
        model: '', 
        station: 'None', 
        isPriority: false,
        expectedDueDate: '',
        promisedShippingDate: ''
      });
    } catch (err: any) {
      alert("Error during registration process: " + err.message);
    } finally {
      setIsAdding(false);
    }
  };

  const selectedTrailer = trailers.find(t => t.id === selectedTrailerId);
  const activeTrailer = activeId ? trailers.find(t => t.id === activeId) : null;

  return (
    <div className="app-container">
      <header className="main-header">
        <div className="header-left">
          <Link to="/" className="header-logo-link">
            <img src={logo} alt="Lane Trailers" className="header-logo-img" />
          </Link>
          <div className="header-clock-section">
            <div className="header-date">{format(currentTime, 'EEEE, MMMM d')}</div>
            <div className="header-time-live">{format(currentTime, 'hh:mm:ss a')} <span>• LIVE</span></div>
          </div>
          
          <div className="header-search-container">
            <Search size={16} color="var(--text-muted)" />
            <input type="text" placeholder="Search serial or customer..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>

          <div className="header-nav-scroll">
            <button className="btn btn-secondary btn-icon" onClick={() => scrollBoard('left')}>
              <ChevronLeft size={20} />
            </button>
            <button className="btn btn-secondary btn-icon" onClick={() => scrollBoard('right')}>
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        <div className="header-right">
          <div className={`sync-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
             <div className="pulse-dot" />
             <span className="sync-label">{isConnected ? 'LIVE SYNC' : 'OFFLINE'}</span>
          </div>
          
          <button className="btn btn-secondary" onClick={() => navigate('/stations')}>
            <MapPin size={16} /> <span className="btn-text">Bays</span>
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/tv')}>
            <Tv size={16} /> <span className="btn-text">TV Mode</span>
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/catalog')}>
            <BookOpen size={16} /> <span className="btn-text">Catalog</span>
          </button>
          <button className="btn btn-primary" onClick={() => setIsAddModalOpen(true)}>
            <Plus size={16} /> <span className="btn-text">Add Unit</span>
          </button>
          <button className="btn btn-secondary btn-icon" onClick={() => exportToCsv(trailers)} title="Export CSV">
            <Download size={16} />
          </button>
          <button className="btn btn-secondary btn-icon" onClick={() => fileInputRef.current?.click()} title="Import CSV">
            <Upload size={16} />
          </button>
          <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".csv" onChange={handleFileUpload} />
          
          <div className="header-divider" />
          
          <button className="btn btn-secondary" onClick={() => navigate('/schedule')}>
             <Calendar size={16} /> <span className="btn-text">Schedule</span>
          </button>
          
          <button className="btn btn-primary" onClick={() => navigate('/backlog')}>
             <Plus size={16} /> <span className="btn-text">Backlog Registration</span>
          </button>
          
          <div className="header-divider" />
          
          <button className="btn btn-secondary btn-icon archive-btn" title="Production Archive" onClick={() => navigate('/archive')}>
            <Archive size={20} />
          </button>
        </div>
      </header>

      <main className="main-content" ref={mainContentRef}>
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          {PHASES.map((phase) => (
            <KanbanColumn 
              key={phase.id} 
              id={phase.id} 
              title={phase.title} 
              trailers={filteredTrailers.filter(t => t.currentPhase === phase.id)} 
              onUpdateTrailer={updateTrailer} 
              onShipRequest={(t) => {
                if (t.vinDate && t.invoiceNumber) {
                  // Data already collected — archive directly
                  updateTrailer(t.id, { isArchived: true, archivedAt: Date.now() });
                } else {
                  // Data missing — open popup (mandatory at shipping)
                  setPendingShippingTrailer(t);
                }
              }}
              onCardClick={(t) => setSelectedTrailerId(t.id)}
              workload={getPhaseWorkload(phase.id)}
              highlightedId={highlightedTrailerId}
              suggestedBay={suggestedBay}
            />
          ))}
          <DragOverlay>
            {activeTrailer ? <TrailerCard trailer={activeTrailer} /> : null}
          </DragOverlay>
        </DndContext>
      </main>

      {/* Global Progress Strip */}
      <div className="pipeline-workload-strip" style={{ position: 'fixed', bottom: '40px', left: 0, right: 0, height: '50px', borderTop: '2px solid #fbbf24', display: 'flex', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Clock size={20} style={{ color: '#fbbf24' }} />
          <span className="strip-label" style={{ fontSize: '0.8rem', letterSpacing: '0.05em' }}>WORKLOAD REMAINING:</span>
          <span className="strip-value" style={{ color: '#fbbf24', fontSize: '1.25rem' }}>{Math.round(totalWorkRemaining)} HOURS</span>
          <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.2)', margin: '0 1rem' }} />
          <span className="strip-label">PRODUCTION RUNWAY:</span>
          <span className="strip-value" style={{ color: '#fff' }}>
            ~{runwayWeeks < 1 ? '< 1' : Math.round(runwayWeeks)} WEEKS
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <div className="strip-stats">
          <span>Active Units: {trailers.filter(t => !t.isArchived && t.currentPhase !== 'shipping').length}</span>
          <span>Avg. Build Content: {trailers.filter(t => !t.isArchived && t.currentPhase !== 'shipping').length > 0 ? Math.round(totalProductionTime / Math.max(trailers.filter(t => !t.isArchived && t.currentPhase !== 'shipping').length, 1)) : 0}h/unit</span>
        </div>
      </div>

      <footer className="dashboard-footer">
        <div className="footer-legend">
          <span><span className="dot delay">●</span> Bottleneck Delay</span>
          <span><Crown size={12} className="priority-icon" /> High Priority</span>
          <span>Total Pipeline Units: {trailers.length}</span>
        </div>
        <span style={{ flex: 1 }}></span>
        <button className="btn btn-secondary stats-btn" onClick={() => setIsStatsModalOpen(true)}>
          <BarChart3 size={14} /> Production Stats
        </button>
      </footer>

      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Quick Unit Registration">
        <form onSubmit={handleAddTrailer}>
          {/* Serial Number — top of form, prominent */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Serial Number</span>
              {trailers.some(t => t.serialNumber === newTrailerData.serialNumber) && (
                <span style={{ color: '#ef4444', fontSize: '0.7rem', fontWeight: 800 }}>ALREADY EXISTS!</span>
              )}
            </label>
            <div style={{ position: 'relative' }}>
              <input 
                type="text" 
                className="form-input" 
                style={{ 
                  borderRadius: '10px',
                  borderColor: trailers.some(t => t.serialNumber === newTrailerData.serialNumber) ? '#fecdd3' : undefined,
                  backgroundColor: trailers.some(t => t.serialNumber === newTrailerData.serialNumber) ? '#fff1f2' : undefined 
                }}
                value={newTrailerData.serialNumber} 
                onChange={e => setNewTrailerData({ ...newTrailerData, serialNumber: e.target.value })}
                placeholder="e.g. T001"
              />
              {nextSuggestedSerial && (
                <button 
                  type="button"
                  style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: '#f0f9ff', border: '1px solid #bae6fd', color: '#0369a1', fontSize: '0.65rem', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 700 }}
                  onClick={() => setNewTrailerData(prev => ({ ...prev, serialNumber: nextSuggestedSerial }))}
                >
                  SUGGEST: {nextSuggestedSerial}
                </button>
              )}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Customer / Purchase Order</label>
            <input type="text" className="form-input" value={newTrailerData.name} onChange={e => setNewTrailerData({...newTrailerData, name: e.target.value})} placeholder="e.g. Stock Unit" />
          </div>
          <div className="form-group">
            <label className="form-label">LANE TRAILERS *</label>
            <select className="form-select" value={newTrailerData.model} onChange={e => setNewTrailerData({...newTrailerData, model: e.target.value})} required>
              <option value="">Select Model...</option>
              {MODEL_CATEGORIES.map(cat => <optgroup key={cat.name} label={cat.name}>{cat.models.map(m => <option key={m} value={m}>{m}</option>)}</optgroup>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Expected Due Date</label>
              <input type="date" className="form-input" value={newTrailerData.expectedDueDate} onChange={e => setNewTrailerData({...newTrailerData, expectedDueDate: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Promised Shipping Date</label>
              <input type="date" className="form-input" value={newTrailerData.promisedShippingDate} onChange={e => setNewTrailerData({...newTrailerData, promisedShippingDate: e.target.value})} />
            </div>
          </div>
          
          {newTrailerData.model && (
            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '2px dashed #f1f5f9' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#64748b' }}>Estimated Build Time</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a' }}>{totalHoursForNewModel}h</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                {Object.entries(MODEL_TARGET_HOURS[newTrailerData.model] || {}).filter(([p]) => p !== 'shipping' && p !== 'backlog').map(([phase, hours]) => (
                  <div key={phase} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: '0.75rem', textTransform: 'capitalize', color: '#64748b', fontWeight: 600 }}>{phase}</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0f172a' }}>{hours}h</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="form-group" style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', background: '#fff1f2', padding: '0.85rem', borderRadius: '12px', border: '1px solid #fecdd3' }}>
            <input 
              type="checkbox" 
              id="quick-priority" 
              checked={newTrailerData.isPriority} 
              onChange={e => setNewTrailerData({...newTrailerData, isPriority: e.target.checked})}
              style={{ width: '20px', height: '20px' }}
            />
            <label htmlFor="quick-priority" style={{ fontSize: '0.85rem', fontWeight: 800, color: '#be123c', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Crown size={16} /> HIGH PRIORITY UNIT
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={isAdding || !newTrailerData.name || !newTrailerData.serialNumber || trailers.some(t => t.serialNumber === newTrailerData.serialNumber)}
              style={{ 
                height: '3.5rem', 
                fontSize: '1.1rem', 
                opacity: (isAdding || !newTrailerData.name || !newTrailerData.serialNumber || trailers.some(t => t.serialNumber === newTrailerData.serialNumber)) ? 0.7 : 1, 
                position: 'relative',
                background: '#2563eb'
              }}
            >
              {isAdding ? 'Registering Unit...' : 'Add to Backlog'}
              {!isAdding && (
                <div style={{ 
                  position: 'absolute', 
                  top: '-12px', 
                  right: '12px', 
                  background: '#334155', 
                  color: '#fff', 
                  padding: '2px 8px', 
                  borderRadius: '6px', 
                  fontSize: '0.65rem', 
                  fontWeight: 900,
                  border: '2px solid #fff',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                }}>
                  RECOMMENDED: BAY {suggestedBay}
                </div>
              )}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setIsAddModalOpen(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      {selectedTrailer && <TrailerDetailsModal trailer={selectedTrailer} isOpen={true} onClose={() => setSelectedTrailerId(null)} onUpdate={updateTrailer} allTrailers={trailers} />}
      
      <Modal isOpen={!!pendingShippingTrailer} onClose={() => setPendingShippingTrailer(null)} title="VIN & Invoice Entry">
        <form onSubmit={handleShipSubmit}>
          {/* Unit Info Banner */}
          {pendingShippingTrailer && (
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.75rem 1rem', background: '#f8fafc', borderRadius: '10px',
              border: '1px solid #e2e8f0', marginBottom: '1.5rem'
            }}>
              <div>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unit</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>{pendingShippingTrailer.model}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Serial</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>{pendingShippingTrailer.serialNumber}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phase</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#3b82f6' }}>{pendingShippingTrailer.currentPhase.charAt(0).toUpperCase() + pendingShippingTrailer.currentPhase.slice(1)}</div>
              </div>
            </div>
          )}

          {/* Form Fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>Invoice Number *</label>
              <input 
                type="text" 
                className="form-input"
                required
                placeholder="e.g. INV-99012"
                style={{ padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.9rem', fontWeight: 600 }}
                value={shippingForm.invoiceNumber}
                onChange={e => setShippingForm(prev => ({ ...prev, invoiceNumber: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>VIN Date *</label>
              <input 
                type="date" 
                className="form-input"
                required
                style={{ padding: '0.6rem 0.75rem', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '0.9rem', fontWeight: 600 }}
                value={shippingForm.vinDate}
                onChange={e => setShippingForm(prev => ({ ...prev, vinDate: e.target.value }))}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
            {pendingShippingTrailer?.currentPhase !== 'shipping' && (
              <button type="button" className="btn btn-secondary" style={{ borderRadius: '8px', padding: '0.5rem 1.25rem', fontSize: '0.85rem' }} onClick={() => setPendingShippingTrailer(null)}>Skip for Now</button>
            )}
            <button type="submit" className="btn btn-primary" style={{ background: '#3b82f6', borderRadius: '8px', padding: '0.5rem 1.5rem', fontSize: '0.85rem', fontWeight: 700 }}>Save</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isRecapModalOpen} onClose={() => setIsRecapModalOpen(false)} title="Weekly Recap"><p>Recap calculation logic update to include paint/outsource splitted phases.</p></Modal>
      <Modal isOpen={isStatsModalOpen} onClose={() => setIsStatsModalOpen(false)} title="Production Analytics Dashboard">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', padding: '1rem 0' }}>
          
          {/* Section 1: Phase Distribution */}
          <div>
            <h4 style={{ fontSize: '0.8rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>Active Phase Distribution</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {PHASES.map(phase => {
                const count = trailers.filter(t => !t.isArchived && t.currentPhase === phase.id).length;
                const percentage = trailers.filter(t => !t.isArchived).length > 0 ? (count / trailers.filter(t => !t.isArchived).length) * 100 : 0;
                return (
                  <div key={phase.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '100px', fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>{phase.title}</div>
                    <div style={{ flex: 1, height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${percentage}%`, height: '100%', background: 'var(--accent)', borderRadius: '4px' }} />
                    </div>
                    <div style={{ width: '40px', textAlign: 'right', fontSize: '0.85rem', fontWeight: 800, color: '#0f172a' }}>{count}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ height: '1px', background: '#f1f5f9' }} />

          {/* Section 2: Model Popularity */}
          <div>
            <h4 style={{ fontSize: '0.8rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>Model Volume (All Units)</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              {Array.from(new Set(trailers.map(t => t.model))).map(model => {
                const count = trailers.filter(t => t.model === model).length;
                return (
                  <div key={model} style={{ padding: '1rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.85rem' }}>{model}</span>
                    <span style={{ background: '#e2e8f0', padding: '0.2rem 0.6rem', borderRadius: '8px', fontWeight: 800, fontSize: '0.75rem' }}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ height: '1px', background: '#f1f5f9' }} />

          {/* Section 3: Performance Audit */}
          <div style={{ background: '#f0f9ff', padding: '1.25rem', borderRadius: '16px', border: '1px solid #bae6fd' }}>
            <h4 style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>Factory Performance (Archive)</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0c4a6e' }}>{trailers.filter(t => t.isArchived).length}</div>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#0284c7' }}>Units Shipped YTD</div>
              </div>
              <div>
                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0c4a6e' }}>
                  {(() => {
                    const archived = trailers.filter(t => t.isArchived && t.archivedAt);
                    if (archived.length === 0) return '---';
                    const avgMs = archived.reduce((acc, t) => acc + ((t.archivedAt || 0) - t.dateStarted), 0) / archived.length;
                    const days = Math.round(avgMs / (1000 * 60 * 60 * 24));
                    return `${days} Days`;
                  })()}
                </div>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#0284c7' }}>Avg Lifecycle (Start → Ship)</div>
              </div>
            </div>
          </div>

        </div>
      </Modal>
    </div>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('lane-trailers-auth') === 'true';
  });
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const CORRECT_PIN = '1234'; // Default PIN

  const handlePinEntry = (digit: string) => {
    setError(false);
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      if (newPin.length === 4) {
        if (newPin === CORRECT_PIN) {
          localStorage.setItem('lane-trailers-auth', 'true');
          setIsAuthenticated(true);
        } else {
          setError(true);
          setTimeout(() => setPin(''), 500);
        }
      }
    }
  };

  if (isAuthenticated) return <>{children}</>;

  return (
    <div className="auth-gate-container">
      <div className="auth-gate-header">
        <img src={logo} alt="Lane Trailers" className="auth-gate-logo" />
        <h1 className="auth-gate-title">Production Security</h1>
        <p className="auth-gate-subtitle">Please enter your access PIN to continue.</p>
      </div>

      <div className="pin-indicator-row">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`pin-dot ${pin.length > i ? 'active' : ''} ${error ? 'error' : ''}`} />
        ))}
      </div>

      <div className="keypad-grid">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((btn, i) => {
          if (btn === '') return <div key={i} />;
          return (
            <button
              key={i}
              className="keypad-button"
              onClick={() => {
                if (btn === '⌫') setPin(prev => prev.slice(0, -1));
                else handlePinEntry(btn);
              }}
            >
              {btn}
            </button>
          )
        })}
      </div>
      {error && (
        <p style={{ marginTop: '2rem', color: '#ef4444', fontWeight: 600, animation: 'shake 0.4s' }}>Incorrect PIN. Please try again.</p>
      )}

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
      `}</style>
    </div>
  );
}


function App() {
  const [trailers, setTrailers] = useState<Trailer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  const [bayCapacities, setBayCapacities] = useState<Record<StationId, number>>({
    'B1': 40,
    'B2': 80,
    'B3': 80,
    'B4': 40,
    'None': 0
  });

  const nextSuggestedSerial = useMemo(() => {
    if (trailers.length === 0) return '';
    
    // Trailers are already sorted by dateStarted DESC from the initial fetch,
    // but let's be safe and ensure we check them in chronological order of entry.
    const sorted = [...trailers].sort((a, b) => b.dateStarted - a.dateStarted);

    for (const t of sorted) {
      const match = t.serialNumber.match(/^(.*?)([0-9]+)$/);
      if (match) {
        const prefix = match[1];
        const numStr = match[2];
        let nextNum = parseInt(numStr, 10) + 1;
        
        // Loop until we find a serial that doesn't exist yet
        let suggested = `${prefix}${nextNum.toString().padStart(numStr.length, "0")}`;
        while (trailers.some(tr => tr.serialNumber === suggested)) {
          nextNum++;
          suggested = `${prefix}${nextNum.toString().padStart(numStr.length, "0")}`;
        }
        
        return suggested;
      }
    }
    
    return '';
  }, [trailers]);

  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      try {
        const [trailersRes, bayRes] = await Promise.all([
          supabase.from('trailers').select('*').order('dateStarted', { ascending: false }),
          supabase.from('bay_settings').select('*')
        ]);
        
        if (trailersRes.data) setTrailers(trailersRes.data);
        if (bayRes.data) {
          const caps = { 
            'B1': 40,
            'B2': 80,
            'B3': 80,
            'B4': 40,
            'None': 0
          };
          bayRes.data.forEach((b: any) => {
            caps[b.id as StationId] = b.capacity;
          });
          setBayCapacities(caps);
        }
        setIsConnected(true);
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();

    // Subscribe to trailer changes
    const trailerChannel = supabase
      .channel('trailers-changes')
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'trailers' },
        (payload: any) => {
          if (payload.eventType === 'INSERT') {
            setTrailers(prev => prev.find(t => t.id === payload.new.id) ? prev : [payload.new as Trailer, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setTrailers(prev => prev.map(t => t.id === payload.new.id ? { ...t, ...payload.new } as Trailer : t));
          } else if (payload.eventType === 'DELETE') {
            setTrailers(prev => prev.filter(t => t.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    const capChannel = supabase
      .channel('bay-settings-changes')
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'bay_settings' },
        (payload: any) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            setBayCapacities(prev => ({ ...prev, [payload.new.id]: payload.new.capacity }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(trailerChannel);
      supabase.removeChannel(capChannel);
    };
  }, []);

  const updateCapacity = async (id: StationId, capacity: number) => {
    // Optimistic update
    setBayCapacities(prev => ({ ...prev, [id]: capacity }));

    const { error } = await supabase
      .from('bay_settings')
      .upsert({ id, capacity });
    
    if (error) {
      console.error('Error updating bay capacity:', error);
    }
  };

  const updateTrailer = async (id: string, updates: Partial<Trailer>) => {
    // Optimistic update
    setTrailers(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));

    const { error } = await supabase
      .from('trailers')
      .update(updates)
      .eq('id', id);
    
    if (error) {
      console.error('Error updating trailer:', error);
      // Optional: Rollback on error
    }
  };

  const addTrailer = async (newTrailer: Trailer) => {
    // Optimistic update
    setTrailers(prev => [newTrailer, ...prev]);

    // Clean up empty strings for date fields to prevent DB errors
    const payload = { ...newTrailer };
    if (!payload.expectedDueDate) delete payload.expectedDueDate;
    if (!payload.promisedShippingDate) delete payload.promisedShippingDate;

    const { error } = await supabase
      .from('trailers')
      .insert([payload]);
    
    // SELF-HEALING: If columns are missing in DB, try again without them
    if (error && error.message.includes('expectedDueDate')) {
      console.warn('New columns missing in DB, attempting fallback registration...');
      const fallbackPayload = { ...payload };
      delete fallbackPayload.expectedDueDate;
      delete fallbackPayload.promisedShippingDate;

      const { error: fallbackError } = await supabase
        .from('trailers')
        .insert([fallbackPayload]);
      
      if (fallbackError) {
        alert("Registration Failed: " + fallbackError.message);
        setTrailers(prev => prev.filter(t => t.id !== newTrailer.id));
      } else {
        alert("Unit Registered (Fallback Mode: Dates excluded). Please update DB schema.");
      }
      return;
    }

    if (error) {
      alert("Error adding trailer: " + error.message);
      // Rollback on error
      setTrailers(prev => prev.filter(t => t.id !== newTrailer.id));
    }
  };
  
  // Global workload calculation moved to App level for prop passing
  const totalWorkRemaining = useMemo(() => {
    return trailers.reduce((sum, t) => {
      if (t.currentPhase === 'shipping' || t.isArchived) return sum;
      const phaseIndex = PHASES.findIndex(p => p.id === t.currentPhase);
      if (phaseIndex === -1) return sum;
      
      return sum + PHASES.slice(phaseIndex).reduce((pSum, p) => {
        if (p.id === 'backlog' || p.id === 'shipping') return pSum;
        if (t.finishingType === 'Paint' && p.id === 'outsource') return pSum;
        if (t.finishingType === 'Outsource' && p.id === 'paint') return pSum;
        if (!t.finishingType && p.id === 'outsource') return pSum;

        const target = (MODEL_TARGET_HOURS[t.model]?.[p.id] || 0);
        if (p.id === t.currentPhase) {
          const currentLog = t.history.find(h => h.phase === t.currentPhase && !h.exitedAt);
          const loggedInCurrent = (currentLog?.bayManualHours || currentLog?.phaseManualHours || 0);
          return pSum + Math.max(0, target - loggedInCurrent);
        }
        return pSum + target;
      }, 0);
    }, 0);
  }, [trailers]);

  const totalShopCapacity = useMemo(() => {
    return Object.values(bayCapacities).reduce((sum, h) => sum + (h || 0), 0);
  }, [bayCapacities]);

  const runwayWeeks = useMemo(() => {
    if (totalShopCapacity === 0) return 0;
    return totalWorkRemaining / totalShopCapacity;
  }, [totalWorkRemaining, totalShopCapacity]);

  const getSuggestedBay = () => {
    let bestBay: StationId = 'B1';
    let minTime = Infinity;

    STATIONS.forEach(bayId => {
      const stationTrailers = trailers.filter(t => t.station === bayId && !t.isArchived);
      const pipe = stationTrailers.reduce((acc, t) => {
        const fIdx = PHASES.findIndex(p => p.id === t.currentPhase);
        if (fIdx === -1) return acc;
        
        return acc + PHASES.slice(fIdx).reduce((pAcc, p) => {
          if (p.id === 'shipping' || (p.id === 'paint' && t.finishingType === 'Outsource') || (p.id === 'outsource' && t.finishingType === 'Paint') || (!t.finishingType && p.id === 'outsource')) return pAcc;
          const target = MODEL_TARGET_HOURS[t.model]?.[p.id] || PHASE_METADATA[p.id].defaultTargetHours;
          let res = target;
          if (p.id === t.currentPhase) {
            const cur = t.history.find(h => h.phase === t.currentPhase && !h.exitedAt);
            res = Math.max(0, target - (cur?.bayManualHours || cur?.phaseManualHours || 0));
          }
          return pAcc + res;
        }, 0);
      }, 0);

      const cap = bayCapacities[bayId] || 40;
      const lt = cap > 0 ? pipe / cap : 0;
      if (lt < minTime) { minTime = lt; bestBay = bayId; }
    });
    return bestBay;
  };

  const suggestedBay = useMemo(getSuggestedBay, [trailers, bayCapacities]);

  if (loading) {
    return (
      <div style={{ height: '100vh', width: '100vw', background: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <AuthGate>
      <Routes>
        <Route path="/" element={<Dashboard trailers={trailers} setTrailers={setTrailers} updateTrailer={updateTrailer} isConnected={isConnected} addTrailer={addTrailer} suggestedBay={suggestedBay} runwayWeeks={runwayWeeks} nextSuggestedSerial={nextSuggestedSerial} />} />
        <Route path="/backlog" element={<BacklogView trailers={trailers} onAddTrailer={addTrailer} onUpdateTrailer={updateTrailer} suggestedBay={suggestedBay} nextSuggestedSerial={nextSuggestedSerial} />} />
        <Route path="/stations" element={<StationView trailers={trailers} setTrailers={setTrailers} onUpdateTrailer={updateTrailer} bayCapacities={bayCapacities} onUpdateCapacity={updateCapacity} />} />
        <Route path="/tv" element={<TVView trailers={trailers} />} />
        <Route path="/tv/station1" element={<TVView trailers={trailers} monitorMode="station1" />} />
        <Route path="/tv/station2" element={<TVView trailers={trailers} monitorMode="station2" />} />
        <Route path="/archive" element={<ArchiveView trailers={trailers} onUpdateTrailer={updateTrailer} />} />
        <Route path="/schedule" element={<ScheduleView trailers={trailers} />} />
        <Route path="/catalog" element={<CatalogView />} />
      </Routes>
    </AuthGate>
  );
}

export default App;
