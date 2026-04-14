export type PhaseId = 'backlog' | 'prefab' | 'build' | 'paint' | 'outsource' | 'trim' | 'shipping';

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
  expectedDueDate?: string;
  promisedShippingDate?: string;
}

export const STATIONS: StationId[] = ['B1', 'B2', 'B3', 'B4'];

export const BAY_WEEKLY_HOURS: Partial<Record<StationId, number>> = {
  B1: 40,
  B2: 80,
  B3: 80,
  B4: 40,
};

export const PHASE_METADATA: Record<PhaseId, { title: string; defaultTargetHours: number }> = {
  backlog: { title: 'Backlog', defaultTargetHours: 72 },
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
    // Deterministic random generator seeded by the model name
    let seed = 0;
    for (let i = 0; i < model.length; i++) {
      seed = model.charCodeAt(i) + ((seed << 5) - seed);
    }
    // Ensure seed is positive to avoid negative hours
    seed = Math.abs(seed);

    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    const prefabHours = Math.floor(20 + rand() * 20); // 20-40 hours
    MODEL_TARGET_HOURS[model] = {
      backlog: prefabHours,
      prefab: prefabHours,
      build: Math.floor(80 + rand() * 80),    // 80-160 hours (Realistic for major build)
      paint: Math.floor(20 + rand() * 20),    // 20-40 hours
      outsource: 0, 
      trim: Math.floor(15 + rand() * 15),     // 15-30 hours
      shipping: Math.floor(8 + rand() * 8),   // 8-16 hours
    };
    
    // Boost hours for Goosenecks, specialties, or specialty trailers
    if (model.includes('Gooseneck') || model.includes('Specialty') || model.includes('Engineering') || model.includes('3547') || model.includes('4260')) {
       MODEL_TARGET_HOURS[model].build *= 1.5;
       MODEL_TARGET_HOURS[model].prefab *= 1.5;
    }
  });
});

export const ALL_MODELS = MODEL_CATEGORIES.flatMap(cat => cat.models);
