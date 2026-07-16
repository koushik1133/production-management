export type PhaseId = 'quote' | 'backlog' | 'prefab' | 'build' | 'paint' | 'outsource' | 'trim' | 'shipping';
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

export interface SpecSheetVersion {
  id: string;
  timestamp: string; // ISO date string
  file: string; // Supabase Storage path or legacy base64 string
  filename?: string;
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
  vertical_order?: number;
  bay_vertical_order?: number;
  photo_1_url?: string | null;
  photo_2_url?: string | null;
  photo_3_url?: string | null;
  sale_price?: number | null;
  spec_sheet_file?: string | null;
  inspection_sheet_file?: string | null;
  spec_sheet_versions?: SpecSheetVersion[];
  trailer_color?: string;
  trailer_plug?: string;
  salesPerson?: string;
  dealerLocation?: string;
  dealerCommonAddress?: string;
  dealerId?: string;
  purchaseOrder?: string;
  consignment?: string;
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
  spec_sheet_file?: string;
  inspection_sheet_file?: string;
}

export interface Dealer {
  id: string;
  name: string;
  addresses?: string[];
  common_address?: string;
}

export const STATIONS: StationId[] = ['B1', 'B2', 'B3', 'B4'];

export const BAY_WEEKLY_HOURS: Partial<Record<StationId, number>> = {
  B1: 40,
  B2: 80,
  B3: 80,
  B4: 40,
};

export const PHASE_METADATA: Record<PhaseId, { title: string; defaultTargetHours: number }> = {
  quote: { title: 'Pending Quote', defaultTargetHours: 0 },
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

export const MODEL_CATEGORIES: { name: string, models: string[] }[] = [];
export const ALL_MODELS: string[] = [];

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
  spec_sheet_template?: string;
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
    const log = trailer.history.slice().reverse().find(h => h.phase === pId);
    if (pId === trailer.currentPhase && log) {
      const loggedHours = log.phaseManualHours || log.bayManualHours || 0;
      total += Math.max(0, target - loggedHours);
    } else {
      total += target;
    }
  });

  return total;
}
