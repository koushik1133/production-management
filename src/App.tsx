import { useState, useEffect, useMemo, useRef } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type {
  DragStartEvent,
  DragOverEvent
} from '@dnd-kit/core';
import {
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';

import { KanbanColumn } from './components/KanbanColumn';
import { TrailerCard } from './components/TrailerCard';
import { TrailerDetailsModal } from './components/TrailerDetailsModal';
import { Modal } from './components/Modal';
import { BacklogView } from './BacklogView';
import TVView from './TVView';
import StationView from './StationView';
import { ArchiveView } from './ArchiveView';

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
  BarChart3
} from 'lucide-react';

import type { Trailer, PhaseId, StationId } from './types';
import { 
  PHASES, 
  MODEL_CATEGORIES, 
  MODEL_TARGET_HOURS 
} from './types';

import { exportToCsv, parseCsv } from './utils/CsvUtils';
import logo from './assets/logo.png';
import './App.css';

const INITIAL_TRAILERS: Trailer[] = [
  {
    id: '1',
    name: 'Precision Ag Services',
    model: 'LAD 2424 Gooseneck',
    serialNumber: 'LT-10023',
    station: 'B1',
    dateStarted: Date.now() - 86400000 * 5,
    currentPhase: 'build',
    isPriority: true,
    notes: 'Awaiting drone landing pad structural verification.',
    history: [{ phase: 'build', enteredAt: Date.now() - 86400000 * 5 }]
  },
  {
    id: '2',
    name: 'Northwest Utility Co.',
    model: 'LRG 1010R',
    serialNumber: 'LT-10156',
    station: 'B2',
    dateStarted: Date.now() - 86400000 * 2,
    currentPhase: 'prefab',
    history: [{ phase: 'prefab', enteredAt: Date.now() - 86400000 * 2 }]
  },
  {
    id: '3',
    name: 'Global Fiber Solutions',
    model: 'LPT 4260',
    serialNumber: 'LT-10189',
    station: 'B3',
    dateStarted: Date.now() - 3600000 * 4,
    currentPhase: 'backlog',
    history: [{ phase: 'backlog', enteredAt: Date.now() - 3600000 * 4 }]
  },
  {
    id: '4',
    name: 'Midwest Pipeline',
    model: 'LSP 3040G (Stick)',
    serialNumber: 'LT-10244',
    station: 'B4',
    dateStarted: Date.now() - 86400000 * 3,
    currentPhase: 'trim',
    history: [{ phase: 'trim', enteredAt: Date.now() - 86400000 * 3 }]
  },
  {
    id: '5',
    name: 'City Water Dept',
    model: 'LRE 0214',
    serialNumber: 'LT-10567',
    station: 'B1',
    dateStarted: Date.now() - 86400000 * 1,
    currentPhase: 'paint',
    history: [{ phase: 'paint', enteredAt: Date.now() - 86400000 * 1 }]
  },
  {
    id: '6',
    name: 'Telecom Builders',
    model: 'LRS 0320',
    serialNumber: 'LT-10902',
    station: 'B2',
    dateStarted: Date.now() - 3600000 * 12,
    currentPhase: 'shipping',
    history: [{ phase: 'shipping', enteredAt: Date.now() - 3600000 * 12 }]
  }
];

