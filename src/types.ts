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
  targetHours?: number;
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
  shipping_cost?: number | null;
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
  shipping_cost?: number;
  spec_sheet_file?: string;
  inspection_sheet_file?: string;
}

export interface QuoteRecord {
  id: string;
  trailer_id?: string | null;
  serial_number: string;
  model?: string;
  dealer_name?: string;
  sale_price?: number | null;
  trailer_color?: string;
  trailer_plug?: string;
  sales_person?: string;
  dealer_location?: string;
  dealer_address?: string;
  purchase_order?: string;
  consignment?: string;
  quote_file_path?: string | null;
  status?: string;
  created_at?: string;
  notes?: string;
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
 * Uses per-trailer manual hours if entered (phaseManualHours / bayManualHours),
 * and automatically falls back to catalog template target hours for any phase not manually set.
 */
export function calculateTrailerRemainingHours(trailer: Trailer, hoursConfig?: Record<string, Record<PhaseId, number>>): number {
  const phaseOrder: PhaseId[] = ['backlog', 'prefab', 'build', 'paint', 'outsource', 'trim', 'shipping'];
  const currentIndex = phaseOrder.indexOf(trailer.currentPhase);
  if (currentIndex === -1) return 0;

  const relevantPhases = phaseOrder.slice(currentIndex);
  let total = 0;

  relevantPhases.forEach(pId => {
    if (pId === 'shipping' && trailer.currentPhase !== 'shipping') return;

    // Skip irrelevant finishing phase
    if (trailer.finishingType === 'Outsource' && pId === 'paint') return;
    if (trailer.finishingType === 'Paint' && pId === 'outsource') return;

    // 1. Check if trailer has custom manual hours entered for this phase
    const manualHours = (trailer.history ?? [])
      .filter(h => h.phase === pId)
      .reduce((sum, h) => {
        if (h.phaseManualHours !== undefined || h.bayManualHours !== undefined) {
          return sum + (h.phaseManualHours ?? h.bayManualHours ?? 0);
        }
        return sum;
      }, 0);

    // 2. Otherwise fall back to custom saved target hours or catalog model template target hours
    const savedTarget = (trailer.history ?? []).slice().reverse().find(h => h.phase === pId && h.targetHours !== undefined)?.targetHours;
    const templateHours = (savedTarget !== undefined && savedTarget > 0)
      ? savedTarget
      : (hoursConfig?.[trailer.model]?.[pId] ?? MODEL_TARGET_HOURS[trailer.model]?.[pId] ?? PHASE_METADATA[pId]?.defaultTargetHours ?? 0);

    const effectiveTargetHours = manualHours > 0 ? manualHours : templateHours;

    if (pId === trailer.currentPhase) {
      // Current phase progress: check if time spent or manual progress
      const curLog = (trailer.history ?? []).slice().reverse().find(h => h.phase === pId && !h.exitedAt);
      if (curLog && !manualHours) {
        const safeEnteredAt = (curLog.enteredAt && Number.isFinite(curLog.enteredAt)) ? curLog.enteredAt : Date.now();
        const elapsedHours = (Date.now() - safeEnteredAt) / (1000 * 60 * 60);
        total += Math.max(0, effectiveTargetHours - elapsedHours);
      } else {
        total += Math.max(0, effectiveTargetHours);
      }
    } else {
      total += Math.max(0, effectiveTargetHours);
    }
  });

  return Number.isFinite(total) ? Math.max(0, total) : 0;
}

export interface ModelPhaseStats {
  avg: number | null;
  count: number;
  total: number;
}

/**
 * Calculates the actual average production hours entered per phase across all trailers of a given model.
 * Inspects both active trailers (phaseManualHours / bayManualHours) and shipped trailers.
 * Deduplicates by serial number to ensure no trailer is counted twice.
 */
export function getModelPhaseAverages(
  modelName: string,
  trailers: Trailer[] = [],
  shippedTrailers: ShippedTrailer[] = []
): Record<PhaseId, ModelPhaseStats> {
  const normModel = (modelName || '').trim().toLowerCase();
  const phases: PhaseId[] = ['quote', 'backlog', 'prefab', 'build', 'paint', 'outsource', 'trim', 'shipping'];

  const result: Record<PhaseId, ModelPhaseStats> = {
    quote: { avg: null, count: 0, total: 0 },
    backlog: { avg: null, count: 0, total: 0 },
    prefab: { avg: null, count: 0, total: 0 },
    build: { avg: null, count: 0, total: 0 },
    paint: { avg: null, count: 0, total: 0 },
    outsource: { avg: null, count: 0, total: 0 },
    trim: { avg: null, count: 0, total: 0 },
    shipping: { avg: null, count: 0, total: 0 }
  };

  if (!normModel) return result;

  phases.forEach(phaseId => {
    const serialHoursMap = new Map<string, number>();

    // 1. Scan shipped trailers for completed units with entered hours
    shippedTrailers.forEach(s => {
      if ((s.trailer_name || '').trim().toLowerCase() !== normModel) return;
      const serial = (s.serial_number || '').trim();
      if (!serial || serialHoursMap.has(serial)) return;

      let shippedPhaseHours = 0;
      if (phaseId === 'prefab') shippedPhaseHours = s.prefab_hours ?? 0;
      else if (phaseId === 'build') shippedPhaseHours = s.build_hours ?? 0;
      else if (phaseId === 'paint') shippedPhaseHours = s.paint_hours ?? 0;
      else if (phaseId === 'outsource') shippedPhaseHours = s.outsource_hours ?? 0;
      else if (phaseId === 'trim') shippedPhaseHours = s.trim_hours ?? 0;

      // Only count if genuine hours were entered (> 0)
      if (shippedPhaseHours > 0) {
        serialHoursMap.set(serial, shippedPhaseHours);
      }
    });

    // 2. Scan archived (completed) trailers from trailers table if not already in shipped_trailers
    trailers.forEach(t => {
      if ((t.model || '').trim().toLowerCase() !== normModel || t.isDeleted || !t.isArchived) return;
      const serial = (t.serialNumber || t.id || '').trim();
      if (!serial || serialHoursMap.has(serial)) return;

      const entries = (t.history ?? []).filter(h => h.phase === phaseId);
      const lastEntry = entries.slice().reverse().find(
        h => (h.phaseManualHours !== undefined && h.phaseManualHours > 0) ||
             (h.bayManualHours !== undefined && h.bayManualHours > 0)
      );

      if (lastEntry) {
        const val = lastEntry.phaseManualHours ?? lastEntry.bayManualHours ?? 0;
        if (val > 0) {
          serialHoursMap.set(serial, val);
        }
      }
    });

    const values = Array.from(serialHoursMap.values());
    if (values.length > 0) {
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = Math.round((sum / values.length) * 10) / 10;
      result[phaseId] = {
        avg,
        count: values.length,
        total: Math.round(sum * 10) / 10
      };
    }
  });

  return result;
}

