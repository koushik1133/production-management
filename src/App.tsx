import { useState, useEffect, useMemo, useRef } from 'react';
import { Routes, Route, useNavigate, Link } from 'react-router-dom';
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
  DragOverEvent,
  DragEndEvent
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
  BarChart3,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

import type { Trailer, PhaseId, StationId } from './types';
import { 
  PHASES, 
  MODEL_CATEGORIES, 
  MODEL_TARGET_HOURS 
} from './types';

import { exportToCsv, parseCsv } from './utils/CsvUtils';
import logo from './assets/logo.jpeg';
import './App.css';

import { supabase } from './lib/supabase';

function Dashboard({ trailers, setTrailers, updateTrailer, isConnected, addTrailer }: { 
  trailers: Trailer[], 
  setTrailers: React.Dispatch<React.SetStateAction<Trailer[]>>,
  updateTrailer: (id: string, updates: Partial<Trailer>) => void,
  isConnected: boolean,
  addTrailer: (trailer: Trailer) => Promise<void>
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
  const mainContentRef = useRef<HTMLDivElement>(null);

  const scrollBoard = (direction: 'left' | 'right') => {
    if (mainContentRef.current) {
      const amount = 400;
      mainContentRef.current.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
    }
  };

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

  const [dragStartPhase, setDragStartPhase] = useState<PhaseId | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    const trailer = trailers.find(t => t.id === event.active.id);
    if (trailer) setDragStartPhase(trailer.currentPhase);
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

  const [pendingShippingTrailer, setPendingShippingTrailer] = useState<Trailer | null>(null);
  const [shippingForm, setShippingForm] = useState({ invoiceNumber: '', vinDate: '' });

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active } = event;
    const activeId = active.id as string;
    const trailer = trailers.find(t => t.id === activeId);
    
    if (trailer) {
      // Prompt for shipping data if newly moved to shipping
      if (trailer.currentPhase === 'shipping' && dragStartPhase !== 'shipping') {
        setPendingShippingTrailer(trailer);
      }
      
      // SYNC FINAL STATE TO SUPABASE
      // This is the "Spontaneous" update for other devices
      const { error } = await supabase
        .from('trailers')
        .update({
          currentPhase: trailer.currentPhase,
          history: trailer.history
        })
        .eq('id', trailer.id);
        
      if (error) console.error('Error syncing drag movement:', error);
    }
    
    setActiveId(null);
    setDragStartPhase(null);
  };

  const handleShipSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingShippingTrailer) return;
    
    await updateTrailer(pendingShippingTrailer.id, {
      ...shippingForm,
    });
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

  const handleAddTrailer = async (e: React.FormEvent) => {
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
    
    await addTrailer(newTrailer);
    setIsAddModalOpen(false);
    setNewTrailerData({ name: '', model: '', station: 'B1', isPriority: false });
  };

  const selectedTrailer = trailers.find(t => t.id === selectedTrailerId);
  const activeTrailer = activeId ? trailers.find(t => t.id === activeId) : null;

  return (
    <div className="app-container">
      <header className="header" style={{ padding: '0.75rem 1.5rem', height: 'auto', minHeight: '64px' }}>
        <div className="header-left">
          <Link to="/" style={{ display: 'flex', alignItems: 'center' }}>
            <img src={logo} alt="Lane Trailers" style={{ height: '32px' }} />
          </Link>
          <div style={{ marginLeft: '1.5rem', display: 'flex', flexDirection: 'column', borderLeft: '1px solid #e2e8f0', paddingLeft: '1.5rem' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>{format(currentTime, 'EEEE, MMMM d')}</div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', letterSpacing: '0.05em' }}>{format(currentTime, 'hh:mm:ss a')} <span style={{ opacity: 0.5 }}>• LIVE</span></div>
          </div>
          
          <div className="search-bar" style={{ marginLeft: '2rem' }}>
            <Search size={16} color="var(--text-muted)" />
            <input type="text" placeholder="Search serial or customer..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '1.5rem' }}>
            <button className="btn btn-secondary btn-icon" onClick={() => scrollBoard('left')} style={{ padding: '0.4rem', borderRadius: '8px' }}>
              <ChevronLeft size={20} />
            </button>
            <button className="btn btn-secondary btn-icon" onClick={() => scrollBoard('right')} style={{ padding: '0.4rem', borderRadius: '8px' }}>
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        <div className="header-right" style={{ gap: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#f1f5f9', padding: '0.4rem 0.75rem', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
            <div style={{ 
              width: '8px', 
              height: '8px', 
              borderRadius: '50%', 
              background: isConnected ? '#22c55e' : '#ef4444',
              boxShadow: isConnected ? '0 0 8px #22c55e' : 'none'
            }} />
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {isConnected ? 'Live Sync' : 'Offline'}
            </span>
          </div>
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

      <main className="main-content" ref={mainContentRef} style={{ paddingBottom: '80px' }}>
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          {PHASES.map((phase) => (
            <KanbanColumn 
              key={phase.id} 
              id={phase.id} 
              title={phase.title} 
              trailers={filteredTrailers.filter(t => t.currentPhase === phase.id)} 
              onUpdateTrailer={updateTrailer} 
              onShipRequest={(t) => setPendingShippingTrailer(t)}
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
      
      <Modal isOpen={!!pendingShippingTrailer} onClose={() => setPendingShippingTrailer(null)} title="Dispatch Data Entry (Trim Phase)">
        <form onSubmit={handleShipSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1rem 0' }}>
             <div className="form-group">
              <label>Invoice Number</label>
              <input 
                type="text" 
                required
                placeholder="e.g. INV-99012"
                value={shippingForm.invoiceNumber}
                onChange={e => setShippingForm(prev => ({ ...prev, invoiceNumber: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label>VIN Date</label>
              <input 
                type="date" 
                required
                value={shippingForm.vinDate}
                onChange={e => setShippingForm(prev => ({ ...prev, vinDate: e.target.value }))}
              />
            </div>
          </div>
          <div className="form-footer">
            <button type="button" className="btn btn-secondary" onClick={() => setPendingShippingTrailer(null)}>Dismiss</button>
            <button type="submit" className="btn btn-primary" style={{ background: '#3b82f6' }}>Save Dispatch Info</button>
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
    <div style={{ 
      height: '100vh', 
      width: '100vw', 
      background: '#09090b', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center',
      color: 'white'
    }}>
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <img src={logo} alt="Lane Trailers" style={{ height: '48px', marginBottom: '1.5rem' }} />
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#fafafa' }}>Production Security</h1>
        <p style={{ color: '#a1a1aa', fontSize: '0.9rem' }}>Please enter your access PIN to continue.</p>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '3rem' }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ 
            width: '20px', 
            height: '20px', 
            borderRadius: '50%', 
            background: pin.length > i ? '#3b82f6' : '#27272a',
            border: error ? '2px solid #ef4444' : '2px solid transparent',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: pin.length > i ? '0 0 15px rgba(59, 130, 246, 0.5)' : 'none'
          }} />
        ))}
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(3, 1fr)', 
        gap: '1rem',
        width: '100%',
        maxWidth: '300px'
      }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((btn, i) => {
          if (btn === '') return <div key={i} />;
          return (
            <button
              key={i}
              onClick={() => {
                if (btn === '⌫') setPin(prev => prev.slice(0, -1));
                else handlePinEntry(btn);
              }}
              style={{
                height: '70px',
                borderRadius: '16px',
                background: '#18181b',
                border: '1px solid #27272a',
                color: 'white',
                fontSize: '1.5rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.1s',
              }}
              onMouseDown={(e) => e.currentTarget.style.background = '#27272a'}
              onMouseUp={(e) => e.currentTarget.style.background = '#18181b'}
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

  // Fetch initial data
  useEffect(() => {
    const fetchTrailers = async () => {
      try {
        const { data, error } = await supabase
          .from('trailers')
          .select('*')
          .order('dateStarted', { ascending: false });
        
        if (error) throw error;
        if (data) setTrailers(data);
        setIsConnected(true);
      } catch (err) {
        console.error('Initial fetch failed:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTrailers();

    // Subscribe to real-time changes
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'trailers',
        },
        (payload: any) => {
          console.log('Change received!', payload);
          if (payload.eventType === 'INSERT') {
            setTrailers(prev => {
              if (prev.find(t => t.id === payload.new.id)) return prev;
              return [payload.new as Trailer, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            setTrailers(prev => prev.map(t => t.id === payload.new.id ? payload.new as Trailer : t));
          } else if (payload.eventType === 'DELETE') {
            setTrailers(prev => prev.filter(t => t.id === payload.old.id));
          }
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
    const { error } = await supabase
      .from('trailers')
      .insert([newTrailer]);
    
    if (error) console.error('Error adding trailer:', error);
  };

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
        <Route path="/" element={<Dashboard trailers={trailers} setTrailers={setTrailers} updateTrailer={updateTrailer} isConnected={isConnected} addTrailer={addTrailer} />} />
        <Route path="/backlog" element={<BacklogView trailers={trailers} onAddTrailer={addTrailer} onUpdateTrailer={updateTrailer} />} />
        <Route path="/stations" element={<StationView trailers={trailers} onUpdateTrailer={updateTrailer} />} />
        <Route path="/tv" element={<TVView trailers={trailers} />} />
        <Route path="/tv/station1" element={<TVView trailers={trailers} monitorMode="station1" />} />
        <Route path="/tv/station2" element={<TVView trailers={trailers} monitorMode="station2" />} />
        <Route path="/archive" element={<ArchiveView trailers={trailers} onUpdateTrailer={updateTrailer} />} />
      </Routes>
    </AuthGate>
  );
}

export default App;
