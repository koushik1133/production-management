export type PhaseId = 'backlog' | 'prefab' | 'build' | 'paint' | 'outsource' | 'trim' | 'shipping';
export type UserRole = 'worker' | 'manager';

export type StationId = 'B1' | 'B2' | 'B3' | 'B4' | 'None';

export type FinishingType = 'Paint' | 'Outsource';

export interface TimeLog {
  phase: PhaseId;
  enteredAt: number;
  exitedAt?: number;
  duration?: number;
  phaseManualHours?: number;
  bayManualHours?: number;
}

export interface PartsStatus {
  tyres: boolean;
  steel: boolean;
  parts: boolean;
}

export interface Trailer {
  id: string;
  name: string;
  serialNumber: string;
  station: StationId;
  dateStarted: number;
  currentPhase: PhaseId;
  history: TimeLog[];
  finishingType?: FinishingType;
  model: string;
  isPriority?: boolean;
  notes?: string;
  partsStatus?: PartsStatus;
  isArchived?: boolean;
  archivedAt?: number;
  isDeleted?: boolean;
  invoiceNumber?: string;
  vinDate?: string;
  promisedShippingDate?: string;
}

export interface ShippedTrailer {
  serial_number: string;       // PRIMARY KEY
  trailer_name: string;
  customer_name?: string;
  vin_date: string;
  invoice_number: string;
  shipped_at: string;
  total_hours: number;
  prefab_hours: number;
  build_hours: number;
  paint_hours: number;
  outsource_hours: number;
  trim_hours: number;
  photo_1_url?: string;
  photo_2_url?: string;
  photo_3_url?: string;
  sale_price: number;
}

export const STATIONS: StationId[] = ['B1', 'B2', 'B3', 'B4'];

export const BAY_WEEKLY_HOURS: Partial<Record<StationId, number>> = {
  B1: 40,
  B2: 80,
  B3: 80,
  B4: 40,
};

export const PHASE_METADATA: Record<PhaseId, { title: string; defaultTargetHours: number }> = {
  backlog: { title: 'Backlog', defaultTargetHours: 0 },
  prefab: { title: 'Prefab', defaultTargetHours: 24 },
  build: { title: 'Build', defaultTargetHours: 48 },
  paint: { title: 'Painting', defaultTargetHours: 24 },
  outsource: { title: 'Outsourcing', defaultTargetHours: 168 },
  trim: { title: 'Trim', defaultTargetHours: 24 },
  shipping: { title: 'Shipping', defaultTargetHours: 24 },
};

export const PHASES: { id: PhaseId; title: string }[] = [
  { id: 'backlog', title: 'Backlog' },
  { id: 'prefab', title: 'Prefab' },
  { id: 'build', title: 'Build' },
  { id: 'paint', title: 'Painting' },
  { id: 'outsource', title: 'Outsourcing' },
  { id: 'trim', title: 'Trim' },
  { id: 'shipping', title: 'Shipping' },
];

// Target Hours breakdown per Model (Randomly assumed as requested)
export const MODEL_TARGET_HOURS: Record<string, Record<PhaseId, number>> = {};

// Generator for target hours
export const MODEL_CATEGORIES = [
  { 
    name: 'Reel Trailers', 
    models: ['LRG 1010', 'LRG 1010R', 'LRG 1008', 'LRG 0320', 'LRE 0103S', 'LRE 0214', 'LRS 0114', 'LRS 0320', 'LRGE 1007', 'LRF 1014'] 
  },
  { 
    name: 'Drone Trailers (LAD)', 
    models: ['LAD 2016', 'LAD 2420', 'LAD 2424 Bumper', 'LAD 2424 Gooseneck'] 
  },
  { 
    name: 'Pole Trailers (LPT)', 
    models: ['LPT 3055', 'LPT 3547', 'LPT 4055', 'LPT 4260', 'LPT 5050'] 
  },
  { 
    name: 'Pipe Trailers', 
    models: ['LSP 3040G (Stick)', 'LCP 0807 (Self-Loading)', 'LCV 0406 (Vertical)'] 
  },
  { 
    name: 'Specialty & Equipment', 
    models: ['LMT Series (Material)', 'LTM 1207 (Equipment)', 'Dump Trailer Standard', 'Custom Engineering'] 
  }
];

