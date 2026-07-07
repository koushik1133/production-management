import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Routes, Route, useNavigate, Link, useSearchParams, Navigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  MeasuringStrategy,
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
import { dataURLtoFile, uploadFileToSupabase, triggerFileDownload } from './utils/storage';

import { 
  Search, 
  Plus, 
  MapPin,
  Tv,
  Clock,
  Archive,
  Crown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Calendar,
  Image as ImageIcon,
  DollarSign,
  Sun,
  Moon,
  Undo2,
  Redo2,
  Maximize,
  Minimize,
  Settings,
  BarChart2,
  LogOut,
  Eye,
  EyeOff,
  FileText,
  CheckCircle
} from 'lucide-react';

import { 
  PHASES, 
  MODEL_CATEGORIES, 
  MODEL_TARGET_HOURS,
  STATIONS,
  PHASE_METADATA,
  calculateTrailerRemainingHours
} from './types';
import type { Trailer, PhaseId, StationId, ModelSpec, CatalogModel, ShippedTrailer, UserRole, Dealer } from './types';

const staticModelCategories = MODEL_CATEGORIES;


import logo from './assets/lane-logo-v4.png';
import './App.css';

import { supabase } from './lib/supabase';

function Dashboard({ 
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
  handleRedo,
  localModelCategories,
  isPriceUnlockedGlobally,
  onUnlockPrices,
  onLockPrices,
  localSpecSheetTemplates,
  dealers
}: {
  trailers: Trailer[], 
  updateTrailer: (id: string, updates: Partial<Trailer>) => Promise<boolean>,
  addTrailer: (trailer: Trailer) => Promise<void>,
  suggestedBay: StationId,
  runwayWeeks: number,
  nextSuggestedSerial?: string,
  localTargetHours: Record<string, Record<PhaseId, number>>,
  onDeleteTrailer: (id: string) => void,
  onSaveShippedRecord: (record: Omit<ShippedTrailer, 'id'>) => Promise<void>,
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
  handleRedo: () => void,
  localModelCategories: { name: string; models: string[] }[],
  isPriceUnlockedGlobally?: boolean,
  onUnlockPrices?: () => boolean,
  onLockPrices?: () => void,
  localSpecSheetTemplates?: Record<string, string>,
  dealers: { id: string; name: string; addresses?: string[]; common_address?: string; }[]
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
  const [selectedTrailerMode, setSelectedTrailerMode] = useState<'view' | 'edit'>('view');
  const [pendingShippingTrailer, setPendingShippingTrailer] = useState<Trailer | null>(null);
  const [shippingForm, setShippingForm] = useState({ 
    invoice_number: '', 
    vin_date: '',
    customer_name: '',
    sale_price: '',
    dealer_price: '',
    cost_price: '',
    shipped_date: new Date().toISOString().split('T')[0]
  });
  const selectedTrailer = useMemo(() => trailers.find(t => t.id === selectedTrailerId), [trailers, selectedTrailerId]);

  // Reset all shipping form fields and state
  const handleCloseShippingModal = () => {
    setPendingShippingTrailer(null);
    setShippingPhotos({ p1: null, p2: null, p3: null });
    setShippingSpecSheet(null);
    setShippingInspectionSheet(null);
    setShippingHours({ prefab: '0', build: '0', paint: '0', outsource: '0', trim: '0' });
    setShippingForm({ 
      invoice_number: '', 
      vin_date: '', 
      customer_name: '', 
      sale_price: '', 
      dealer_price: '', 
      cost_price: '', 
      shipped_date: new Date().toISOString().split('T')[0] 
    });
  };

  const [shippingPhotos, setShippingPhotos] = useState<{ p1: File | null, p2: File | null, p3: File | null }>({ p1: null, p2: null, p3: null });
  const [shippingSpecSheet, setShippingSpecSheet] = useState<File | null>(null);
  const [shippingInspectionSheet, setShippingInspectionSheet] = useState<File | null>(null);
  const [shippingHours, setShippingHours] = useState<Record<string, string>>({
    prefab: '0', build: '0', paint: '0', outsource: '0', trim: '0'
  });
  const [isShipping, setIsShipping] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // (Form and hours initialization is now handled in onShipRequest below to prevent race conditions)

  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const navigate = useNavigate();
  const mainContentRef = useRef<HTMLDivElement>(null);

  const scrollBoard = (direction: 'left' | 'right' | 'up' | 'down') => {
    if (mainContentRef.current) {
      const amount = 400;
      if (direction === 'up') {
        mainContentRef.current.scrollBy({ top: -amount, behavior: 'smooth' });
      } else if (direction === 'down') {
        mainContentRef.current.scrollBy({ top: amount, behavior: 'smooth' });
      } else {
        mainContentRef.current.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
      }
    }
  };


  const withRetry = async <T,>(fn: () => Promise<T>, retries = 3, delay = 1500): Promise<T> => {
    try {
      return await fn();
    } catch (err: any) {
      if (retries > 0 && (err?.code === '57014' || err?.status === 504 || String(err?.message || '').toLowerCase().includes('timeout') || String(err?.message || '').toLowerCase().includes('fetch'))) {
        console.warn(`Database query timed out/failed. Retrying in ${delay}ms... (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return withRetry(fn, retries - 1, delay * 2);
      }
      throw err;
    }
  };

  const handleShipSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingShippingTrailer || isShipping) return;
    
    setIsShipping(true);
    try {
      const getH = (key: string) => parseFloat(shippingHours[key]) || 0;
      const hours = { prefab: getH('prefab'), build: getH('build'), paint: getH('paint'), outsource: getH('outsource'), trim: getH('trim') };
      const total_h = parseFloat(Object.values(hours).reduce((a, b) => a + b, 0).toFixed(1));

      const serial = pendingShippingTrailer.serialNumber;

      let finalP1 = shippingPhotos.p1;
      let p1 = pendingShippingTrailer.photo_1_url || undefined;
      if (p1 && p1.startsWith('data:')) {
        try {
          const mimeMatch = p1.match(/^data:(image\/[a-z]+);/);
          const ext = mimeMatch ? `.${mimeMatch[1].split('/')[1]}` : '.png';
          finalP1 = dataURLtoFile(p1, `photo_1${ext}`);
        } catch (e) {
          console.error('Failed to convert legacy photo 1:', e);
        }
      }

      let finalP2 = shippingPhotos.p2;
      let p2 = pendingShippingTrailer.photo_2_url || undefined;
      if (p2 && p2.startsWith('data:')) {
        try {
          const mimeMatch = p2.match(/^data:(image\/[a-z]+);/);
          const ext = mimeMatch ? `.${mimeMatch[1].split('/')[1]}` : '.png';
          finalP2 = dataURLtoFile(p2, `photo_2${ext}`);
        } catch (e) {
          console.error('Failed to convert legacy photo 2:', e);
        }
      }

      let finalP3 = shippingPhotos.p3;
      let p3 = pendingShippingTrailer.photo_3_url || undefined;
      if (p3 && p3.startsWith('data:')) {
        try {
          const mimeMatch = p3.match(/^data:(image\/[a-z]+);/);
          const ext = mimeMatch ? `.${mimeMatch[1].split('/')[1]}` : '.png';
          finalP3 = dataURLtoFile(p3, `photo_3${ext}`);
        } catch (e) {
          console.error('Failed to convert legacy photo 3:', e);
        }
      }

      let spec_sheet_file = pendingShippingTrailer.spec_sheet_file || undefined;
      let finalShippingSpecSheet = shippingSpecSheet;
      if (spec_sheet_file && spec_sheet_file.startsWith('data:')) {
        try {
          const fileObj = dataURLtoFile(spec_sheet_file, `${serial}_Final-SpecSheet.xlsx`);
          finalShippingSpecSheet = fileObj;
        } catch (e) {
          console.error('Failed to convert legacy base64 spec sheet:', e);
        }
      }

      let inspection_sheet_file = pendingShippingTrailer.inspection_sheet_file || undefined;
      let finalShippingInspectionSheet = shippingInspectionSheet;
      if (inspection_sheet_file && inspection_sheet_file.startsWith('data:')) {
        try {
          const mimeMatch = inspection_sheet_file.match(/^data:(image\/[a-z]+|application\/pdf);/);
          const mime = mimeMatch ? mimeMatch[1] : 'image/png';
          const ext = mime === 'application/pdf' ? '.pdf' : '.png';
          const fileObj = dataURLtoFile(inspection_sheet_file, `${serial}_InspectionSheet${ext}`);
          finalShippingInspectionSheet = fileObj;
        } catch (e) {
          console.error('Failed to convert legacy base64 inspection sheet:', e);
        }
      }

      // 1. Upload files first through storage to get their true relative paths
      let finalP1Path = pendingShippingTrailer.photo_1_url || undefined;
      if (finalP1) {
        finalP1Path = await uploadFileToSupabase(finalP1, 'photo_1', serial);
      } else if (finalP1Path) {
        finalP1Path = finalP1Path.replace(/^media\//, 'trailers/').replace(/\\/g, '/');
      }

      let finalP2Path = pendingShippingTrailer.photo_2_url || undefined;
      if (finalP2) {
        finalP2Path = await uploadFileToSupabase(finalP2, 'photo_2', serial);
      } else if (finalP2Path) {
        finalP2Path = finalP2Path.replace(/^media\//, 'trailers/').replace(/\\/g, '/');
      }

      let finalP3Path = pendingShippingTrailer.photo_3_url || undefined;
      if (finalP3) {
        finalP3Path = await uploadFileToSupabase(finalP3, 'photo_3', serial);
      } else if (finalP3Path) {
        finalP3Path = finalP3Path.replace(/^media\//, 'trailers/').replace(/\\/g, '/');
      }

      let finalSpecPath = pendingShippingTrailer.spec_sheet_file || undefined;
      if (finalShippingSpecSheet) {
        finalSpecPath = await uploadFileToSupabase(finalShippingSpecSheet, 'spec_sheet', serial);
      } else if (finalSpecPath) {
        if (finalSpecPath.startsWith('blob:')) {
          finalSpecPath = undefined;
        } else {
          finalSpecPath = finalSpecPath.replace(/^media\//, 'trailers/').replace(/\\/g, '/');
        }
      }

      let finalInspectPath = pendingShippingTrailer.inspection_sheet_file || undefined;
      if (finalShippingInspectionSheet) {
        finalInspectPath = await uploadFileToSupabase(finalShippingInspectionSheet, 'inspection_sheet', serial);
      } else if (finalInspectPath) {
        if (finalInspectPath.startsWith('blob:')) {
          finalInspectPath = undefined;
        } else {
          finalInspectPath = finalInspectPath.replace(/^media\//, 'trailers/').replace(/\\/g, '/');
        }
      }

      const shippedRecord: ShippedTrailer = {
        serial_number: pendingShippingTrailer.serialNumber,
        trailer_name: pendingShippingTrailer.model,
        customer_name: shippingForm.customer_name,
        invoice_number: shippingForm.invoice_number,
        vin_date: shippingForm.vin_date,
        shipped_at: shippingForm.shipped_date ? `${shippingForm.shipped_date}T12:00:00Z` : new Date().toISOString(),
        total_hours: total_h,
        prefab_hours: hours.prefab,
        build_hours: hours.build,
        paint_hours: hours.paint,
        outsource_hours: hours.outsource,
        trim_hours: hours.trim,
        photo_1_url: finalP1Path,
        photo_2_url: finalP2Path,
        photo_3_url: finalP3Path,
        sale_price: parseFloat(shippingForm.sale_price) || 0,
        spec_sheet_file: finalSpecPath,
        inspection_sheet_file: finalInspectPath
      };

      // 2. Save shipped trailer metadata in database (with retry support)
      await withRetry(() => onSaveShippedRecord(shippedRecord));

      // 3. Mark the active trailer as archived
      const updateSuccess = await updateTrailer(pendingShippingTrailer.id, {
        invoiceNumber: shippingForm.invoice_number,
        vinDate: shippingForm.vin_date,
        isArchived: true,
        archivedAt: Date.now(),
        photo_1_url: finalP1Path,
        photo_2_url: finalP2Path,
        photo_3_url: finalP3Path,
        spec_sheet_file: finalSpecPath,
        inspection_sheet_file: finalInspectPath
      });

      if (!updateSuccess) {
        throw new Error('Failed to update active trailer record.');
      }

      handleCloseShippingModal();
      triggerToast('Trailer Shipped Successfully!');
    } catch (err: any) {
      console.error(err);
      alert('Failed to complete shipment: ' + (err?.message || JSON.stringify(err)));
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
    promisedShippingDate: '',
    partsStatus: { tyres: false, steel: false, parts: false },
    sale_price: '',
    trailer_color: '',
    trailer_plug: '',
    salesPerson: '',
    dealerLocation: '',
    dealerCommonAddress: ''
  });

  const handleAddTrailer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrailerData.model) return;
    setIsAdding(true);
    try {
      const selectedDealer = dealers.find(d => d.name === newTrailerData.name);
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
        promisedShippingDate: newTrailerData.promisedShippingDate,
        partsStatus: newTrailerData.partsStatus,
        sale_price: newTrailerData.sale_price ? parseFloat(newTrailerData.sale_price) : undefined,
        trailer_color: newTrailerData.trailer_color || undefined,
        trailer_plug: newTrailerData.trailer_plug || undefined,
        salesPerson: newTrailerData.salesPerson || undefined,
        dealerLocation: newTrailerData.dealerLocation || undefined,
        dealerCommonAddress: newTrailerData.dealerCommonAddress || selectedDealer?.common_address || undefined,
        dealerId: selectedDealer?.id || undefined
      };
      await addTrailer(newTrailer);
      setIsAddModalOpen(false);
      setNewTrailerData({ 
        serialNumber: '', 
        name: '', 
        model: '', 
        station: 'None', 
        isPriority: false, 
        promisedShippingDate: '', 
        partsStatus: { tyres: false, steel: false, parts: false }, 
        sale_price: '', 
        trailer_color: '', 
        trailer_plug: '',
        salesPerson: '',
        dealerLocation: '',
        dealerCommonAddress: ''
      });
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
      <header className="main-header" style={{ height: '52px', minHeight: '52px', padding: '0 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'nowrap', overflow: 'hidden', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-header)' }}>
        <div className="header-left-group hide-on-mobile" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
          <Link to="/" className="header-logo-link" style={{ display: 'flex', alignItems: 'center', background: '#000', padding: '3px 8px', borderRadius: '6px' }}>
            <img src={logo} alt="Lane Trailers" className="header-logo-img" style={{ height: '32px' }} />
          </Link>
          
          <div className="header-clock-pill hide-on-mobile" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.2rem 0.6rem', borderRadius: '100px', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', fontSize: '0.75rem' }}>
            <Clock size={12} color="var(--accent)" />
            <span style={{ fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
              {format(currentTime, 'hh:mm')}
              <span className="time-seconds">{format(currentTime, ':ss')}</span>
              {format(currentTime, ' a')}
            </span>
            <span className="header-clock-divider" style={{ color: 'var(--text-muted)', fontSize: '0.6rem' }}>|</span>
            <span className="header-date" style={{ fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{format(currentTime, 'MMM d')}</span>
          </div>

          <div className="scroll-arrows-group hide-on-mobile" style={{ display: 'flex', gap: '0.2rem', marginLeft: '0.25rem' }}>
            <button className="btn btn-secondary btn-icon" onClick={() => scrollBoard('left')} style={{ width: '30px', height: '30px', borderRadius: '6px' }}><ChevronLeft size={12} /></button>
            <button className="btn btn-secondary btn-icon" onClick={() => scrollBoard('right')} style={{ width: '30px', height: '30px', borderRadius: '6px' }}><ChevronRight size={12} /></button>
          </div>
        </div>

        <div className="header-center-group hide-on-mobile" style={{ flex: '1 1 auto', display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: '100px', justifyContent: 'center' }}>
          <div className="header-search-container" style={{ 
            background: 'var(--glass-bg)', 
            border: '1px solid var(--border-default)', 
            borderRadius: '8px', 
            padding: '0.35rem 0.6rem', 
            width: '100%', 
            maxWidth: '240px', 
            minWidth: '80px',
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.4rem',
            transition: 'all 0.2s ease'
          }}>
            <Search size={12} color="var(--text-muted)" />
            <input 
              type="text" 
              placeholder="Search..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', width: '100%', fontSize: '0.8rem' }} 
            />
          </div>
        </div>

        <div className="header-right-group hide-on-mobile" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
          <div className="nav-box hide-on-mobile" style={{ 
            display: 'flex', 
            gap: '0.15rem', 
            background: 'var(--bg-secondary)', 
            padding: '0.2rem', 
            borderRadius: '10px', 
            border: '1px solid var(--border-default)',
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)',
            alignItems: 'center'
          }}>
            {userRole === 'manager' && (
              <button className="btn btn-secondary" onClick={() => navigate('/catalog')} style={{ height: '28px', padding: '0 0.5rem', fontSize: '0.75rem', borderRadius: '6px', border: 'none', background: 'transparent' }}>
                <BookOpen size={12} /> <span className="btn-text">Catalog</span>
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => navigate('/schedule')} style={{ height: '28px', padding: '0 0.5rem', fontSize: '0.75rem', borderRadius: '6px', border: 'none', background: 'transparent' }}>
              <Calendar size={12} /> <span className="btn-text">Timeline</span>
            </button>
            <button className="btn btn-secondary nav-tv-btn" onClick={() => navigate('/tv')} style={{ height: '28px', padding: '0 0.5rem', fontSize: '0.75rem', borderRadius: '6px', border: 'none', background: 'transparent' }}>
              <Tv size={12} /> <span className="btn-text">TV Mode</span>
            </button>
            <button className="btn btn-secondary archive-btn shimmer" onClick={() => navigate('/archive')} style={{ height: '28px', padding: '0 0.5rem', fontSize: '0.75rem', borderRadius: '6px', border: 'none', background: 'var(--accent-gradient)', color: 'white' }}>
              <Archive size={12} /> <span className="btn-text">Shipping</span>
            </button>
          </div>

          <div className="secondary-nav hide-on-mobile" style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
            <button className="btn btn-secondary" onClick={() => navigate('/stations')} style={{ height: '30px', padding: '0 0.6rem', fontSize: '0.8rem', borderRadius: '6px' }}>
              <MapPin size={12} /> <span className="btn-text">Bays</span>
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/backlog')} style={{ height: '30px', padding: '0 0.6rem', fontSize: '0.8rem', borderRadius: '6px' }}>
              <Plus size={12} /> <span className="btn-text">Backlog</span>
            </button>
          </div>

          <div className="util-group hide-on-mobile" style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
            {userRole === 'manager' && (
              <button 
                className="btn btn-secondary btn-icon" 
                onClick={() => {
                  if (isPriceUnlockedGlobally) {
                    if (onLockPrices) onLockPrices();
                  } else {
                    if (onUnlockPrices) onUnlockPrices();
                  }
                }} 
                title={isPriceUnlockedGlobally ? "Hide Prices" : "Show Prices"}
                style={{ width: '30px', height: '30px', borderRadius: '6px' }}
              >
                {isPriceUnlockedGlobally ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            )}
            {userRole === 'manager' && (
              <div className="undo-redo-subgroup" style={{ display: 'flex', gap: '0.2rem' }}>
                <button className="btn btn-secondary btn-icon" onClick={handleUndo} disabled={undoStack.length === 0} title="Undo" style={{ width: '30px', height: '30px', borderRadius: '6px' }}><Undo2 size={12} /></button>
                <button className="btn btn-secondary btn-icon" onClick={handleRedo} disabled={redoStack.length === 0} title="Redo" style={{ width: '30px', height: '30px', borderRadius: '6px' }}><Redo2 size={12} /></button>
              </div>
            )}
          </div>

          {userRole === 'manager' && (
          <button className="btn btn-primary register-btn hide-on-mobile" onClick={() => setIsAddModalOpen(true)} style={{ height: '34px', padding: '0 0.75rem', borderRadius: '8px', fontWeight: 700, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
            <Plus size={14} /> <span className="btn-text">Register</span>
          </button>
          )}
        </div>

        {/* MOBILE OVERHAUL NAV */}
        <div className="mobile-header-container show-on-mobile-only" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem 0' }}>
          {/* Row 1: Logo, Search, Catalog, Register */}
          <div className="mobile-row-top" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%' }}>
            <Link to="/" className="header-logo-link" style={{ background: '#000', padding: '4px 8px', borderRadius: '6px', flexShrink: 0 }}>
              <img src={logo} alt="Lane Trailers" style={{ height: '24px' }} />
            </Link>
            
            <div className="mobile-search-wrapper" style={{ flex: 1, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                placeholder="Search..." 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
                style={{ width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '0.4rem 0.5rem 0.4rem 1.8rem', fontSize: '0.85rem', color: 'var(--text-primary)', outline: 'none' }}
              />
            </div>

            {userRole === 'manager' && (
              <button className="btn btn-secondary" onClick={() => navigate('/catalog')} style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', flexShrink: 0, fontWeight: 700, fontSize: '0.75rem' }}>
                Catalog
              </button>
            )}

            {userRole === 'manager' && (
            <button className="btn btn-primary" onClick={() => setIsAddModalOpen(true)} style={{ width: '38px', height: '38px', borderRadius: '8px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)' }} title="Register Unit">
              <Plus size={18} strokeWidth={3} />
            </button>
            )}
          </div>

          {/* Row 2: Nav Bar + Theme Toggle */}
          <div className="mobile-row-bottom" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%' }}>
            <div className="mobile-nav-pills" style={{ 
              flex: 1, 
              display: 'flex', 
              gap: '0.4rem', 
              overflowX: 'auto', 
              paddingBottom: '2px',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none'
            }}>
              <button className="btn btn-secondary mobile-nav-btn" onClick={() => navigate('/stations')}>Bays</button>
              <button className="btn btn-secondary mobile-nav-btn" onClick={() => navigate('/backlog')}>Backlog</button>
              <button className="btn btn-secondary mobile-nav-btn" onClick={() => navigate('/schedule')}>Timeline</button>
              <button className="btn btn-secondary mobile-nav-btn" onClick={() => navigate('/archive')}>Shipping</button>
              <button className="btn btn-secondary mobile-nav-btn mobile-tv-btn" onClick={() => navigate('/tv')}>TV Mode</button>
            </div>
            
            {userRole === 'manager' && (
              <div className="mobile-undo-redo" style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                <button 
                  className="btn btn-secondary btn-icon tablet-only-price-toggle" 
                  onClick={() => {
                    if (isPriceUnlockedGlobally) {
                      if (onLockPrices) onLockPrices();
                    } else {
                      if (onUnlockPrices) onUnlockPrices();
                    }
                  }} 
                  title={isPriceUnlockedGlobally ? "Hide Prices" : "Show Prices"}
                  style={{ width: '34px', height: '34px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {isPriceUnlockedGlobally ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button 
                  className="btn btn-secondary" 
                  onClick={handleUndo} 
                  disabled={undoStack.length === 0}
                  style={{ height: '34px', padding: '0 0.5rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Undo2 size={12} /> Undo
                </button>
                <button 
                  className="btn btn-secondary" 
                  onClick={handleRedo} 
                  disabled={redoStack.length === 0}
                  style={{ height: '34px', padding: '0 0.5rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Redo2 size={12} /> Redo
                </button>
              </div>
            )}

            <div className="mobile-scroll-arrows" style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
              <button className="btn btn-secondary btn-icon" onClick={() => scrollBoard('up')} style={{ width: '34px', height: '34px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Scroll Up">
                <ChevronUp size={16} />
              </button>
              <button className="btn btn-secondary btn-icon" onClick={() => scrollBoard('down')} style={{ width: '34px', height: '34px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Scroll Down">
                <ChevronDown size={16} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="main-content" ref={mainContentRef}>
        <DndContext 
          sensors={sensors} 
          collisionDetection={closestCenter} 
          autoScroll={{
            acceleration: 5000,
            threshold: { x: 0.1, y: 0.5 },
          }}
          measuring={{
            droppable: {
              strategy: MeasuringStrategy.Always,
            },
          }}
          onDragStart={handleDragStart} 
          onDragOver={handleDragOver} 
          onDragEnd={handleDragEnd}
        >
          {PHASES.map((phase) => (
            <KanbanColumn 
              key={phase.id} 
              id={phase.id} 
              title={phase.title} 
              trailers={filteredTrailers.filter(t => t.currentPhase === phase.id)} 
              onUpdateTrailer={updateTrailer} 
               onShipRequest={async (t) => {
                if (t.vinDate && t.invoiceNumber) {
                  updateTrailer(t.id, { isArchived: true, archivedAt: Date.now() });
                } else {
                  // Initialize form fields immediately
                  const getPhaseHours = (phaseId: string) => {
                    const entries = t.history.filter(h => h.phase === phaseId);
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

                  setShippingForm({
                    invoice_number: t.invoiceNumber || '',
                    vin_date: t.vinDate || '',
                    customer_name: t.name || '',
                    sale_price: t.sale_price?.toString() || '',
                    dealer_price: '',
                    cost_price: '',
                    shipped_date: new Date().toISOString().split('T')[0]
                  });

                  setPendingShippingTrailer(t);

                  // Fetch heavy fields in background
                  try {
                    const { data } = await supabase
                      .from('trailers')
                      .select('spec_sheet_file, inspection_sheet_file, photo_1_url, photo_2_url, photo_3_url')
                      .eq('id', t.id)
                      .single();
                    
                    if (data) {
                      setPendingShippingTrailer(prev => {
                        // Guard: only apply if the user hasn't closed the modal or opened another one in the meantime
                        if (!prev || prev.id !== t.id) return prev;
                        return {
                          ...prev,
                          spec_sheet_file: data.spec_sheet_file || null,
                          inspection_sheet_file: data.inspection_sheet_file || null,
                          photo_1_url: data.photo_1_url || null,
                          photo_2_url: data.photo_2_url || null,
                          photo_3_url: data.photo_3_url || null
                        };
                      });
                    }
                  } catch (err) {
                    console.error("Error fetching heavy fields for shipping:", err);
                  }
                }
              }}
              onCardClick={(t, mode = 'view') => {
                setSelectedTrailerId(t.id);
                setSelectedTrailerMode(mode);
              }}
              workload={getPhaseWorkload(phase.id)}
              highlightedId={highlightedTrailerId}
              suggestedBay={suggestedBay}
              localTargetHours={localTargetHours}
              userRole={userRole}
              isPriceUnlockedGlobally={isPriceUnlockedGlobally}
              onUnlockPrices={onUnlockPrices}
            />
          ))}
          <DragOverlay>
            {activeTrailer ? <TrailerCard trailer={activeTrailer} localTargetHours={localTargetHours} isOverlay userRole={userRole} isPriceUnlockedGlobally={isPriceUnlockedGlobally} onUnlockPrices={onUnlockPrices} /> : null}
          </DragOverlay>
        </DndContext>
      </main>

      <div className="pipeline-workload-strip">
        <div className="strip-items-container">
          <Clock size={16} style={{ color: '#fbbf24', flexShrink: 0 }} />

          <div className="strip-item">
            <span className="strip-label">WORKLOAD REMAINING:</span>
            <span className="strip-value highlight">{Math.round(totalWorkRemaining)}h</span>
          </div>

          <div className="strip-divider" />

          <div className="strip-item">
            <span className="strip-label">PRODUCTION RUNWAY:</span>
            <span className="strip-value">~{runwayWeeks < 1 ? '<1' : Math.round(runwayWeeks)}w</span>
          </div>

          <div className="strip-divider" />

          <div className="strip-item hide-under-980">
            <span className="strip-label">TOTAL UNITS:</span>
            <span className="strip-value">{trailers.filter(t => !t.isArchived && !t.isDeleted).length}</span>
          </div>

        </div>

        <div className="strip-stats hide-on-mobile">
          <div className="strip-item">
            <span className="strip-label">ACTIVE:</span>
            <span className="strip-value">{trailers.filter(t => !t.isArchived && t.currentPhase !== 'shipping').length}</span>
          </div>
          <div className="strip-item">
            <span className="strip-label">AVG TIME:</span>
            <span className="strip-value">{trailers.filter(t => !t.isArchived && t.currentPhase !== 'shipping').length > 0 ? Math.round(totalProductionTime / Math.max(trailers.filter(t => !t.isArchived && t.currentPhase !== 'shipping').length, 1)) : 0}h/unit</span>
          </div>
          
          <button 
            className="btn btn-secondary stats-btn" 
            onClick={() => setIsStatsModalOpen(true)}
            style={{ 
              height: '26px', 
              padding: '0 0.6rem', 
              fontSize: '0.65rem', 
              borderRadius: '6px',
              marginLeft: '0.75rem',
              background: 'rgba(59, 130, 246, 0.1)',
              borderColor: 'rgba(59, 130, 246, 0.2)',
              color: '#60a5fa',
              fontWeight: 800,
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <BarChart2 size={12} />
            Stats
          </button>
        </div>
      </div>

      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Quick Unit Registration">
        <form onSubmit={handleAddTrailer} onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') e.preventDefault(); }}>
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
            <label className="form-label">Customer / Dealer *</label>
            <select 
              className="form-select" 
              value={newTrailerData.name} 
              onChange={e => {
                const dName = e.target.value;
                const selectedD = dealers.find(d => d.name === dName);
                setNewTrailerData({
                  ...newTrailerData, 
                  name: dName,
                  dealerCommonAddress: selectedD?.common_address || '',
                  dealerLocation: ''
                });
              }}
              required
            >
              <option value="">Select Dealer...</option>
              {dealers.map(d => (
                <option key={d.id} value={d.name}>{d.name}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Salesman (Sales Rep)</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="e.g. John Doe"
                value={newTrailerData.salesPerson} 
                onChange={e => setNewTrailerData({...newTrailerData, salesPerson: e.target.value})} 
              />
            </div>
            <div className="form-group">
              <label className="form-label">Billing Address</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Dealer Billing Address"
                value={newTrailerData.dealerCommonAddress} 
                onChange={e => setNewTrailerData({...newTrailerData, dealerCommonAddress: e.target.value})} 
              />
            </div>
          </div>

          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label className="form-label">Shipping Address (Branch Location)</label>
            <select 
              className="form-select" 
              value={newTrailerData.dealerLocation} 
              onChange={e => setNewTrailerData({...newTrailerData, dealerLocation: e.target.value})} 
              disabled={!newTrailerData.name}
            >
              <option value="">Select Address...</option>
              {dealers.find(d => d.name === newTrailerData.name)?.addresses?.map(addr => (
                <option key={addr} value={addr}>{addr}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">LANE TRAILERS *</label>
            <select className="form-select" value={newTrailerData.model} onChange={e => setNewTrailerData({...newTrailerData, model: e.target.value})} required>
              <option value="">Select Model...</option>
              {localModelCategories.map(cat => <optgroup key={cat.name} label={cat.name}>{cat.models.map(m => <option key={m} value={m}>{m}</option>)}</optgroup>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Promised Shipping Date</label>
              <input 
                type="date" 
                className="form-input" 
                value={newTrailerData.promisedShippingDate} 
                onChange={e => setNewTrailerData({...newTrailerData, promisedShippingDate: e.target.value})}
                onFocus={(e) => e.target.showPicker()}
              />
            </div>
            {userRole === 'manager' && (
              <div className="form-group">
                <label className="form-label" style={{ color: '#d97706' }}>Sale Price ($)</label>
                <div style={{ position: 'relative' }}>
                  <input 
                    key={isPriceUnlockedGlobally ? 'unlocked-reg' : 'locked-reg'}
                    type={isPriceUnlockedGlobally ? "number" : "password"} 
                    className="form-input" 
                    placeholder={isPriceUnlockedGlobally ? "0.00" : "••••••"}
                    style={{ borderColor: '#d97706', background: 'rgba(217,119,6,0.05)' }}
                    onFocus={() => {
                      if (!isPriceUnlockedGlobally && onUnlockPrices) {
                        onUnlockPrices();
                      }
                    }}
                    value={newTrailerData.sale_price}
                    onChange={e => setNewTrailerData({...newTrailerData, sale_price: e.target.value})}
                  />
                  <DollarSign size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#d97706' }} />
                </div>
              </div>
            )}
          </div>
          {/* Color & Plug fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
            <div className="form-group">
              <label className="form-label">🎨 Trailer Color</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="e.g. White, Red" 
                value={newTrailerData.trailer_color}
                onChange={e => setNewTrailerData({...newTrailerData, trailer_color: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label className="form-label">🔌 Trailer Plug</label>
              <select 
                className="form-select"
                value={newTrailerData.trailer_plug}
                onChange={e => setNewTrailerData({...newTrailerData, trailer_plug: e.target.value})}
              >
                <option value="">Select Plug...</option>
                <option value="7 RV Molded Plug">7 RV Molded Plug</option>
                <option value="7 Pole Semi Plug">7 Pole Semi Plug</option>
                <option value="6 Pole Molded Plug">6 Pole Molded Plug</option>
                <option value="4 Way Flat">4 Way Flat</option>
              </select>
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
          
          <div style={{ padding: '0.85rem', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-default)', marginTop: '1rem' }}>
            <label className="form-label" style={{ fontSize: '0.65rem', color: '#166534', marginBottom: '0.75rem', display: 'block' }}>Parts Readiness</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
              {Object.entries(newTrailerData.partsStatus).map(([key, val]) => (
                <label key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', padding: '0.75rem 0.4rem', background: val ? 'rgba(34, 197, 94, 0.1)' : 'var(--bg-card)', borderRadius: '10px', border: `1px solid ${val ? 'var(--accent)' : 'var(--border-default)'}`, transition: 'all 0.2s' }}>
                  <input type="checkbox" checked={val} onChange={e => setNewTrailerData({...newTrailerData, partsStatus: {...newTrailerData.partsStatus, [key as keyof typeof newTrailerData.partsStatus]: e.target.checked}})} style={{ width: '16px', height: '16px' }} />
                  <span style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', color: val ? 'var(--accent)' : 'var(--text-muted)' }}>{key}</span>
                </label>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button 
              type="button" 
              onClick={(e) => { e.preventDefault(); handleAddTrailer(e as any); }}
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
          isOpen={!!selectedTrailerId}
          initialMode={selectedTrailerMode}
          onClose={() => {
            setSelectedTrailerId(null);
            setSelectedTrailerMode('view');
          }} 
          onUpdate={updateTrailer} 
          allTrailers={trailers}
          localTargetHours={localTargetHours}
          localSpecSheetTemplates={localSpecSheetTemplates}
          onDeleteTrailer={(id) => {
            onDeleteTrailer(id);
            setSelectedTrailerId(null);
          }}
          shippedTrailers={shippedTrailers}
          userRole={userRole}
          isPriceUnlockedGlobally={isPriceUnlockedGlobally}
          onUnlockPrices={onUnlockPrices}
        />
      )}
      
      <Modal isOpen={!!pendingShippingTrailer} onClose={handleCloseShippingModal} title={`Shipment Checklist: ${pendingShippingTrailer?.serialNumber}`}>
        <form onSubmit={handleShipSubmit} onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') e.preventDefault(); }} style={{ opacity: isShipping ? 0.7 : 1, pointerEvents: isShipping ? 'none' : 'all' }}>
          
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
                <input 
                  required 
                  type="date" 
                  className="form-input"
                  value={shippingForm.vin_date}
                  onChange={e => setShippingForm(prev => ({ ...prev, vin_date: e.target.value }))}
                  onFocus={(e) => e.target.showPicker()}
                />
              </div>
              <div className="form-group" style={{ margin: 0, marginTop: '1rem' }}>
                <label className="form-label" style={{ fontSize: '0.65rem' }}>Customer Name</label>
                <input required className="form-input" placeholder="e.g. Acme Logistics"
                  value={shippingForm.customer_name}
                  onChange={e => setShippingForm(prev => ({ ...prev, customer_name: e.target.value }))}
                />
              </div>
              <div className="form-group" style={{ margin: 0, marginTop: '1rem' }}>
                <label className="form-label" style={{ fontSize: '0.65rem' }}>Shipped Date</label>
                <input 
                  required 
                  type="date" 
                  className="form-input"
                  value={shippingForm.shipped_date}
                  onChange={e => setShippingForm(prev => ({ ...prev, shipped_date: e.target.value }))}
                  onFocus={(e) => e.target.showPicker()}
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
              {(['p1', 'p2', 'p3'] as const).map((slot, index) => {
                const existingUrl = pendingShippingTrailer?.[`photo_${index + 1}_url` as keyof Trailer];
                const currentFile = shippingPhotos[slot];
                
                return (
                  <div key={slot}>
                    {currentFile || existingUrl ? (
                      <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '2px solid var(--accent)' }}>
                        <img 
                          src={currentFile ? URL.createObjectURL(currentFile) : (existingUrl as string)} 
                          alt="" 
                          style={{ width: '100%', height: '80px', objectFit: 'cover', display: 'block' }} 
                        />
                        <button 
                          type="button" 
                          onClick={() => {
                            if (currentFile) {
                              setShippingPhotos(prev => ({ ...prev, [slot]: null }));
                            } else {
                              // If it's an existing URL, we can't "delete" it from here easily, 
                              // but we could let the user upload over it.
                            }
                          }} 
                          style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '50%', color: 'white', width: '24px', height: '24px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '2px dashed var(--border-default)', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700, gap: '6px', transition: 'all 0.2s' }} className="hover-shimmer">
                        <ImageIcon size={18} color="var(--text-muted)" /> 
                        <span>Upload</span>
                        <input type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) setShippingPhotos(prev => ({ ...prev, [slot]: f })); }} />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Spec Sheet Section */}
          <div style={{ marginBottom: '1.5rem', background: 'rgba(59, 130, 246, 0.05)', padding: '1.25rem', borderRadius: '16px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
              <FileText size={16} color="var(--accent)" />
              <span style={{ fontSize: '0.75rem', fontWeight: 900, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Spec Sheet (Excel)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Final Spec Sheet</span>
              {pendingShippingTrailer?.spec_sheet_file ? (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    type="button"
                    className="btn btn-secondary" 
                    onClick={async () => {
                      const baseName = (pendingShippingTrailer.serialNumber || pendingShippingTrailer.model || 'Trailer').trim();
                      await triggerFileDownload(pendingShippingTrailer.spec_sheet_file!, `${baseName}_SpecSheet.xlsx`);
                    }}
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  >
                    Download
                  </button>
                  <label className="btn btn-primary shimmer" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', cursor: 'pointer', margin: 0 }}>
                    Replace
                    <input 
                      type="file" 
                      accept=".xlsx,.xls" 
                      style={{ display: 'none' }} 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setShippingSpecSheet(file);
                          setPendingShippingTrailer(prev => prev ? { ...prev, spec_sheet_file: URL.createObjectURL(file) } : null);
                        }
                      }}
                    />
                  </label>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>No spec sheet available.</span>
                  <label className="btn btn-primary shimmer" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', cursor: 'pointer', margin: 0, textAlign: 'center' }}>
                    Upload File
                    <input 
                      type="file" 
                      accept=".xlsx,.xls" 
                      style={{ display: 'none' }} 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setShippingSpecSheet(file);
                          setPendingShippingTrailer(prev => prev ? { ...prev, spec_sheet_file: URL.createObjectURL(file) } : null);
                        }
                      }}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* Inspection Sheet Section */}
          <div style={{ marginBottom: '1.5rem', background: 'rgba(16, 185, 129, 0.05)', padding: '1.25rem', borderRadius: '16px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
              <FileText size={16} color="#059669" />
              <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Inspection Sheet</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Inspection Document</span>
              {pendingShippingTrailer?.inspection_sheet_file ? (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    type="button"
                    className="btn btn-secondary" 
                    onClick={async () => {
                      const baseName = (pendingShippingTrailer.serialNumber || pendingShippingTrailer.model || 'Trailer').trim();
                      await triggerFileDownload(pendingShippingTrailer.inspection_sheet_file!, `${baseName}_InspectionSheet`);
                    }}
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                  >
                    Download
                  </button>
                  <label className="btn btn-primary shimmer" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', cursor: 'pointer', margin: 0 }}>
                    Replace
                    <input 
                      type="file" 
                      accept="image/*,.pdf" 
                      style={{ display: 'none' }} 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setShippingInspectionSheet(file);
                          setPendingShippingTrailer(prev => prev ? { ...prev, inspection_sheet_file: URL.createObjectURL(file) } : null);
                        }
                      }}
                    />
                  </label>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>No inspection sheet available.</span>
                  <label className="btn btn-primary shimmer" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', cursor: 'pointer', margin: 0, textAlign: 'center' }}>
                    Upload File
                    <input 
                      type="file" 
                      accept="image/*,.pdf" 
                      style={{ display: 'none' }} 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setShippingInspectionSheet(file);
                          setPendingShippingTrailer(prev => prev ? { ...prev, inspection_sheet_file: URL.createObjectURL(file) } : null);
                        }
                      }}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>

          {userRole === 'manager' && (
            <div style={{ padding: '1.25rem', background: 'rgba(217, 119, 6, 0.05)', borderRadius: '16px', border: '1px solid rgba(217, 119, 6, 0.2)', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
              <DollarSign size={16} color="#d97706" />
              <span style={{ fontSize: '0.75rem', fontWeight: 900, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Financial Settlement (Private)</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '1rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ color: '#d97706', fontSize: '0.65rem' }}>Final Sale Price ($)</label>
                <input 
                  key={isPriceUnlockedGlobally ? 'unlocked-ship' : 'locked-ship'}
                  type={isPriceUnlockedGlobally ? "number" : "password"} 
                  className="form-input" 
                  style={{ borderColor: 'rgba(217, 119, 6, 0.3)', background: 'var(--bg-secondary)', fontWeight: 700 }} 
                  placeholder={isPriceUnlockedGlobally ? "0.00" : "••••••"}
                  value={shippingForm.sale_price}
                  onChange={e => setShippingForm(prev => ({ ...prev, sale_price: e.target.value }))}
                  onFocus={() => {
                    if (!isPriceUnlockedGlobally && onUnlockPrices) {
                      onUnlockPrices();
                    }
                  }}
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
          )}

          <div className="form-footer">
            {!isShipping && (
               <button type="button" className="btn btn-secondary" onClick={handleCloseShippingModal}>Cancel</button>
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

      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: '#10b981',
          color: 'white',
          padding: '16px 24px',
          borderRadius: '8px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          zIndex: 9999,
          fontWeight: 700,
          fontSize: '0.9rem',
          animation: 'slideUp 0.3s ease-out'
        }}>
          <CheckCircle size={20} />
          {toastMessage}
        </div>
      )}
    </div>
  );
}

function AuthGate({ children }: { children: (role: UserRole) => React.ReactNode }) {
  const [auth, setAuth] = useState<{ isAuthenticated: boolean; role: UserRole | null }>({ isAuthenticated: false, role: null });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const role = session.user.email?.toLowerCase() === 'manager@lanetrailers.com' ? 'manager' : 'worker';
        setAuth({ isAuthenticated: true, role });
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const role = session.user.email?.toLowerCase() === 'manager@lanetrailers.com' ? 'manager' : 'worker';
        setAuth({ isAuthenticated: true, role });
      } else {
        setAuth({ isAuthenticated: false, role: null });
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ height: '100vh', width: '100vw', background: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  if (auth.isAuthenticated && auth.role) return <>{children(auth.role)}</>;

  return (
    <div className="auth-gate-container">
      <div className="auth-card">
        <div className="auth-header">
          <img src={logo} alt="Lane Trailers" className="auth-logo" />
          <h1 className="auth-title">Production Portal</h1>
          <p className="auth-subtitle">Secure access for authorized personnel only.</p>
        </div>

        <form onSubmit={handleLogin} className="auth-form">
          {error && <div className="auth-error">{error}</div>}
          
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input 
              type="email" 
              className="form-input" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="e.g. john@company.com"
              required
            />
          </div>
          
          <div className="form-group" style={{ marginTop: '1.25rem' }}>
            <label className="form-label">Password</label>
            <input 
              type="password" 
              className="form-input" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          
          <button type="submit" className="btn btn-primary auth-submit-btn" disabled={loading} style={{ width: '100%', marginTop: '2rem', padding: '0.85rem' }}>
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}


function App() {
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth <= 768 : false);
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [trailers, setTrailers] = useState<Trailer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // No resize logic needed for current sensor configuration
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingModelName, setEditingModelName] = useState<string | null>(null);
  const [modelFormData, setModelFormData] = useState<Record<PhaseId, number> | null>(null);
  const [modelSpecData, setModelSpecData] = useState<{ steelWeight: string; axles: string }>({ steelWeight: '', axles: '' });
  // Undo/Redo stacks
  const [undoStack, setUndoStack] = useState<Array<Array<{ id: string } & Partial<Trailer>>>>([]);
  const [redoStack, setRedoStack] = useState<Array<Array<{ id: string } & Partial<Trailer>>>>([]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };


  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
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
  const [dealers, setDealers] = useState<{ id: string; name: string; addresses?: string[]; common_address?: string; }[]>([]);

  const [isPriceUnlockedGlobally, setIsPriceUnlockedGlobally] = useState(() => {
    return localStorage.getItem('lanetrailers_price_unlocked') === 'true';
  });

  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const unlockPricesGlobally = () => {
    setIsPinModalOpen(true);
    setPinInput('');
    setPinError('');
    return false;
  };

  const handlePinSubmit = () => {
    if (pinInput === '0000') {
      setIsPriceUnlockedGlobally(true);
      localStorage.setItem('lanetrailers_price_unlocked', 'true');
      setIsPinModalOpen(false);
    } else {
      setPinError('Invalid PIN. Please try again.');
    }
  };

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

  // Build a proper specs map that merges catalog model specs from the DB
  const localModelSpecs = useMemo(() => {
    const specsMap: Record<string, ModelSpec> = {};
    catalogModels.forEach(m => {
      if (m.specs) {
        specsMap[m.name] = m.specs;
      }
    });
    return specsMap;
  }, [catalogModels]);

  const localSpecSheetTemplates = useMemo(() => {
    const templatesMap: Record<string, string> = {};
    catalogModels.forEach(m => {
      if (m.spec_sheet_template) {
        templatesMap[m.name] = m.spec_sheet_template;
      }
    });
    return templatesMap;
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
    const registeredTrailers = trailers.filter(t => t.currentPhase !== 'quote');
    if (registeredTrailers.length === 0) return 'T-100';
    
    const sorted = [...registeredTrailers].sort((a, b) => b.dateStarted - a.dateStarted);

    for (const t of sorted) {
      // Ignore quote-like serial numbers (e.g., 06102025-4912 or 06102025-T-200) just in case
      if (/^Q?-\?\d{8}-.*$/.test(t.serialNumber) || /^\d{8}-.*$/.test(t.serialNumber)) continue;

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
      const [trailersRes, bayRes, modelsRes, templatesExistRes, shippedRes, dealersRes] = await Promise.all([
        // Exclude spec_sheet_file, photo_1_url, photo_2_url, photo_3_url, inspection_sheet_file, and spec_sheet_versions from bulk fetch.
        // These are huge Base64 columns causing timeouts and freezing. They are lazy-loaded.
        supabase.from('trailers').select('id,name,model,serialNumber,station,dateStarted,currentPhase,history,partsStatus,finishingType,isArchived,archivedAt,isDeleted,invoiceNumber,vinDate,expectedDueDate,promisedShippingDate,notes,isPriority,updated_at,vertical_order,bay_vertical_order,sale_price,trailer_color,trailer_plug,sales_person,dealer_location,dealer_common_address,dealer_id'),
        supabase.from('bay_settings').select('*'),
        supabase.from('production_models').select('id, name, category, target_hours, specs'),
        supabase.from('production_models').select('name').not('spec_sheet_template', 'is', null),
        supabase.from('shipped_trailers').select('serial_number, trailer_name, customer_name, vin_date, invoice_number, shipped_at, total_hours, prefab_hours, build_hours, paint_hours, outsource_hours, trim_hours, sale_price').order('shipped_at', { ascending: false }).limit(100),
        supabase.from('dealers').select('*').order('name')
      ]);
      
      if (trailersRes.data) {
        // Map backend snake_case columns back to frontend camelCase properties
        const mappedTrailers = trailersRes.data.map(t => {
          const mapped: any = { ...t };
          if (mapped.sales_person) { mapped.salesPerson = mapped.sales_person; delete mapped.sales_person; }
          if (mapped.dealer_location) { mapped.dealerLocation = mapped.dealer_location; delete mapped.dealer_location; }
          if (mapped.dealer_common_address) { mapped.dealerCommonAddress = mapped.dealer_common_address; delete mapped.dealer_common_address; }
          if (mapped.dealer_id) { mapped.dealerId = mapped.dealer_id; delete mapped.dealer_id; }
          return mapped;
        });
        
        // De-duplicate items by ID just in case
        const uniqueTrailers = mappedTrailers.filter((t, index, self) => 
          index === self.findIndex((u) => u.id === t.id)
        );
        // Local sort: vertical_order ASC, then dateStarted DESC fallback
        const sorted = [...uniqueTrailers].sort((a, b) => {
          if (a.vertical_order !== undefined && b.vertical_order !== undefined) {
            return a.vertical_order - b.vertical_order;
          }
          return (b.dateStarted || 0) - (a.dateStarted || 0);
        });
        setTrailers(sorted as Trailer[]);
      }
      
      if (modelsRes.data) {
        const templatesExistNames = new Set((templatesExistRes.data || []).map(r => r.name));
        const finalModels = modelsRes.data.map(m => ({
          ...m,
          spec_sheet_template: templatesExistNames.has(m.name) ? 'EXISTS' : undefined
        }));
        setCatalogModels(finalModels);
      }
      
      if (shippedRes.data) setShippedTrailers(shippedRes.data);
      if (dealersRes.data) setDealers(dealersRes.data);
      if (bayRes.data) {
        // Start with a clean slate — only 'None' gets a fixed 0
        const caps: Record<StationId, number> = {
          'B1': 40,
          'B2': 40,
          'B3': 40,
          'B4': 40,
          'None': 0
        };
        // Override with actual DB values
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

    // Track active channels in refs to avoid stale closures
    const activeChannels: Record<string, ReturnType<typeof supabase.channel>> = {};

    // --- Trailer Channel ---
    const setupTrailerChannel = () => {
      const ch = supabase
        .channel('trailers-changes')
        .on(
          'postgres_changes' as any,
          { event: '*', schema: 'public', table: 'trailers' },
          (payload: any) => {
            if (activeIdRef.current === payload.new?.id || activeIdRef.current === payload.old?.id) return;
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const mapped = { ...payload.new };
              if (mapped.sales_person) { mapped.salesPerson = mapped.sales_person; delete mapped.sales_person; }
              if (mapped.dealer_location) { mapped.dealerLocation = mapped.dealer_location; delete mapped.dealer_location; }
              if (mapped.dealer_common_address) { mapped.dealerCommonAddress = mapped.dealer_common_address; delete mapped.dealer_common_address; }
              if (mapped.dealer_id) { mapped.dealerId = mapped.dealer_id; delete mapped.dealer_id; }
              if (payload.eventType === 'INSERT') {
                setTrailers(prev => {
                  if (prev.find(t => t.id === mapped.id)) return prev;
                  return [mapped as Trailer, ...prev].sort((a, b) => (a.vertical_order ?? 0) - (b.vertical_order ?? 0));
                });
              } else {
                setTrailers(prev => {
                  const updated = prev.map(t => {
                    if (t.id === mapped.id) {
                      return {
                        ...t,
                        ...mapped,
                        spec_sheet_file: mapped.spec_sheet_file !== undefined ? mapped.spec_sheet_file : t.spec_sheet_file,
                        photo_1_url: mapped.photo_1_url !== undefined ? mapped.photo_1_url : t.photo_1_url,
                        photo_2_url: mapped.photo_2_url !== undefined ? mapped.photo_2_url : t.photo_2_url,
                        photo_3_url: mapped.photo_3_url !== undefined ? mapped.photo_3_url : t.photo_3_url,
                        inspection_sheet_file: mapped.inspection_sheet_file !== undefined ? mapped.inspection_sheet_file : t.inspection_sheet_file
                      } as Trailer;
                    }
                    return t;
                  });
                  return [...updated].sort((a, b) => (a.vertical_order ?? 0) - (b.vertical_order ?? 0));
                });
              }
            } else if (payload.eventType === 'DELETE') {
              setTrailers(prev => prev.filter(t => t.id !== payload.old.id));
            }
          }
        )
        .subscribe((status: string) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('Trailer channel error, syncing data...');
            fetchInitialData();
          }
        });
      activeChannels['trailers'] = ch;
    };

    // --- Bay Settings Channel ---
    const setupCapChannel = () => {
      const ch = supabase
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
        .subscribe((status: string) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('Bay settings channel error.');
          }
        });
      activeChannels['bay'] = ch;
    };

    // --- Models Channel ---
    const setupModelChannel = () => {
      const ch = supabase
        .channel('production-models-changes')
        .on(
          'postgres_changes' as any,
          { event: '*', schema: 'public', table: 'production_models' },
          (payload: any) => {
            if (payload.eventType === 'INSERT') {
              setCatalogModels(prev => prev.find(m => m.id === payload.new.id) ? prev : [...prev, payload.new as CatalogModel]);
            } else if (payload.eventType === 'UPDATE') {
              setCatalogModels(prev => prev.map(m => {
                if (m.id === payload.new.id) {
                  return { ...m, ...payload.new, spec_sheet_template: payload.new.spec_sheet_template || m.spec_sheet_template };
                }
                return m;
              }));
            } else if (payload.eventType === 'DELETE') {
              setCatalogModels(prev => prev.filter(m => m.id !== payload.old.id));
            }
          }
        )
        .subscribe((status: string) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('Models channel error.');
          }
        });
      activeChannels['models'] = ch;
    };

    // --- Dealers Channel ---
    const setupDealerChannel = () => {
      const ch = supabase
        .channel('dealers-changes')
        .on(
          'postgres_changes' as any,
          { event: '*', schema: 'public', table: 'dealers' },
          (payload: any) => {
            if (payload.eventType === 'INSERT') {
              setDealers(prev => prev.find(d => d.id === payload.new.id) ? prev : [...prev, payload.new as any].sort((a,b)=>a.name.localeCompare(b.name)));
            } else if (payload.eventType === 'UPDATE') {
              setDealers(prev => prev.map(d => d.id === payload.new.id ? { ...d, ...payload.new } : d).sort((a,b)=>a.name.localeCompare(b.name)));
            } else if (payload.eventType === 'DELETE') {
              setDealers(prev => prev.filter(d => d.id !== payload.old.id));
            }
          }
        )
        .subscribe((status: string) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('Dealers channel error.');
          }
        });
      activeChannels['dealers'] = ch;
    };

    // --- Shipped Channel ---
    const setupShippedChannel = () => {
      const ch = supabase
        .channel('shipped-changes')
        .on(
          'postgres_changes' as any,
          { event: '*', schema: 'public', table: 'shipped_trailers' },
          (payload: any) => {
            if (payload.eventType === 'INSERT') {
              setShippedTrailers(prev => prev.find(t => t.serial_number === payload.new.serial_number) ? prev : [payload.new as any, ...prev]);
            } else if (payload.eventType === 'UPDATE') {
              setShippedTrailers(prev => prev.map(t => t.serial_number === payload.new.serial_number ? { ...t, ...payload.new } : t));
            } else if (payload.eventType === 'DELETE') {
              setShippedTrailers(prev => prev.filter(t => t.serial_number !== payload.old.serial_number));
            }
          }
        )
        .subscribe((status: string) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('Shipped channel error.');
          }
        });
      activeChannels['shipped'] = ch;
    };

    // Start all channels
    setupTrailerChannel();
    setupCapChannel();
    setupModelChannel();
    setupDealerChannel();
    setupShippedChannel();

    return () => {
      // Remove all active channels
      Object.values(activeChannels).forEach(ch => {
        try { supabase.removeChannel(ch); } catch (_) { /* ignore */ }
      });
    };
  }, []);

  const updateCapacity = async (id: StationId, capacity: number) => {
    // Save previous value for rollback
    const prevCapacity = bayCapacities[id];
    // Optimistic update
    setBayCapacities(prev => ({ ...prev, [id]: capacity }));

    const { error } = await supabase
      .from('bay_settings')
      .upsert(
        { id, capacity, updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      );
    
    if (error) {
      console.error('Error updating bay capacity:', error);
      // Rollback on failure
      setBayCapacities(prev => ({ ...prev, [id]: prevCapacity }));
    }
  };

  const updateTrailer = async (id: string, updates: Partial<Trailer>): Promise<boolean> => {
    // Optimistic update
    setTrailers(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));

    // Map frontend camelCase properties to backend snake_case columns
    const dbUpdates: any = { ...updates };
    if ('salesPerson' in dbUpdates) { dbUpdates.sales_person = dbUpdates.salesPerson; delete dbUpdates.salesPerson; }
    if ('dealerLocation' in dbUpdates) { dbUpdates.dealer_location = dbUpdates.dealerLocation; delete dbUpdates.dealerLocation; }
    if ('dealerCommonAddress' in dbUpdates) { dbUpdates.dealer_common_address = dbUpdates.dealerCommonAddress; delete dbUpdates.dealerCommonAddress; }
    if ('dealerId' in dbUpdates) { dbUpdates.dealer_id = dbUpdates.dealerId; delete dbUpdates.dealerId; }

    const runUpdate = async (retries = 3, delay = 1500): Promise<boolean> => {
      const { error } = await supabase
        .from('trailers')
        .update(dbUpdates)
        .eq('id', id);
      
      if (error) {
        if (retries > 0 && (error.code === '57014' || String(error.message || '').toLowerCase().includes('timeout'))) {
          console.warn(`Update trailer timed out. Retrying in ${delay}ms... (${retries} retries left)`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return runUpdate(retries - 1, delay * 2);
        }
        console.error('Error updating trailer:', error);
        fetchInitialData();
        return false;
      }
      return true;
    };

    return await runUpdate();
  };

  const deleteTrailer = async (id: string) => {
    setTrailers(prev => prev.filter(t => t.id !== id));
    const { error } = await supabase.from('trailers').delete().eq('id', id);
    if (error) console.error('Error deleting trailer:', error);
  };

  const handleAddModel = async (data: { name: string, category: string, hours: Record<PhaseId, number>, spec: ModelSpec, spec_sheet_template?: string }) => {
    try {
      let templatePath = data.spec_sheet_template;
      if (templatePath && templatePath.startsWith('data:')) {
        const fileObj = dataURLtoFile(templatePath, `${data.name}_Template.xlsx`);
        templatePath = await uploadFileToSupabase(fileObj, 'spec_sheet_template', data.name);
      }

      const newModel: CatalogModel = {
        id: crypto.randomUUID(),
        name: data.name,
        category: data.category,
        target_hours: data.hours,
        specs: data.spec,
        spec_sheet_template: templatePath
      };
      
      // Optimistic update
      setCatalogModels(prev => [...prev, newModel]);
      
      const { error } = await supabase.from('production_models').insert(newModel);
      if (error) throw error;
    } catch (err: any) {
      console.error('Error adding model to catalog:', err);
      // Revert optimistic update
      setCatalogModels(prev => prev.filter(m => m.name !== data.name));
      alert('Failed to save model: ' + err.message);
    }
  };

  const handleEditModel = async (name: string, spec: { targetHours?: Record<PhaseId, number>, spec_sheet_template?: string }) => {
    if (spec.spec_sheet_template) {
      try {
        let templatePath = spec.spec_sheet_template;
        if (templatePath.startsWith('data:')) {
          const fileObj = dataURLtoFile(templatePath, `${name}_Template.xlsx`);
          templatePath = await uploadFileToSupabase(fileObj, 'spec_sheet_template', name);
        }
        
        const existing = catalogModels.find(m => m.name === name);
        if (existing) {
          const updatedModel = { ...existing, spec_sheet_template: templatePath };
          setCatalogModels(prev => prev.map(m => m.name === name ? updatedModel : m));
          const { error } = await supabase.from('production_models').upsert(updatedModel);
          if (error) throw error;
        } else {
          const newModel: CatalogModel = {
            id: crypto.randomUUID(),
            name: name,
            category: localModelCategories.find(c => c.models.includes(name))?.name || 'Uncategorized',
            target_hours: localTargetHours[name] || { prefab: PHASE_METADATA.prefab.defaultTargetHours, build: PHASE_METADATA.build.defaultTargetHours, paint: PHASE_METADATA.paint.defaultTargetHours, outsource: PHASE_METADATA.outsource.defaultTargetHours, trim: PHASE_METADATA.trim.defaultTargetHours, shipping: 0 },
            specs: {},
            spec_sheet_template: templatePath
          };
          setCatalogModels(prev => [...prev, newModel]);
          const { error } = await supabase.from('production_models').insert(newModel);
          if (error) throw error;
        }
      } catch (err: any) {
        console.error('Failed to upload template:', err);
        alert('Failed to upload template: ' + (err.message || ''));
        fetchInitialData();
      }
      return;
    }

    if (spec.targetHours) {
      setEditingModelName(name);
      setModelFormData(spec.targetHours);
      // Pre-populate steel weight and axles from existing catalogModels entry
      const existing = catalogModels.find(m => m.name === name);
      setModelSpecData({
        steelWeight: existing?.specs?.steelWeight || '',
        axles: existing?.specs?.axles || '',
      });
    }
  };

  const handleDeleteModel = async (name: string) => {
    const modelToDelete = catalogModels.find(m => m.name === name);
    if (!modelToDelete) return;

    setCatalogModels(prev => prev.filter(m => m.id !== modelToDelete.id));
    const { error } = await supabase.from('production_models').delete().eq('id', modelToDelete.id);
    if (error) console.error('Error deleting model from catalog:', error);
  };

  const handleAddDealer = async (dealer: { name: string, addresses: string[], common_address: string }) => {
    const newDealer: Dealer = {
      id: crypto.randomUUID(),
      name: dealer.name,
      addresses: dealer.addresses,
      common_address: dealer.common_address
    };

    setDealers(prev => [...prev, newDealer].sort((a, b) => a.name.localeCompare(b.name)));

    const { error } = await supabase
      .from('dealers')
      .insert(newDealer);
      
    if (error) {
      console.error('Error adding dealer:', error);
      setDealers(prev => prev.filter(d => d.id !== newDealer.id));
      alert('Failed to save dealer: ' + error.message);
    }
  };

  const handleEditDealer = async (id: string, dealer: { name: string, addresses: string[], common_address: string }) => {
    const existing = dealers.find(d => d.id === id);
    if (!existing) return;
    
    const updatedDealer = { ...existing, ...dealer };
    setDealers(prev => prev.map(d => d.id === id ? updatedDealer : d).sort((a, b) => a.name.localeCompare(b.name)));
    
    const { error } = await supabase
      .from('dealers')
      .update(dealer)
      .eq('id', id);
      
    if (error) {
      console.error('Error updating dealer:', error);
      setDealers(prev => prev.map(d => d.id === id ? existing : d));
      alert('Failed to update dealer: ' + error.message);
    }
  };

  const handleDeleteDealer = async (id: string) => {
    const dealerToDelete = dealers.find(d => d.id === id);
    if (!dealerToDelete) return;

    setDealers(prev => prev.filter(d => d.id !== id));
    const { error } = await supabase.from('dealers').delete().eq('id', id);
    if (error) {
      console.error('Error deleting dealer:', error);
      setDealers(prev => [...prev, dealerToDelete].sort((a, b) => a.name.localeCompare(b.name)));
      alert('Failed to delete dealer: ' + error.message);
    }
  };

  const handleSaveModelSpecs = async () => {
    if (!editingModelName || !modelFormData) return;
    
    const existingModel = catalogModels.find(m => m.name === editingModelName);
    if (existingModel) {
      const updatedModel = { ...existingModel, target_hours: modelFormData, specs: { ...existingModel.specs, steelWeight: modelSpecData.steelWeight, axles: modelSpecData.axles } };
      const prevModels = [...catalogModels];
      setCatalogModels(prev => prev.map(m => m.name === editingModelName ? updatedModel : m));
      
      const { error } = await supabase
        .from('production_models')
        .upsert(updatedModel);
      if (error) {
        console.error('Error updating model specs:', error);
        setCatalogModels(prevModels);
        alert('Failed to update model: ' + error.message);
      }
    } else {
      // If it is a hardcoded model being edited for the first time, we need to create it in DB
      const newModel: CatalogModel = {
        id: crypto.randomUUID(),
        name: editingModelName,
        category: localModelCategories.find(c => c.models.includes(editingModelName))?.name || 'Uncategorized',
        target_hours: modelFormData,
        specs: { steelWeight: modelSpecData.steelWeight, axles: modelSpecData.axles }
      };
      setCatalogModels(prev => [...prev, newModel]);
      const { error } = await supabase.from('production_models').insert(newModel);
      if (error) {
        console.error('Error saving model specs:', error);
        setCatalogModels(prev => prev.filter(m => m.id !== newModel.id));
        alert('Failed to save model: ' + error.message);
      }
    }
    setEditingModelName(null);
  };

  const addTrailer = async (newTrailer: Trailer) => {
    // Optimistic update
    setTrailers(prev => [newTrailer, ...prev]);

    // Map frontend camelCase properties to backend snake_case columns
    const dbTrailer: any = { ...newTrailer };
    if ('salesPerson' in dbTrailer) { dbTrailer.sales_person = dbTrailer.salesPerson; delete dbTrailer.salesPerson; }
    if ('dealerLocation' in dbTrailer) { dbTrailer.dealer_location = dbTrailer.dealerLocation; delete dbTrailer.dealerLocation; }
    if ('dealerCommonAddress' in dbTrailer) { dbTrailer.dealer_common_address = dbTrailer.dealerCommonAddress; delete dbTrailer.dealerCommonAddress; }
    if ('dealerId' in dbTrailer) { dbTrailer.dealer_id = dbTrailer.dealerId; delete dbTrailer.dealerId; }

    const { error } = await supabase
      .from('trailers')
      .insert([dbTrailer]);
    
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
  const dragStartPhaseRef = useRef<PhaseId | null>(null);
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
    
    const draggedTrailer = trailersRef.current.find(t => t.id === dragId);
    if (draggedTrailer) {
      dragStartPhaseRef.current = draggedTrailer.currentPhase;
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
    
    const activeTrailer = trailersRef.current.find(t => t.id === activeId);
    if (!activeTrailer) return;

    const isOverColumn = PHASES.some(p => p.id === overId);
    const overTrailer = trailersRef.current.find(t => t.id === overId);
    const overPhase = isOverColumn ? (overId as PhaseId) : overTrailer?.currentPhase;
    
    if (!overPhase) return;

    // Trigger update if phase changed OR if we are reordering
    if (activeTrailer.currentPhase !== overPhase || activeId !== overId) {
      setTrailers(prev => {
        const activeIdx = prev.findIndex(t => t.id === activeId);
        if (activeIdx === -1) return prev;
        
        const newTrailers = [...prev];
        const updatedActive = { ...newTrailers[activeIdx], currentPhase: overPhase };
        newTrailers[activeIdx] = updatedActive;

        // Get sorted items in the target phase
        const phaseItems = newTrailers
          .filter(t => t.currentPhase === overPhase && !t.isArchived && !t.isDeleted)
          .sort((a, b) => (a.vertical_order ?? 0) - (b.vertical_order ?? 0));

        const oldIdx = phaseItems.findIndex(t => t.id === activeId);
        let newIdx = overTrailer ? phaseItems.findIndex(t => t.id === overId) : phaseItems.length - 1;
        if (newIdx === -1) newIdx = phaseItems.length - 1;

        if (oldIdx !== -1 && oldIdx !== newIdx) {
          const reorderedPhase = arrayMove(phaseItems, oldIdx, newIdx);
          // Update vertical_orders globally
          reorderedPhase.forEach((t, idx) => {
            const globalIdx = newTrailers.findIndex(gt => gt.id === t.id);
            if (globalIdx !== -1) {
              newTrailers[globalIdx] = { ...newTrailers[globalIdx], vertical_order: idx * 1000 };
            }
          });
        }

        return newTrailers;
      });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    const activeId = active.id as string;
    
    // 1. Immediately clear activeId to prevent "blurred out" state
    setActiveId(null);
    

    const trailer = trailersRef.current.find(t => t.id === activeId);
    
    if (trailer && over) {
      try {
        // Handle history update if phase changed
        let finalHistory = trailer.history;
        const phaseChanged = dragStartPhaseRef.current && trailer.currentPhase !== dragStartPhaseRef.current;
        
        if (phaseChanged) {
          const now = Date.now();
          const updatedHistory = [...trailer.history];
          const currentLogIndex = updatedHistory.findIndex(h => h.phase === dragStartPhaseRef.current && !h.exitedAt);
          
          if (currentLogIndex !== -1) {
            const prevLog = updatedHistory[currentLogIndex];
            updatedHistory[currentLogIndex] = { ...prevLog, exitedAt: now, duration: now - prevLog.enteredAt };
          }
          updatedHistory.push({ phase: trailer.currentPhase, enteredAt: now });
          finalHistory = updatedHistory;
        }

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

        // Instant local update with re-sorting and final history
        setTrailers(prev => {
          const updatedList = prev.map(t => {
            const updated = reordered.find(r => r.id === t.id);
            if (updated) {
              return t.id === activeId ? { ...updated, history: finalHistory } : updated;
            }
            return t;
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
            vertical_order: reordered.find(r => r.id === activeId)?.vertical_order ?? 0,
            history: finalHistory
          }).eq('id', activeId),
          ...reordered
            .filter(t => t.id !== activeId)
            .map(t => supabase.from('trailers').update({ vertical_order: t.vertical_order }).eq('id', t.id))
        ]);

      } catch (err) {
        console.error('DragEnd Sync Error:', err);
      }
    }
    dragStartPhaseRef.current = null;
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
        <div className="app-container">
          <div className="floating-settings-container">
            <button 
              className={`settings-fab ${isSettingsOpen ? 'active' : ''}`}
              onClick={() => setIsSettingsOpen(!isSettingsOpen)}
              title="Settings"
            >
              <Settings size={24} />
            </button>

            {isSettingsOpen && (
              <>
                <div 
                  className="settings-backdrop" 
                  onClick={() => setIsSettingsOpen(false)} 
                  style={{ 
                    position: 'fixed', 
                    top: 0, 
                    left: 0, 
                    right: 0, 
                    bottom: 0, 
                    zIndex: 1050,
                    background: 'transparent'
                  }} 
                />
                <div className="settings-menu-panel" style={{ zIndex: 1100 }}>
                  <div className="settings-group">
                    <span className="settings-group-title">Display Settings</span>
                    <div className="settings-row">
                      <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Theme Mode</span>
                      <button className="btn btn-secondary" onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')} style={{ padding: '0.4rem 0.8rem' }}>
                        {theme === 'light' ? <><Moon size={14} /> Dark</> : <><Sun size={14} /> Light</>}
                      </button>
                    </div>
                  </div>

                  <div className="settings-group">
                    <span className="settings-group-title">System</span>
                    {!isMobile && (
                      <button className="btn btn-secondary settings-action-btn" onClick={toggleFullscreen}>
                        {isFullscreen ? <><Minimize size={14} /> Exit Fullscreen</> : <><Maximize size={14} /> Go Fullscreen</>}
                      </button>
                    )}
                    <button className="btn btn-secondary settings-action-btn logout-btn" onClick={() => supabase.auth.signOut()} style={{ marginTop: isMobile ? '0' : '0.5rem', borderColor: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}>
                      <LogOut size={14} /> Logout
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
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
                  throw error;
                } else if (data) {
                  setShippedTrailers(prev => prev.some(t => t.serial_number === data.serial_number) ? prev : [data, ...prev]); 
                }
              }}
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
              localModelCategories={localModelCategories}
              isPriceUnlockedGlobally={isPriceUnlockedGlobally}
              onUnlockPrices={unlockPricesGlobally}
              onLockPrices={() => {
                setIsPriceUnlockedGlobally(false);
                localStorage.setItem('prices_unlocked', 'false');
              }}
              localSpecSheetTemplates={localSpecSheetTemplates}
              dealers={dealers}
            />} />
            <Route path="/backlog" element={<BacklogView trailers={trailers} onAddTrailer={addTrailer} onUpdateTrailer={updateTrailer} onDeleteTrailer={deleteTrailer} suggestedBay={suggestedBay} nextSuggestedSerial={nextSuggestedSerial} localModelCategories={localModelCategories} localTargetHours={localTargetHours} localSpecSheetTemplates={localSpecSheetTemplates} dealers={dealers} userRole={userRole} isPriceUnlockedGlobally={isPriceUnlockedGlobally} onUnlockPrices={unlockPricesGlobally} />} />
            <Route path="/stations" element={<StationView trailers={trailers} setTrailers={setTrailers} onUpdateTrailer={updateTrailer} bayCapacities={bayCapacities} onUpdateCapacity={updateCapacity} localTargetHours={localTargetHours} userRole={userRole} isPriceUnlockedGlobally={isPriceUnlockedGlobally} onUnlockPrices={unlockPricesGlobally} />} />
            <Route path="/tv" element={<TVView trailers={trailers} localTargetHours={localTargetHours} userRole={userRole} />} />
            <Route path="/tv/station1" element={<TVView trailers={trailers} monitorMode="station1" localTargetHours={localTargetHours} userRole={userRole} />} />
            <Route path="/tv/station2" element={<TVView trailers={trailers} monitorMode="station2" localTargetHours={localTargetHours} userRole={userRole} />} />
            <Route path="/archive" element={<ArchiveView trailers={trailers} onUpdateTrailer={updateTrailer} localTargetHours={localTargetHours} shippedTrailers={shippedTrailers} userRole={userRole} isPriceUnlockedGlobally={isPriceUnlockedGlobally} onUnlockPrices={unlockPricesGlobally} onLockPrices={() => { setIsPriceUnlockedGlobally(false); localStorage.setItem('lanetrailers_price_unlocked', 'false'); }} />} />
            <Route path="/schedule" element={<ScheduleView trailers={trailers} userRole={userRole} />} />
            <Route path="/catalog" element={userRole === 'manager' ? <CatalogView categories={localModelCategories} hours={localTargetHours} specs={localModelSpecs} templates={localSpecSheetTemplates} onAddModel={handleAddModel} onEditModel={handleEditModel} onDeleteModel={handleDeleteModel} dealers={dealers} onAddDealer={handleAddDealer} onEditDealer={handleEditDealer} onDeleteDealer={handleDeleteDealer} userRole={userRole} trailers={trailers} /> : <Navigate to="/" replace />} />
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

          {/* PIN Verification Modal */}
          <Modal isOpen={isPinModalOpen} onClose={() => setIsPinModalOpen(false)} title="Manager Verification">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
                Please enter your manager PIN:
              </p>
              <div>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Enter PIN"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handlePinSubmit();
                  }}
                  autoFocus
                />
                {pinError && <p style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.5rem', fontWeight: 600 }}>{pinError}</p>}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setIsPinModalOpen(false)}>Cancel</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handlePinSubmit}>Confirm</button>
              </div>
            </div>
          </Modal>
        </div>
      )}
    </AuthGate>
  );
}

export default App;
