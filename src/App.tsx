import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Routes, Route, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
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
  Clock,
  Archive,
  Crown,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Image as ImageIcon,
  DollarSign,
  Sun,
  Moon,
  Undo2,
  Redo2
} from 'lucide-react';

import { 
  PHASES, 
  MODEL_CATEGORIES, 
  MODEL_TARGET_HOURS,
  STATIONS,
  PHASE_METADATA,
  calculateTrailerRemainingHours
} from './types';
import type { Trailer, PhaseId, StationId, ModelSpec, CatalogModel, ShippedTrailer, UserRole } from './types';

const staticModelCategories = MODEL_CATEGORIES;
const localModelSpecs = MODEL_TARGET_HOURS;


import logo from './assets/logo.jpeg';
import './App.css';

import { supabase } from './lib/supabase';

function Dashboard({ 
  theme,
  onToggleTheme,
  sensors,
  handleDragStart,
  handleDragOver,
  handleDragEnd,
  activeId,
  filteredTrailers,
  totalWorkRemaining,
  totalProductionTime,
  trailers, 
  updateTrailer, 
  addTrailer, 
  suggestedBay, 
  runwayWeeks,
  nextSuggestedSerial,
  localTargetHours,
  onDeleteTrailer,
  onSaveShippedRecord,
  searchQuery,
  setSearchQuery,
  shippedTrailers,
  userRole,
  undoStack,
  handleUndo,
  redoStack,
  handleRedo
}: {
  trailers: Trailer[], 
  updateTrailer: (id: string, updates: Partial<Trailer>) => void,
  addTrailer: (trailer: Trailer) => Promise<void>,
  suggestedBay: StationId,
  runwayWeeks: number,
  nextSuggestedSerial?: string,
  localTargetHours: Record<string, Record<PhaseId, number>>,
  onDeleteTrailer: (id: string) => void,
  onSaveShippedRecord: (record: Omit<ShippedTrailer, 'id'>) => Promise<void>,
  theme: 'light' | 'dark',
  onToggleTheme: () => void,
  sensors: any,
  handleDragStart: (event: DragStartEvent) => void,
  handleDragOver: (event: DragOverEvent) => void,
  handleDragEnd: (event: DragEndEvent) => Promise<void>,
  activeId: string | null,
  filteredTrailers: Trailer[],
  totalWorkRemaining: number,
  totalProductionTime: number,
  searchQuery: string,
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>,
  shippedTrailers: ShippedTrailer[],
  userRole: UserRole,
  undoStack: Array<Array<{ id: string } & Partial<Trailer>>>,
  handleUndo: () => void,
  redoStack: Array<Array<{ id: string } & Partial<Trailer>>>,
  handleRedo: () => void
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightedTrailerId = searchParams.get('highlight');

  useEffect(() => {
    if (highlightedTrailerId) {
      const timer = setTimeout(() => {
        setSearchParams({});
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [highlightedTrailerId, setSearchParams]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const [selectedTrailerId, setSelectedTrailerId] = useState<string | null>(null);
  const [pendingShippingTrailer, setPendingShippingTrailer] = useState<Trailer | null>(null);
  const [shippingForm, setShippingForm] = useState({ 
    invoice_number: '', 
    vin_date: '',
    customer_name: '',
    sale_price: '',
    dealer_price: '',
    cost_price: ''
  });
  const selectedTrailer = useMemo(() => trailers.find(t => t.id === selectedTrailerId), [trailers, selectedTrailerId]);
  const [shippingPhotos, setShippingPhotos] = useState<{ p1: File | null, p2: File | null, p3: File | null }>({ p1: null, p2: null, p3: null });
  const [shippingHours, setShippingHours] = useState<Record<string, string>>({
    prefab: '0', build: '0', paint: '0', outsource: '0', trim: '0'
  });
  const [isShipping, setIsShipping] = useState(false);

  useEffect(() => {
    if (pendingShippingTrailer) {
      const getPhaseHours = (phaseId: string) => {
        const entries = pendingShippingTrailer.history.filter(h => h.phase === phaseId);
        const manual = entries.reduce((s, h) => s + (h.phaseManualHours || h.bayManualHours || 0), 0);
        if (manual > 0) return manual.toString();
        const ms = entries.reduce((s, h) => s + (h.duration || (h.exitedAt ? h.exitedAt - h.enteredAt : 0)), 0);
        return (ms / 3600000).toFixed(1);
      };
      
      setShippingHours({
        prefab: getPhaseHours('prefab'),
        build: getPhaseHours('build'),
        paint: getPhaseHours('paint'),
        outsource: getPhaseHours('outsource'),
        trim: getPhaseHours('trim')
      });
      
      setShippingForm(prev => ({
        ...prev,
        customer_name: pendingShippingTrailer.name || prev.customer_name,
        invoice_number: pendingShippingTrailer.invoiceNumber || prev.invoice_number,
        vin_date: pendingShippingTrailer.vinDate || prev.vin_date,
        sale_price: '' // trailer table doesn't have sale_price
      }));
    }
  }, [pendingShippingTrailer]);

  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const navigate = useNavigate();
  const mainContentRef = useRef<HTMLDivElement>(null);

  const scrollBoard = (direction: 'left' | 'right') => {
    if (mainContentRef.current) {
      const amount = 400;
      mainContentRef.current.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
    }
  };

  const handleShipSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingShippingTrailer || isShipping) return;
    
    setIsShipping(true);
    try {
      const fileToBase64 = (file: File | null): Promise<string | undefined> => {
        return new Promise((resolve) => {
          if (!file) return resolve(undefined);
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = (e) => {
            const img = new window.Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;
              const max = 1200;
              if (width > height && width > max) { height *= max / width; width = max; }
              else if (height > max) { width *= max / height; height = max; }
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx?.drawImage(img, 0, 0, width, height);
              resolve(canvas.toDataURL('image/jpeg', 0.6));
            };
            img.src = e.target?.result as string;
          };
          reader.onerror = () => resolve(undefined);
        });
      };

      const [u1, u2, u3] = await Promise.all([
        fileToBase64(shippingPhotos.p1),
        fileToBase64(shippingPhotos.p2),
        fileToBase64(shippingPhotos.p3)
      ]);

      // Fallback to production photos if shipping photos aren't provided
      const p1 = u1 || pendingShippingTrailer.photo_1_url;
      const p2 = u2 || pendingShippingTrailer.photo_2_url;
      const p3 = u3 || pendingShippingTrailer.photo_3_url;

      const getH = (key: string) => parseFloat(shippingHours[key]) || 0;
      const hours = { prefab: getH('prefab'), build: getH('build'), paint: getH('paint'), outsource: getH('outsource'), trim: getH('trim') };
      const total_h = parseFloat(Object.values(hours).reduce((a, b) => a + b, 0).toFixed(1));

      const shippedRecord: ShippedTrailer = {
        serial_number: pendingShippingTrailer.serialNumber,
        trailer_name: pendingShippingTrailer.model,
        customer_name: shippingForm.customer_name,
        invoice_number: shippingForm.invoice_number,
        vin_date: shippingForm.vin_date,
        shipped_at: new Date().toISOString(),
        total_hours: total_h,
        prefab_hours: hours.prefab,
        build_hours: hours.build,
        paint_hours: hours.paint,
        outsource_hours: hours.outsource,
        trim_hours: hours.trim,
        photo_1_url: p1,
        photo_2_url: p2,
        photo_3_url: p3,
        sale_price: parseFloat(shippingForm.sale_price) || 0
      };

      await onSaveShippedRecord(shippedRecord);
      await updateTrailer(pendingShippingTrailer.id, {
        invoiceNumber: shippingForm.invoice_number,
        vinDate: shippingForm.vin_date,
        isArchived: true,
        archivedAt: Date.now()
      });

      setPendingShippingTrailer(null);
      setShippingPhotos({ p1: null, p2: null, p3: null });
      setShippingForm({ invoice_number: '', vin_date: '', customer_name: '', sale_price: '', dealer_price: '', cost_price: '' });
      setShippingHours({ prefab: '0', build: '0', paint: '0', outsource: '0', trim: '0' });
    } catch (err) {
      console.error(err);
      alert('Failed to complete shipment.');
    } finally {
      setIsShipping(false);
    }
  };

  const [isAdding, setIsAdding] = useState(false);
  const [newTrailerData, setNewTrailerData] = useState({
    serialNumber: '',
    name: '', 
    model: '', 
    station: 'None' as StationId, 
    isPriority: false,
    promisedShippingDate: ''
  });

  const handleAddTrailer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrailerData.model) return;
    setIsAdding(true);
    try {
      const newTrailer: Trailer = {
        id: crypto.randomUUID(),
        name: newTrailerData.name || '---',
        model: newTrailerData.model,
        serialNumber: newTrailerData.serialNumber || `UNIT-${Math.floor(10000 + Math.random() * 90000)}`,
        station: 'None',
        isPriority: newTrailerData.isPriority,
        dateStarted: Date.now(),
        currentPhase: 'backlog',
        history: [{ phase: 'backlog', enteredAt: Date.now() }],
        promisedShippingDate: newTrailerData.promisedShippingDate
      };
      await addTrailer(newTrailer);
      setIsAddModalOpen(false);
      setNewTrailerData({ serialNumber: '', name: '', model: '', station: 'None', isPriority: false, promisedShippingDate: '' });
    } finally { setIsAdding(false); }
  };

  const getPhaseWorkload = (phaseId: PhaseId) => {
    if (phaseId === 'shipping') return { stage: 0, pipeline: 0 };
    return trailers.filter(t => t.currentPhase === phaseId && !t.isArchived).reduce((acc, t) => {
      const target = (localTargetHours[t.model]?.[phaseId] || PHASE_METADATA[phaseId]?.defaultTargetHours || 0);
      const curLog = t.history.find(h => h.phase === t.currentPhase && !h.exitedAt);
      const stageRem = Math.max(0, target - (curLog?.bayManualHours || curLog?.phaseManualHours || 0));
      let pipeRem = stageRem;
      const pIdx = PHASES.findIndex(p => p.id === phaseId);
      if (pIdx !== -1) {
        PHASES.slice(pIdx + 1).forEach(fp => {
          if (fp.id !== 'shipping' && fp.id !== 'backlog') {
            if (t.finishingType === 'Outsource' && fp.id === 'paint') return;
            if (t.finishingType === 'Paint' && fp.id === 'outsource') return;
            pipeRem += (localTargetHours[t.model]?.[fp.id] || PHASE_METADATA[fp.id].defaultTargetHours);
          }
        });
      }
      return { stage: acc.stage + stageRem, pipeline: acc.pipeline + pipeRem };
    }, { stage: 0, pipeline: 0 });
  };

  const activeTrailer = activeId ? trailers.find(t => t.id === activeId) : null;

  return (
    <div className="app-container">
      <header className="main-header">
        <div className="header-left">
          <Link to="/" className="header-logo-link">
            <img src={logo} alt="Lane Trailers" className="header-logo-img" style={{ height: '36px', filter: 'drop-shadow(0 0 8px rgba(59, 130, 246, 0.3))' }} />
          </Link>
          <div className="header-divider" />
          <div className="header-clock-section">
            <div className="header-date">{format(currentTime, 'EEE, MMM d')}</div>
            <div className="header-time-live">{format(currentTime, 'hh:mm:ss a')}</div>
          </div>
          
          <div className="header-search-container mobile-search-inline" style={{ background: 'var(--glass-bg)', border: '1px solid var(--border-default)', borderRadius: '12px' }}>
            <Search size={14} color="var(--text-muted)" />
            <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', width: '100%' }} />
          </div>

          {/* DESKTOP ONLY NAV SCROLL */}
          <div className="header-nav-scroll hide-on-mobile" style={{ marginLeft: '1rem' }}>
            <button className="btn btn-secondary btn-icon" onClick={() => scrollBoard('left')} style={{ borderRadius: '10px' }}>
              <ChevronLeft size={18} />
            </button>
            <button className="btn btn-secondary btn-icon" onClick={() => scrollBoard('right')} style={{ borderRadius: '10px' }}>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="header-right hide-on-mobile">
          <button
            className="btn btn-secondary btn-icon"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            title="Undo last move"
            style={{ borderRadius: '10px', opacity: undoStack.length === 0 ? 0.4 : 1 }}
          >
            <Undo2 size={16} />
          </button>
          <button
            className="btn btn-secondary btn-icon"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            title="Redo"
            style={{ borderRadius: '10px', opacity: redoStack.length === 0 ? 0.4 : 1 }}
          >
            <Redo2 size={16} />
          </button>
          
          <button className="btn btn-secondary" onClick={() => navigate('/stations')}>
            <MapPin size={14} /> <span className="btn-text">Bays</span>
          </button>
          <button className="btn btn-secondary nav-tv-btn" onClick={() => navigate('/tv')}>
            <Tv size={14} /> <span className="btn-text">TV Mode</span>
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/catalog')}>
            <BookOpen size={14} /> <span className="btn-text">Catalog</span>
          </button>
          <button className="btn btn-primary register-btn" onClick={() => setIsAddModalOpen(true)}>
            <Plus size={14} /> <span className="btn-text">Register Unit</span>
          </button>
          
          <div className="header-divider" />

          <button 
            className="btn btn-secondary btn-icon theme-toggle" 
            onClick={onToggleTheme}
            style={{ borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-default)' }}
          >
            {theme === 'light' ? <Moon size={18} color="#475569" /> : <Sun size={18} color="#fbbf24" />}
          </button>
          
          <button className="btn btn-secondary" onClick={() => navigate('/schedule')}>
             <Calendar size={14} /> <span className="btn-text">Timeline</span>
          </button>
          
          <button className="btn btn-secondary" onClick={() => navigate('/backlog')}>
             <Plus size={14} /> <span className="btn-text">Backlog</span>
          </button>
          
          <div className="header-divider" />
          
          <button className="btn btn-secondary btn-icon archive-btn shimmer" title="Production Archive" onClick={() => navigate('/archive')} style={{ background: 'var(--accent-gradient)', border: 'none', color: 'white' }}>
            <Archive size={18} />
          </button>
        </div>

        {/* MOBILE ONLY NAV (Restored buttons) */}
        <div className="header-right show-on-mobile-only" style={{ display: 'none' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/stations')}>
            <MapPin size={14} /> <span className="btn-text">Bays</span>
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/catalog')}>
            <BookOpen size={14} /> <span className="btn-text">Catalog</span>
          </button>
          <button className="btn btn-primary register-btn" onClick={() => setIsAddModalOpen(true)}>
            <Plus size={14} /> <span className="btn-text">Register</span>
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/schedule')}>
             <Calendar size={14} /> <span className="btn-text">Timeline</span>
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/backlog')}>
             <Plus size={14} /> <span className="btn-text">Backlog</span>
          </button>
          <button 
            className="btn btn-secondary btn-icon theme-toggle" 
            onClick={onToggleTheme}
            style={{ borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-default)' }}
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </div>
      </header>

      <main className="main-content" ref={mainContentRef}>
        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          {PHASES.map((phase) => (
            <KanbanColumn 
              key={phase.id} 
              id={phase.id} 
              title={phase.title} 
              trailers={filteredTrailers.filter(t => t.currentPhase === phase.id)} 
              onUpdateTrailer={updateTrailer} 
              onShipRequest={(t) => {
                if (t.vinDate && t.invoiceNumber) {
                  updateTrailer(t.id, { isArchived: true, archivedAt: Date.now() });
                } else {
                  setPendingShippingTrailer(t);
                }
              }}
              onCardClick={(t) => setSelectedTrailerId(t.id)}
              workload={getPhaseWorkload(phase.id)}
              highlightedId={highlightedTrailerId}
              suggestedBay={suggestedBay}
              localTargetHours={localTargetHours}
              userRole={userRole}
            />
          ))}
          <DragOverlay>
            {activeTrailer ? <TrailerCard trailer={activeTrailer} localTargetHours={localTargetHours} isOverlay userRole={userRole} /> : null}
          </DragOverlay>
        </DndContext>
      </main>

      <div className="pipeline-workload-strip">
        <div className="strip-items-container">
          <Clock size={16} style={{ color: '#fbbf24', flexShrink: 0 }} />
          
          <div className="strip-item">
            <span className="strip-label desktop-label">WORKLOAD REMAINING:</span>
            <span className="strip-label mobile-label">WORKLOAD:</span>
            <span className="strip-value highlight">{Math.round(totalWorkRemaining)}h</span>
          </div>

          <div className="strip-divider" />

          <div className="strip-item">
            <span className="strip-label desktop-label">PRODUCTION RUNWAY:</span>
            <span className="strip-label mobile-label">RUNWAY:</span>
            <span className="strip-value">~{runwayWeeks < 1 ? '<1' : Math.round(runwayWeeks)}w</span>
          </div>

          <div className="strip-divider" />

          <div className="strip-item">
            <span className="strip-label desktop-label">TOTAL PIPELINE UNITS:</span>
            <span className="strip-label mobile-label">UNITS:</span>
            <span className="strip-value">{trailers.filter(t => !t.isArchived).length}</span>
          </div>
        </div>
      </div>

      <footer className="dashboard-footer">
        <div className="footer-legend">
          <span><span className="dot delay">●</span> Bottleneck Delay</span>
          <span><Crown size={12} className="priority-icon" /> High Priority</span>
        </div>
        <span style={{ flex: 1 }}></span>
        <button className="btn btn-secondary stats-btn" onClick={() => setIsStatsModalOpen(true)}>
          <BarChart3 size={14} /> Production Stats
        </button>
      </footer>

      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Quick Unit Registration">
        <form onSubmit={handleAddTrailer}>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginTop: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Promised Shipping Date</label>
              <input type="date" className="form-input" value={newTrailerData.promisedShippingDate} onChange={e => setNewTrailerData({...newTrailerData, promisedShippingDate: e.target.value})} />
            </div>
          </div>
          
          <div className="form-group priority-checkbox-container" style={{ 
            marginTop: '1rem', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.75rem', 
            padding: '0.85rem', 
            borderRadius: '12px', 
            border: '1px solid var(--priority-border)',
            background: 'var(--priority-bg)'
          }}>
            <input 
              type="checkbox" 
              id="quick-priority" 
              checked={newTrailerData.isPriority} 
              onChange={e => setNewTrailerData({...newTrailerData, isPriority: e.target.checked})}
              style={{ width: '20px', height: '20px' }}
            />
            <label htmlFor="quick-priority" className="pointer" style={{ color: 'var(--text-primary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Crown size={16} color="#ef4444" /> HIGH PRIORITY UNIT
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={isAdding || !newTrailerData.name || !newTrailerData.serialNumber || trailers.some(t => t.serialNumber === newTrailerData.serialNumber)}
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

      {selectedTrailer && (
        <TrailerDetailsModal 
          trailer={selectedTrailer} 
          isOpen={true} 
          onClose={() => setSelectedTrailerId(null)} 
          onUpdate={updateTrailer} 
          allTrailers={trailers}
          localTargetHours={localTargetHours}
          onDeleteTrailer={(id) => {
            onDeleteTrailer(id);
            setSelectedTrailerId(null);
          }}
          shippedTrailers={shippedTrailers}
          userRole={userRole}
        />
      )}
      
      <Modal isOpen={!!pendingShippingTrailer} onClose={() => setPendingShippingTrailer(null)} title={`Shipment Checklist: ${pendingShippingTrailer?.serialNumber}`}>
        <form onSubmit={handleShipSubmit} style={{ opacity: isShipping ? 0.7 : 1, pointerEvents: isShipping ? 'none' : 'all' }}>
          
          <div style={{ padding: '1.25rem', background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--border-default)', marginBottom: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.65rem' }}>Invoice Number</label>
                <input required className="form-input" placeholder="INV-0000"
                  value={shippingForm.invoice_number}
                  onChange={e => setShippingForm(prev => ({ ...prev, invoice_number: e.target.value }))}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.65rem' }}>VIN Date</label>
                <input required type="date" className="form-input"
                  value={shippingForm.vin_date}
                  onChange={e => setShippingForm(prev => ({ ...prev, vin_date: e.target.value }))}
                />
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2', margin: 0, marginTop: '1rem' }}>
                <label className="form-label" style={{ fontSize: '0.65rem' }}>Customer Name</label>
                <input required className="form-input" placeholder="e.g. Acme Logistics"
                  value={shippingForm.customer_name}
                  onChange={e => setShippingForm(prev => ({ ...prev, customer_name: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <div style={{ padding: '1.25rem', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '16px', border: '1px solid rgba(59, 130, 246, 0.2)', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
              <Clock size={16} color="var(--accent)" />
              <span style={{ fontSize: '0.75rem', fontWeight: 900, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Production Hours Verification</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
              {['prefab', 'build', 'paint', 'outsource', 'trim'].map(phase => (
                <div key={phase} className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.6rem', opacity: 0.8 }}>{phase}</label>
                  <input 
                    type="number" 
                    step="0.1"
                    className="form-input" 
                    style={{ padding: '0.5rem', textAlign: 'center' }}
                    value={shippingHours[phase]}
                    onChange={e => setShippingHours(prev => ({ ...prev, [phase]: e.target.value }))}
                  />
                </div>
              ))}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.55rem', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase' }}>Total</span>
                <span style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                  {Object.values(shippingHours).reduce((a, b) => a + (parseFloat(b) || 0), 0).toFixed(1)}
                </span>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label className="form-label">Shipping Documentation Photos</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
              {(['p1', 'p2', 'p3'] as const).map(slot => (
                <div key={slot}>
                  {shippingPhotos[slot] ? (
                    <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '2px solid var(--accent)' }}>
                      <img src={URL.createObjectURL(shippingPhotos[slot]!)} alt="" style={{ width: '100%', height: '80px', objectFit: 'cover', display: 'block' }} />
                      <button type="button" onClick={() => setShippingPhotos(prev => ({ ...prev, [slot]: null }))} style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '50%', color: 'white', width: '24px', height: '24px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>✕</button>
                    </div>
                  ) : (
                    <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '2px dashed var(--border-default)', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700, gap: '6px', transition: 'all 0.2s' }} className="hover-shimmer">
                      <ImageIcon size={18} color="var(--text-muted)" /> 
                      <span>Upload</span>
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) setShippingPhotos(prev => ({ ...prev, [slot]: f })); }} />
                    </label>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: '1.25rem', background: 'rgba(217, 119, 6, 0.05)', borderRadius: '16px', border: '1px solid rgba(217, 119, 6, 0.2)', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
              <DollarSign size={16} color="#d97706" />
              <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Financial Settlement (Private)</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '1rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ color: '#d97706', fontSize: '0.65rem' }}>Final Sale Price ($)</label>
                <input type="number" className="form-input" style={{ borderColor: 'rgba(217, 119, 6, 0.3)', background: 'rgba(217, 119, 6, 0.05)' }} placeholder="0.00"
                  value={shippingForm.sale_price}
                  onChange={e => setShippingForm(prev => ({ ...prev, sale_price: e.target.value }))}
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ color: '#d97706', fontSize: '0.65rem', opacity: 0.6 }}>Dealer Ref</label>
                <input type="number" disabled className="form-input" style={{ opacity: 0.3 }} placeholder="---" />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ color: '#d97706', fontSize: '0.65rem', opacity: 0.6 }}>Base Cost</label>
                <input type="number" disabled className="form-input" style={{ opacity: 0.3 }} placeholder="---" />
              </div>
            </div>
          </div>

          <div className="form-footer">
            {!isShipping && (
              <button type="button" className="btn btn-secondary" onClick={() => setPendingShippingTrailer(null)}>Cancel</button>
            )}
            <button type="submit" className="btn btn-primary" disabled={isShipping} style={{ padding: '0.75rem 2rem', minWidth: '200px' }}>
              {isShipping ? 'Processing Shipment...' : 'Complete Shipment Checklist'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isStatsModalOpen} onClose={() => setIsStatsModalOpen(false)} title="Production Analytics Dashboard">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', padding: '1rem 0' }}>
          <div>
            <h4 style={{ fontSize: '0.8rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>Active Phase Distribution</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {PHASES.map(phase => {
                const count = trailers.filter(t => !t.isArchived && t.currentPhase === phase.id).length;
                const percentage = trailers.filter(t => !t.isArchived).length > 0 ? (count / trailers.filter(t => !t.isArchived).length) * 100 : 0;
                return (
                  <div key={phase.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '100px', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)' }}>{phase.title}</div>
                    <div style={{ flex: 1, height: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-default)' }}>
                      <div style={{ width: `${percentage}%`, height: '100%', background: 'var(--accent-gradient)', borderRadius: '6px' }} />
                    </div>
                    <div style={{ width: '40px', textAlign: 'right', fontSize: '0.9rem', fontWeight: 900, color: 'var(--text-primary)' }}>{count}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ height: '1px', background: '#f1f5f9' }} />

          <div>
            <h4 style={{ fontSize: '0.8rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>Model Volume (All Units)</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
              {Array.from(new Set(trailers.map(t => t.model))).map(model => {
                const count = trailers.filter(t => t.model === model).length;
                return (
                  <div key={model} style={{ padding: '1rem', background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="hover-lift">
                    <span style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.85rem' }}>{model}</span>
                    <span style={{ background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.6rem', borderRadius: '8px', fontWeight: 900, fontSize: '0.8rem', color: 'var(--accent)' }}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ height: '1px', background: '#f1f5f9' }} />

          <div style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '1.5rem', borderRadius: '24px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
            <h4 style={{ fontSize: '0.8rem', fontWeight: 900, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1.25rem' }}>Factory Performance Analytics</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{trailers.filter(t => t.isArchived).length}</div>
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Units Shipped YTD</div>
              </div>
              <div>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: '#10b981', letterSpacing: '-0.02em' }}>
                  {(() => {
                    const archived = trailers.filter(t => t.isArchived && t.archivedAt);
                    if (archived.length === 0) return '---';
                    const avgMs = archived.reduce((acc, t) => acc + ((t.archivedAt || 0) - t.dateStarted), 0) / archived.length;
                    const days = Math.round(avgMs / (1000 * 60 * 60 * 24));
                    return `${days} Days`;
                  })()}
                </div>
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Avg Build Velocity</div>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function AuthGate({ children }: { children: (role: UserRole) => React.ReactNode }) {
  const [auth, setAuth] = useState<{ isAuthenticated: boolean; role: UserRole | null }>(() => {
    const isAuthed = localStorage.getItem('lane-trailers-auth') === 'true';
    const role = localStorage.getItem('lane-trailers-role') as UserRole;
    return { isAuthenticated: isAuthed, role: isAuthed ? role : null };
  });
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  
  const ROLES_CONFIG: Record<string, UserRole> = {
    '1234': 'manager',
    '5678': 'worker'
  };

  const handlePinEntry = (digit: string) => {
    setError(false);
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      if (newPin.length === 4) {
        const assignedRole = ROLES_CONFIG[newPin];
        if (assignedRole) {
          localStorage.setItem('lane-trailers-auth', 'true');
          localStorage.setItem('lane-trailers-role', assignedRole);
          setAuth({ isAuthenticated: true, role: assignedRole });
        } else {
          setError(true);
          setTimeout(() => setPin(''), 500);
        }
      }
    }
  };

  if (auth.isAuthenticated && auth.role) return <>{children(auth.role)}</>;

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
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingModelName, setEditingModelName] = useState<string | null>(null);
  const [modelFormData, setModelFormData] = useState<Record<PhaseId, number> | null>(null);
  const [modelSpecData, setModelSpecData] = useState<{ steelWeight: string; axles: string }>({ steelWeight: '', axles: '' });
  // Undo/Redo stacks
  const [undoStack, setUndoStack] = useState<Array<Array<{ id: string } & Partial<Trailer>>>>([]);
  const [redoStack, setRedoStack] = useState<Array<Array<{ id: string } & Partial<Trailer>>>>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: isMobile ? 10000 : 3,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        distance: isMobile ? 10000 : 8,
      },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );



  const [bayCapacities, setBayCapacities] = useState<Record<StationId, number>>({
    'B1': 40,
    'B2': 80,
    'B3': 80,
    'B4': 40,
    'None': 0
  });

  const [catalogModels, setCatalogModels] = useState<CatalogModel[]>([]);
  const [shippedTrailers, setShippedTrailers] = useState<ShippedTrailer[]>([]);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('lane-trailers-theme');
    return (saved as 'light' | 'dark') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('lane-trailers-theme', theme);
  }, [theme]);

  const localTargetHours = useMemo(() => {
    const hours: Record<string, Record<PhaseId, number>> = { ...MODEL_TARGET_HOURS };
    catalogModels.forEach(m => {
      hours[m.name] = m.target_hours;
    });
    return hours;
  }, [catalogModels]);

  // Dynamically merge static categories with any new models stored in Supabase
  const localModelCategories = useMemo(() => {
    const merged = staticModelCategories.map(cat => ({ ...cat, models: [...cat.models] }));
    catalogModels.forEach(m => {
      const existingCat = merged.find(c => c.name === m.category);
      if (existingCat) {
        if (!existingCat.models.includes(m.name)) {
          existingCat.models.push(m.name);
        }
      } else {
        merged.push({ name: m.category, models: [m.name] });
      }
    });
    return merged;
  }, [catalogModels]);

  const filteredTrailers = useMemo(() => {
    const seen = new Set<string>();
    const unique = trailers.filter(t => {
      if (!t.id || seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });

    return unique.filter(t => !t.isArchived && (
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      t.serialNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.model.toLowerCase().includes(searchQuery.toLowerCase())
    ));
  }, [trailers, searchQuery]);



  const nextSuggestedSerial = useMemo(() => {
    if (trailers.length === 0) return '';
    
    const sorted = [...trailers].sort((a, b) => b.dateStarted - a.dateStarted);

    for (const t of sorted) {
      const match = t.serialNumber.match(/^(.*?)([0-9]+)$/);
      if (match) {
        const prefix = match[1];
        const numStr = match[2];
        let nextNum = parseInt(numStr, 10) + 1;
        
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

  const fetchInitialData = useCallback(async () => {
    setLoading(true);
    try {
      const [trailersRes, bayRes, modelsRes, shippedRes] = await Promise.all([
        supabase.from('trailers').select('*'),
        supabase.from('bay_settings').select('*'),
        supabase.from('production_models').select('*'),
        supabase.from('shipped_trailers').select('*').order('shipped_at', { ascending: false })
      ]);
      
      if (trailersRes.data) {
        // De-duplicate items by ID just in case
        const uniqueTrailers = trailersRes.data.filter((t, index, self) => 
          index === self.findIndex((u) => u.id === t.id)
        );
        // Local sort: vertical_order ASC, then dateStarted DESC fallback
        const sorted = [...uniqueTrailers].sort((a, b) => {
          if (a.vertical_order !== undefined && b.vertical_order !== undefined) {
            return a.vertical_order - b.vertical_order;
          }
          return (b.dateStarted || 0) - (a.dateStarted || 0);
        });
        setTrailers(sorted);
      }
      if (modelsRes.data) setCatalogModels(modelsRes.data);
      if (shippedRes.data) setShippedTrailers(shippedRes.data);
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
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }, [setLoading, setTrailers, setCatalogModels, setShippedTrailers, setBayCapacities]);

  useEffect(() => {
    fetchInitialData();

    // Subscribe to trailer changes
    const trailerChannel = supabase
      .channel('trailers-changes')
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'trailers' },
        (payload: any) => {
          // Guard: Don't let real-time updates overwrite the trailer we are currently dragging
          // This prevents the "blurred" card from jumping or resetting during sync
          if (activeIdRef.current === payload.new?.id || activeIdRef.current === payload.old?.id) {
            return;
          }

          if (payload.eventType === 'INSERT') {
            setTrailers(prev => {
              const exists = prev.some(t => t.id === payload.new.id);
              if (exists) return prev;
              return [payload.new as Trailer, ...prev];
            });
          } else if (payload.eventType === 'UPDATE') {
            setTrailers(prev => {
              const updated = prev.map(t => t.id === payload.new.id ? { ...t, ...payload.new } as Trailer : t);
              // Re-sort after any update as vertical_order or currentPhase might have changed
              return [...updated].sort((a, b) => (a.vertical_order ?? 0) - (b.vertical_order ?? 0));
            });
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

    const modelChannel = supabase
      .channel('production-models-changes')
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'production_models' },
        (payload: any) => {
          if (payload.eventType === 'INSERT') {
            setCatalogModels(prev => prev.find(m => m.id === payload.new.id) ? prev : [...prev, payload.new as CatalogModel]);
          } else if (payload.eventType === 'UPDATE') {
            setCatalogModels(prev => prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m));
          } else if (payload.eventType === 'DELETE') {
            setCatalogModels(prev => prev.filter(m => m.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(trailerChannel);
      supabase.removeChannel(capChannel);
      supabase.removeChannel(modelChannel);
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
      fetchInitialData();
    }
  };

  const deleteTrailer = async (id: string) => {
    setTrailers(prev => prev.filter(t => t.id !== id));
    const { error } = await supabase.from('trailers').delete().eq('id', id);
    if (error) console.error('Error deleting trailer:', error);
  };

  const handleAddModel = async (data: { name: string, category: string, hours: Record<PhaseId, number>, spec: ModelSpec }) => {
    const newModel: CatalogModel = {
      id: Math.random().toString(36).substr(2, 9),
      name: data.name,
      category: data.category,
      target_hours: data.hours,
      specs: data.spec
    };

    setCatalogModels(prev => [...prev, newModel]);

    const { error } = await supabase
      .from('production_models')
      .upsert(newModel);
      
    if (error) console.error('Error adding model to catalog:', error);
  };

  const handleEditModel = (name: string, spec: { targetHours: Record<PhaseId, number> }) => {
    setEditingModelName(name);
    setModelFormData(spec.targetHours);
    // Pre-populate steel weight and axles from existing catalogModels entry
    const existing = catalogModels.find(m => m.name === name);
    setModelSpecData({
      steelWeight: existing?.specs?.steelWeight || '',
      axles: existing?.specs?.axles || '',
    });
  };

  const handleDeleteModel = async (name: string) => {
    const modelToDelete = catalogModels.find(m => m.name === name);
    if (!modelToDelete) return;

    setCatalogModels(prev => prev.filter(m => m.id !== modelToDelete.id));
    const { error } = await supabase.from('production_models').delete().eq('id', modelToDelete.id);
    if (error) console.error('Error deleting model from catalog:', error);
  };

  const handleSaveModelSpecs = async () => {
    if (!editingModelName || !modelFormData) return;
    
    const existingModel = catalogModels.find(m => m.name === editingModelName);
    if (existingModel) {
      const updatedModel = { ...existingModel, target_hours: modelFormData, specs: { ...existingModel.specs, steelWeight: modelSpecData.steelWeight, axles: modelSpecData.axles } };
      setCatalogModels(prev => prev.map(m => m.name === editingModelName ? updatedModel : m));
      
      const { error } = await supabase
        .from('production_models')
        .upsert(updatedModel);
      if (error) console.error('Error updating model specs:', error);
    } else {
      // If it is a hardcoded model being edited for the first time, we need to create it in DB
      const newModel: CatalogModel = {
        id: Math.random().toString(36).substr(2, 9),
        name: editingModelName,
        category: localModelCategories.find(c => c.models.includes(editingModelName))?.name || 'Uncategorized',
        target_hours: modelFormData,
        specs: { steelWeight: modelSpecData.steelWeight, axles: modelSpecData.axles }
      };
      setCatalogModels(prev => [...prev, newModel]);
      await supabase.from('production_models').upsert(newModel);
    }
    setEditingModelName(null);
  };

  const addTrailer = async (newTrailer: Trailer) => {
    // Optimistic update
    setTrailers(prev => [newTrailer, ...prev]);

    const { error } = await supabase
      .from('trailers')
      .insert([newTrailer]);
    
    if (error) {
      alert("Error adding trailer: " + error.message);
      // Rollback on error
      setTrailers(prev => prev.filter(t => t.id !== newTrailer.id));
    }
  };
  
  // Global workload calculation moved to App level for prop passing
  const totalWorkRemaining = useMemo(() => {
    return trailers
      .filter(t => !t.isArchived && t.currentPhase !== 'shipping')
      .reduce((acc, t) => acc + calculateTrailerRemainingHours(t, localTargetHours), 0);
  }, [trailers, localTargetHours]);

  const totalShopCapacity = useMemo(() => {
    return Object.values(bayCapacities).reduce((sum, h) => sum + (h || 0), 0);
  }, [bayCapacities]);

  const runwayWeeks = useMemo(() => {
    if (totalShopCapacity === 0) return 0;
    return totalWorkRemaining / totalShopCapacity;
  }, [totalWorkRemaining, totalShopCapacity]);

  // Stable reference for trailers to avoid stale closures in async DnD handlers
  const trailersRef = useRef(trailers);
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    trailersRef.current = trailers;
  }, [trailers]);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);



  const handleUndo = async () => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      const snapshot = prev[prev.length - 1];
      const nextStack = prev.slice(0, -1);

      // Save current state to redo stack before restoring
      const redoSnapshot = trailersRef.current
        .filter(t => snapshot.some(s => s.id === t.id))
        .map(t => ({
          id: t.id,
          currentPhase: t.currentPhase,
          vertical_order: t.vertical_order,
          history: t.history,
          dateStarted: t.dateStarted,
        }));
      setRedoStack(rPrev => [...rPrev, redoSnapshot]);

      // Restore local state
      setTrailers(current =>
        current.map(t => {
          const snap = snapshot.find(s => s.id === t.id);
          return snap ? { ...t, ...snap } : t;
        })
      );

      // Persist rollback to DB
      Promise.all(
        snapshot.map(snap =>
          supabase.from('trailers').update({
            currentPhase: snap.currentPhase,
            history: snap.history,
            dateStarted: snap.dateStarted,
            vertical_order: snap.vertical_order,
          }).eq('id', snap.id)
        )
      ).catch(err => console.error('Undo sync error:', err));

      return nextStack;
    });
  };

  const handleRedo = async () => {
    setRedoStack(prev => {
      if (prev.length === 0) return prev;
      const snapshot = prev[prev.length - 1];
      const nextStack = prev.slice(0, -1);

      // Save current state to undo stack before restoring
      const undoSnapshot = trailersRef.current
        .filter(t => snapshot.some(s => s.id === t.id))
        .map(t => ({
          id: t.id,
          currentPhase: t.currentPhase,
          vertical_order: t.vertical_order,
          history: t.history,
          dateStarted: t.dateStarted,
        }));
      setUndoStack(uPrev => [...uPrev, undoSnapshot]);

      // Restore local state
      setTrailers(current =>
        current.map(t => {
          const snap = snapshot.find(s => s.id === t.id);
          return snap ? { ...t, ...snap } : t;
        })
      );

      // Persist to DB
      Promise.all(
        snapshot.map(snap =>
          supabase.from('trailers').update({
            currentPhase: snap.currentPhase,
            history: snap.history,
            dateStarted: snap.dateStarted,
            vertical_order: snap.vertical_order,
          }).eq('id', snap.id)
        )
      ).catch(err => console.error('Redo sync error:', err));

      return nextStack;
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    const dragId = event.active.id as string;
    setActiveId(dragId);

    // Snapshot at drag START — this is the only point where state is guaranteed to be original.
    // handleDragOver will mutate it before handleDragEnd, so we can't snapshot there.
    const draggedTrailer = trailersRef.current.find(t => t.id === dragId);
    if (draggedTrailer) {
      const snapshot = trailersRef.current
        .filter(t => t.currentPhase === draggedTrailer.currentPhase && !t.isArchived && !t.isDeleted)
        .map(t => ({
          id: t.id,
          currentPhase: t.currentPhase,
          vertical_order: t.vertical_order,
          history: t.history,
          dateStarted: t.dateStarted,
        }));
      // Ensure the dragged trailer is in the snapshot (it always is, but being explicit)
      setUndoStack(prev => [...prev.slice(-19), snapshot]);
      setRedoStack([]); // New action clears redo stack
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;
    
    // Find active trailer from the living state to ensure immediate reaction
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
      setTrailers(prev => {
        const activeIdx = prev.findIndex(t => t.id === activeId);
        if (activeIdx === -1) return prev;
        
        const now = Date.now();
        const updatedHistory = [...prev[activeIdx].history];
        const currentLogIndex = updatedHistory.findIndex(h => h.phase === prev[activeIdx].currentPhase && !h.exitedAt);
        
        if (currentLogIndex !== -1) {
          const prevLog = updatedHistory[currentLogIndex];
          updatedHistory[currentLogIndex] = { ...prevLog, exitedAt: now, duration: now - prevLog.enteredAt };
        }
        updatedHistory.push({ phase: overPhase as PhaseId, enteredAt: now });

        const updatedTrailer = { ...prev[activeIdx], currentPhase: overPhase as PhaseId, history: updatedHistory };
        const newTrailers = [...prev];
        newTrailers[activeIdx] = updatedTrailer;

        // CRITICAL: sync ref immediately so handleDragEnd reads the correct phase.
        // useEffect([trailers]) runs after paint — too late for the DnD event chain.
        trailersRef.current = newTrailers;

        return newTrailers;
      });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    const activeId = active.id as string;
    
    // 1. Immediately clear activeId to prevent "blurred out" state
    setActiveId(null);
    
    // 2. Use the Ref to get the trailers AFTER handleDragOver updates them locally
    const trailer = trailersRef.current.find(t => t.id === activeId);
    
    if (trailer && over) {
      try {
        // Work only with active trailers in the destination PHASE
        // (trailer.currentPhase is already the destination after handleDragOver)
        const overId = over.id as string;
        const currentItems = trailersRef.current;
        // 1. Get trailers in destination phase, SORTED by existing vertical_order
        const phaseTrailers = currentItems
          .filter(t => t.currentPhase === trailer.currentPhase && !t.isArchived && !t.isDeleted)
          .sort((a, b) => (a.vertical_order ?? 0) - (b.vertical_order ?? 0));

        const currentIdx = phaseTrailers.findIndex(t => t.id === activeId);
        const overIsCard = phaseTrailers.some(t => t.id === overId);
        const targetIdx = overIsCard
          ? phaseTrailers.findIndex(t => t.id === overId)
          : phaseTrailers.length - 1;

        if (currentIdx === -1) return;

        // 2. Perform the move and re-assign sequential vertical_order
        const reordered = arrayMove([...phaseTrailers], currentIdx, targetIdx)
          .map((t, idx) => ({ ...t, vertical_order: idx * 1000 }));

        // Instant local update
        // Instant local update with re-sorting
        setTrailers(prev => {
          const updatedList = prev.map(t => {
            const updated = reordered.find(r => r.id === t.id);
            return updated ? updated : t;
          });
          
          // Re-sort the entire list to ensure the UI respects the new vertical_order
          return [...updatedList].sort((a, b) => {
            if (a.currentPhase === b.currentPhase && a.vertical_order !== undefined && b.vertical_order !== undefined) {
              return a.vertical_order - b.vertical_order;
            }
            return 0; // Keep relative order of different phases
          });
        });

        // Persist to DB:
        // - moved trailer: full update (phase, history, dateStarted, vertical_order)
        // - other trailers in phase: vertical_order only
        await Promise.all([
          supabase.from('trailers').update({
            currentPhase: trailer.currentPhase,
            history: trailer.history,
            dateStarted: trailer.dateStarted,
            vertical_order: reordered.find(r => r.id === activeId)?.vertical_order ?? 0,
          }).eq('id', activeId),
          ...reordered
            .filter(t => t.id !== activeId)
            .map(t => supabase.from('trailers').update({ vertical_order: t.vertical_order }).eq('id', t.id))
        ]);

      } catch (err) {
        console.error('DragEnd Execution Error:', err);
      }
    }
  };



  const totalProductionTime = useMemo(() => {
    return trailers
      .filter(t => !t.isArchived && t.currentPhase !== 'shipping')
      .reduce((acc, t) => {
        const curLog = t.history.find(h => h.phase === t.currentPhase && !h.exitedAt);
        const timeInStage = curLog ? (Date.now() - curLog.enteredAt) / (1000 * 60 * 60) : 0;
        return acc + timeInStage;
      }, 0);
  }, [trailers]);

function getSuggestedBay(): StationId {
    const activeUnits = trailers.filter(t => !t.isArchived && t.station !== 'None');
    const bayLoads = STATIONS.reduce((acc, b) => ({ ...acc, [b]: 0 }), {} as Record<StationId, number>);
    
    activeUnits.forEach(t => {
      if (t.station !== 'None') {
        const remaining = calculateTrailerRemainingHours(t, localTargetHours);
        bayLoads[t.station] += remaining;
      }
    });

    const scores = STATIONS.map(b => ({
      id: b,
      load: bayLoads[b] || 0,
      capacity: bayCapacities[b] || 40,
      utilization: (bayLoads[b] || 0) / (bayCapacities[b] || 1)
    }));

    return scores.sort((a, b) => a.utilization - b.utilization)[0]?.id || 'B1';
  }

  const suggestedBay = useMemo(getSuggestedBay, [trailers, bayCapacities, localTargetHours]);

  if (loading) {
    return (
      <div style={{ height: '100vh', width: '100vw', background: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <AuthGate>
      {(userRole) => (
        <>
          <Routes>
            <Route path="/" element={<Dashboard 
              trailers={trailers} 
              updateTrailer={updateTrailer} 
              addTrailer={addTrailer} 
              suggestedBay={suggestedBay} 
              runwayWeeks={runwayWeeks} 
              nextSuggestedSerial={nextSuggestedSerial} 
              localTargetHours={localTargetHours} 
              onDeleteTrailer={deleteTrailer} 
              onSaveShippedRecord={async (rec) => { 
                const { data, error } = await supabase.from('shipped_trailers').upsert([rec]).select().single(); 
                if (error) {
                  console.error('SHIPMENT ERROR:', error);
                } else if (data) {
                  setShippedTrailers(prev => [data, ...prev]); 
                }
              }}
              theme={theme}
              onToggleTheme={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
              sensors={sensors}
              handleDragStart={handleDragStart}
              handleDragOver={handleDragOver}
              handleDragEnd={handleDragEnd}
              activeId={activeId}
              filteredTrailers={filteredTrailers}
              totalWorkRemaining={totalWorkRemaining}
              totalProductionTime={totalProductionTime}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              shippedTrailers={shippedTrailers}
              userRole={userRole}
              undoStack={undoStack}
              handleUndo={handleUndo}
              redoStack={redoStack}
              handleRedo={handleRedo}
            />} />
            <Route path="/backlog" element={<BacklogView trailers={trailers} onAddTrailer={addTrailer} onUpdateTrailer={updateTrailer} suggestedBay={suggestedBay} nextSuggestedSerial={nextSuggestedSerial} localModelCategories={localModelCategories} localTargetHours={localTargetHours} userRole={userRole} />} />
            <Route path="/stations" element={<StationView trailers={trailers} setTrailers={setTrailers} onUpdateTrailer={updateTrailer} bayCapacities={bayCapacities} onUpdateCapacity={updateCapacity} localTargetHours={localTargetHours} userRole={userRole} />} />
            <Route path="/tv" element={<TVView trailers={trailers} localTargetHours={localTargetHours} userRole={userRole} />} />
            <Route path="/tv/station1" element={<TVView trailers={trailers} monitorMode="station1" localTargetHours={localTargetHours} userRole={userRole} />} />
            <Route path="/tv/station2" element={<TVView trailers={trailers} monitorMode="station2" localTargetHours={localTargetHours} userRole={userRole} />} />
            <Route path="/archive" element={<ArchiveView trailers={trailers} onUpdateTrailer={updateTrailer} localTargetHours={localTargetHours} shippedTrailers={shippedTrailers} userRole={userRole} />} />
            <Route path="/schedule" element={<ScheduleView trailers={trailers} />} />
            <Route path="/catalog" element={<CatalogView categories={localModelCategories} hours={localTargetHours} specs={localModelSpecs as any} onAddModel={handleAddModel} onEditModel={handleEditModel} onDeleteModel={handleDeleteModel} userRole={userRole} />} />
          </Routes>

          {/* Quick Model Spec Editor - Only for Managers */}
          {userRole === 'manager' && (
          <Modal isOpen={!!editingModelName} onClose={() => setEditingModelName(null)} title={`Edit: ${editingModelName}`}>
              <div style={{ padding: '1rem' }}>
                <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.5rem' }}>Update target hours and specs for all units of this model.</p>

                {/* Steel Weight + Axles */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div>
                    <label style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Steel Weight</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. 2,450 lbs"
                      value={modelSpecData.steelWeight}
                      onChange={e => setModelSpecData(prev => ({ ...prev, steelWeight: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Axle Config</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Tandem 7k"
                      value={modelSpecData.axles}
                      onChange={e => setModelSpecData(prev => ({ ...prev, axles: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Phase target hours */}
                <label style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', display: 'block', marginBottom: '0.75rem' }}>Target Hours by Phase</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                  {modelFormData && PHASES.filter(p => !['backlog', 'shipping'].includes(p.id)).map(phase => (
                    <div key={phase.id}>
                      <label style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>{phase.title}</label>
                      <input 
                        type="number"
                        className="form-input"
                        value={modelFormData[phase.id] || ''}
                        onChange={e => setModelFormData({ ...modelFormData, [phase.id]: parseInt(e.target.value, 10) || 0 })}
                      />
                    </div>
                  ))}
                </div>
                <button className="btn btn-primary" style={{ width: '100%', padding: '0.75rem', fontWeight: 700 }} onClick={handleSaveModelSpecs}>Save Specifications</button>
              </div>
            </Modal>
          )}
        </>
      )}
    </AuthGate>
  );
}

export default App;