MODEL_CATEGORIES.forEach(cat => {
  cat.models.forEach(model => {
    // Standardized fixed values based on model categories
    let baseHours: Record<PhaseId, number> = {
      backlog: 0,
      prefab: 24,
      build: 80,
      paint: 24,
      outsource: 168,
      trim: 24,
      shipping: 24,
    };

    if (cat.name.includes('Reel Trailers')) {
      baseHours = { ...baseHours, prefab: 30, build: 120, paint: 30, trim: 24, shipping: 16 };
    } else if (cat.name.includes('Drone Trailers')) {
      baseHours = { ...baseHours, prefab: 40, build: 160, paint: 40, trim: 30, shipping: 24 };
    } else if (cat.name.includes('Pole Trailers')) {
      baseHours = { ...baseHours, prefab: 35, build: 140, paint: 35, trim: 24, shipping: 20 };
    } else if (cat.name.includes('Pipe Trailers')) {
      baseHours = { ...baseHours, prefab: 28, build: 100, paint: 28, trim: 20, shipping: 16 };
    } else if (cat.name.includes('Specialty')) {
      baseHours = { ...baseHours, prefab: 50, build: 200, paint: 50, trim: 40, shipping: 32 };
    }

    // Boost for Goosenecks or heavy custom units
    if (model.includes('Gooseneck') || model.includes('4260') || model.includes('5050')) {
      baseHours.build *= 1.25;
      baseHours.prefab *= 1.25;
    }

    // Backlog itself has 0 work-hours; production begins in Prefab
    baseHours.backlog = 0;
    
    MODEL_TARGET_HOURS[model] = baseHours;
  });
});

export const ALL_MODELS = MODEL_CATEGORIES.flatMap(cat => cat.models);

export interface ModelSpec {
  steelWeight?: string;
  description?: string;
  axles?: string;
}

export interface CatalogModel {
  id: string;
  name: string;
  category: string;
  target_hours: Record<PhaseId, number>;
  specs: ModelSpec;
}

/**
 * Calculates the total remaining build hours for a trailer from its current phase to shipping.
 * Accounts for finished types (Paint vs. Outsource) and current phase progress.
 */
export function calculateTrailerRemainingHours(trailer: Trailer, hoursConfig?: Record<string, Record<PhaseId, number>>): number {
  const phaseOrder: PhaseId[] = ['backlog', 'prefab', 'build', 'paint', 'outsource', 'trim', 'shipping'];
  const currentIndex = phaseOrder.indexOf(trailer.currentPhase);
  if (currentIndex === -1) return 0;

  const relevantPhases = phaseOrder.slice(currentIndex);
  let total = 0;

  relevantPhases.forEach(pId => {
    if (pId === 'shipping' && trailer.currentPhase !== 'shipping') return;

    // Skip irrelevant finishing phase ONLY if an explicit override is set
    if (trailer.finishingType === 'Outsource' && pId === 'paint') return;
    if (trailer.finishingType === 'Paint' && pId === 'outsource') return;

    const config = hoursConfig || MODEL_TARGET_HOURS;
    const target = config[trailer.model]?.[pId] || PHASE_METADATA[pId].defaultTargetHours;
    
    // Check for manual hours in history
    const log = trailer.history.find(h => h.phase === pId);
    if (pId === trailer.currentPhase && log) {
      const loggedHours = log.phaseManualHours || log.bayManualHours || 0;
      total += Math.max(0, target - loggedHours);
    } else {
      total += target;
    }
  });

  return total;
}