function Dashboard({ trailers, setTrailers, updateTrailer }: { 
  trailers: Trailer[], 
  setTrailers: React.Dispatch<React.SetStateAction<Trailer[]>>,
  updateTrailer: (id: string, updates: Partial<Trailer>) => void 
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
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

  const [newTrailerData, setNewTrailerData] = useState({
    name: '',
    model: '',
    station: 'B1' as StationId,
    isPriority: false
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const filteredTrailers = useMemo(() => {
    return trailers.filter(t => !t.isArchived && (
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      t.serialNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.model.toLowerCase().includes(searchQuery.toLowerCase())
    ));
  }, [trailers, searchQuery]);

  // Calculate Column Totals
  const getPhaseHours = (phaseId: PhaseId) => {
    if (phaseId === 'shipping') return 0; // Exclude shipping hours
    return trailers
      .filter(t => t.currentPhase === phaseId)
      .reduce((sum, t) => sum + (MODEL_TARGET_HOURS[t.model]?.[phaseId] || 0), 0);
  };

  // Calculate Global Work Remaining
  const totalWorkRemaining = trailers.reduce((sum, t) => {
    const phaseIndex = PHASES.findIndex(p => p.id === t.currentPhase);
    if (phaseIndex === -1 || t.currentPhase === 'shipping') return sum;
    
    // Sum target hours for current phase AND all subsequent phases EXCEPT backlog & shipping
    const remainingForThisTrailer = PHASES.slice(phaseIndex).reduce((pSum, p) => {
      if (p.id === 'backlog' || p.id === 'shipping') return pSum;
      return pSum + (MODEL_TARGET_HOURS[t.model]?.[p.id] || 0);
    }, 0);
    
    return sum + remainingForThisTrailer;
  }, 0);

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

    if (overPhase && activeTrailer.currentPhase !== overPhase) {
      setTrailers(prev => prev.map(t => {
        if (t.id === activeId) {
          const now = Date.now();
          const updatedHistory = [...t.history];
          const currentLogIndex = updatedHistory.findIndex(h => h.phase === t.currentPhase && !h.exitedAt);
          if (currentLogIndex !== -1) {
            const prevLog = updatedHistory[currentLogIndex];
            updatedHistory[currentLogIndex] = { ...prevLog, exitedAt: now, duration: now - prevLog.enteredAt };
          }
          updatedHistory.push({ phase: overPhase as PhaseId, enteredAt: now });
          return { ...t, currentPhase: overPhase as PhaseId, history: updatedHistory };
        }
        return t;
      }));
    }
  };

  const handleDragEnd = () => setActiveId(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const imported = parseCsv(text) as Trailer[];
      setTrailers(prev => [...prev, ...imported]);
    };
    reader.readAsText(file);
  };

  const handleAddTrailer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrailerData.model) {
      alert("Missing Required Field: Please select an Official Model.");
      return;
    }
    const newTrailer: Trailer = {
      id: Math.random().toString(36).substr(2, 9),
      name: newTrailerData.name,
      model: newTrailerData.model,
      serialNumber: `LT-${Math.floor(10000 + Math.random() * 90000)}`,
      station: newTrailerData.station,
      isPriority: newTrailerData.isPriority,
      dateStarted: Date.now(),
      currentPhase: 'backlog',
      history: [{ phase: 'backlog', enteredAt: Date.now() }],
    };
    setTrailers(prev => [newTrailer, ...prev]);
    setIsAddModalOpen(false);
    setNewTrailerData({ name: '', model: '', station: 'B1', isPriority: false });
  };

  const selectedTrailer = trailers.find(t => t.id === selectedTrailerId);
  const activeTrailer = activeId ? trailers.find(t => t.id === activeId) : null;

  return (
    <div className="app-container">
      <header className="header" style={{ padding: '0.75rem 1.5rem', height: 'auto', minHeight: '64px' }}>
        <div className="header-left">
          <img src={logo} alt="Lane Trailers" style={{ height: '32px' }} />
          <div style={{ marginLeft: '1.5rem', display: 'flex', flexDirection: 'column', borderLeft: '1px solid #e2e8f0', paddingLeft: '1.5rem' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>{format(currentTime, 'EEEE, MMMM d')}</div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', letterSpacing: '0.05em' }}>{format(currentTime, 'hh:mm:ss a')} <span style={{ opacity: 0.5 }}>• LIVE</span></div>
          </div>
          
          <div className="search-bar" style={{ marginLeft: '2rem' }}>
            <Search size={16} color="var(--text-muted)" />
            <input type="text" placeholder="Search serial or customer..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
        </div>

        <div className="header-right" style={{ gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/stations')}>
            <MapPin size={16} /> Bays
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/tv')}>
            <Tv size={16} /> TV Mode
          </button>
          <button className="btn btn-secondary" onClick={() => exportToCsv(trailers)} title="Export CSV">
            <Download size={16} />
          </button>
          <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} title="Import CSV">
            <Upload size={16} />
          </button>
          <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".csv" onChange={handleFileUpload} />
          
          <div style={{ width: '1px', height: '24px', background: 'var(--border-default)', margin: '0 0.5rem' }} />
          
          <button className="btn btn-primary" onClick={() => navigate('/backlog')}>
             <Plus size={16} /> Backlog Registration
          </button>
          
          <div style={{ width: '1px', height: '24px', background: 'var(--border-default)', margin: '0 0.5rem' }} />
          
          <button 
            className="btn btn-secondary btn-icon" 
            title="Production Archive" 
            onClick={() => navigate('/archive')}
            style={{ borderRadius: '12px' }}
          >
            <Archive size={20} />
          </button>
        </div>
      </header>

      <main className="main-content" style={{ paddingBottom: '80px' }}>
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          {PHASES.map((phase) => (
            <KanbanColumn 
              key={phase.id} 
              id={phase.id} 
              title={phase.title} 
              trailers={filteredTrailers.filter(t => t.currentPhase === phase.id)} 
              onUpdateTrailer={updateTrailer} 
              onCardClick={(t) => setSelectedTrailerId(t.id)}
              totalHours={getPhaseHours(phase.id)}
            />
          ))}
          <DragOverlay>
            {activeTrailer ? <TrailerCard trailer={activeTrailer} /> : null}
          </DragOverlay>
        </DndContext>
      </main>

      {/* Global Progress Strip */}
      <div style={{ 
        position: 'fixed', 
        bottom: '40px', 
        left: 0, 
        right: 0, 
        height: '40px', 
        background: '#09090b', 
        color: 'white', 
        display: 'flex', 
        alignItems: 'center', 
        padding: '0 1.5rem',
        fontSize: '0.875rem',
        zIndex: 50,
        boxShadow: '0 -4px 12px rgba(0,0,0,0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Clock size={16} color="#fbbf24" />
          <span style={{ fontWeight: 600, color: '#fbbf24' }}>TOTAL PIPELINE WORKLOAD:</span>
          <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>{totalWorkRemaining} HOURS REMAINING</span>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: '2rem', opacity: 0.8 }}>
          <span>Active Units: {trailers.filter(t => t.currentPhase !== 'shipping').length}</span>
          <span>Avg Hours/Unit: {trailers.length > 0 ? Math.round(totalWorkRemaining / trailers.length) : 0}h</span>
        </div>
      </div>

      <footer style={{ height: '40px', padding: '0 1.5rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', fontSize: '0.8rem', color: '#64748b', position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <span><span style={{ color: '#ef4444', fontWeight: 700 }}>●</span> Bottleneck Delay</span>
          <span><Crown size={12} fill="#ef4444" stroke="#ef4444" /> High Priority</span>
          <span>Total Pipeline Units: {trailers.length}</span>
        </div>
        <span style={{ flex: 1 }}></span>
        <button className="btn btn-secondary" style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }} onClick={() => setIsStatsModalOpen(true)}>
          <BarChart3 size={14} /> Production Stats
        </button>
      </footer>

      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Quick Unit Registration">
        <form onSubmit={handleAddTrailer}>
          <div className="form-group">
            <label className="form-label">Customer / Purchase Order</label>
            <input type="text" className="form-input" value={newTrailerData.name} onChange={e => setNewTrailerData({...newTrailerData, name: e.target.value})} placeholder="e.g. Stock Unit" />
          </div>
          <div className="form-group">
            <label className="form-label">Official Lane Model *</label>
            <select className="form-select" value={newTrailerData.model} onChange={e => setNewTrailerData({...newTrailerData, model: e.target.value})} required>
              <option value="">Select Model...</option>
              {MODEL_CATEGORIES.map(cat => <optgroup key={cat.name} label={cat.name}>{cat.models.map(m => <option key={m} value={m}>{m}</option>)}</optgroup>)}
            </select>
          </div>
          <div className="form-footer"><button type="button" className="btn btn-secondary" onClick={() => setIsAddModalOpen(false)}>Cancel</button><button type="submit" className="btn btn-primary">Add to Backlog</button></div>
        </form>
      </Modal>

      {selectedTrailer && <TrailerDetailsModal trailer={selectedTrailer} isOpen={true} onClose={() => setSelectedTrailerId(null)} onUpdate={updateTrailer} />}
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

function App() {
  const [trailers, setTrailers] = useState<Trailer[]>(() => {
    const saved = localStorage.getItem('lane-trailers-v2');
    return saved ? JSON.parse(saved) : INITIAL_TRAILERS;
  });

  const updateTrailer = (id: string, updates: Partial<Trailer>) => {
    setTrailers(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };
  
  useEffect(() => {
    localStorage.setItem('lane-trailers-v2', JSON.stringify(trailers));
  }, [trailers]);

  return (
    <Routes>
      <Route path="/" element={<Dashboard trailers={trailers} setTrailers={setTrailers} updateTrailer={updateTrailer} />} />
      <Route path="/backlog" element={<BacklogView trailers={trailers} onAddTrailer={(t) => setTrailers(prev => [t, ...prev])} onUpdateTrailer={updateTrailer} />} />
      <Route path="/stations" element={<StationView trailers={trailers} onUpdateTrailer={updateTrailer} />} />
      <Route path="/tv" element={<TVView trailers={trailers} />} />
      <Route path="/tv/station1" element={<TVView trailers={trailers} monitorMode="station1" />} />
      <Route path="/tv/station2" element={<TVView trailers={trailers} monitorMode="station2" />} />
      <Route path="/archive" element={<ArchiveView trailers={trailers} onUpdateTrailer={updateTrailer} />} />
    </Routes>
  );
}

export default App;
