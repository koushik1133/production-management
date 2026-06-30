import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import winston from 'winston';
import dotenv from 'dotenv';

// Load Environment Variables
dotenv.config();

const PORT = process.env.PORT || 3001;
const SMB_MOUNT_PATH = process.env.SMB_MOUNT_PATH || path.join(__dirname, '../files_fallback');
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || '';

// Winston Logger Setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// Create Fallback Storage Directory if it doesn't exist
if (!fs.existsSync(SMB_MOUNT_PATH)) {
  fs.mkdirSync(SMB_MOUNT_PATH, { recursive: true });
  logger.info(`Created local fallback storage directory at: ${SMB_MOUNT_PATH}`);
} else {
  logger.info(`Storage mount directory verified at: ${SMB_MOUNT_PATH}`);
}

// Supabase client initialization (Service role to update metadata directly)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const app = express();

// Trust proxy headers for express-rate-limit when running behind proxies like ngrok
app.set('trust proxy', 1);

// Security Headers
app.use(helmet());

// CORS Setup
app.use(cors({
  origin: '*', // Adjust to your production Vercel domain if strictly needed
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Global Rate Limiting: 100 requests per 15 minutes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests from this client, please try again later.' }
});
app.use(limiter);

// Custom interface for Request with user info
interface AuthenticatedRequest extends Request {
  user?: any;
}

// JWT Token Authentication Middleware
const authenticateJWT = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn(`Unauthorized access attempt to: ${req.path}`);
    res.status(401).json({ error: 'Access token missing or invalid format' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    // Call Supabase Auth directly to verify the token securely regardless of algorithm (ES256/HS256)
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      logger.error(`Supabase token verification failed: ${error?.message || 'No user returned'}`);
      res.status(403).json({ error: 'Invalid or expired session token' });
      return;
    }

    req.user = user;
    next();
  } catch (error: any) {
    logger.error(`Auth middleware exception: ${error.message}`);
    res.status(403).json({ error: 'Invalid or expired session token' });
  }
};

// Allowed MIME Types
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel',
  'text/csv',
  'application/octet-stream' // Fallback for browsers that fail to parse Excel mime types properly
];

// Multer Storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const category = req.body.category || 'misc';
    const id = req.body.id || 'unassigned';
    const serialNumber = req.body.serialNumber || id;

    let subFolder = category;
    if (['photos', 'inspections', 'trailers', 'shipped', 'misc'].includes(category)) {
      subFolder = path.join('media', serialNumber);
    } else if (category === 'templates') {
      subFolder = 'templates';
    }

    const destinationPath = path.join(SMB_MOUNT_PATH, subFolder);

    // Prevent Directory Traversal in category property
    const normalizedDest = path.normalize(destinationPath);
    if (!normalizedDest.startsWith(path.normalize(SMB_MOUNT_PATH))) {
      return cb(new Error('Invalid destination category path'), '');
    }

    if (!fs.existsSync(normalizedDest)) {
      fs.mkdirSync(normalizedDest, { recursive: true });
    }
    cb(null, normalizedDest);
  },
  filename: (req, file, cb) => {
    const category = req.body.category || 'misc';
    const id = req.body.id || 'unassigned';
    const serialNumber = req.body.serialNumber || id;
    const type = req.body.type || '';
    const ext = path.extname(file.originalname).toLowerCase();

    let name = '';
    if (type.startsWith('photo_1')) {
      name = `photo_1${ext}`;
    } else if (type.startsWith('photo_2')) {
      name = `photo_2${ext}`;
    } else if (type.startsWith('photo_3')) {
      name = `photo_3${ext}`;
    } else if (type === 'inspection_sheet') {
      name = `${serialNumber}_InspectionSheet${ext}`;
    } else if (type === 'spec_sheet') {
      name = `${serialNumber}_Final-SpecSheet${ext}`;
    } else if (category === 'templates' || type === 'spec_sheet_template') {
      name = `${serialNumber}${ext}`;
    } else {
      name = `${serialNumber}-${Date.now()}${ext}`;
    }
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB file size limit
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type rejected. Allowed types: Images, PDFs, Excel sheets, and CSVs.`));
    }
  }
});

// --- API ENDPOINTS ---

// 1. HEALTH MONITOR
app.get('/api/health', (req: Request, res: Response) => {
  let shareStatus = 'offline';
  try {
    fs.accessSync(SMB_MOUNT_PATH, fs.constants.W_OK);
    shareStatus = 'online';
  } catch (err) {
    logger.error(`Storage directory status check failed: ${err}`);
  }

  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    storage: {
      status: shareStatus,
      path: SMB_MOUNT_PATH
    }
  });
});

// 2. FILE UPLOAD
app.post('/api/upload', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  upload.single('file')(req, res, async (err: any) => {
    if (err) {
      logger.error(`Multer upload configuration error: ${err.message}`);
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file attachment detected' });
    }

    const { id, type, table } = req.body;
    if (!id || !type || !table) {
      // Remove uploaded file if required parameters are missing
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Missing id, type, or table parameter' });
    }

    const relativePath = path.relative(SMB_MOUNT_PATH, req.file.path);
    const serverPath = req.file.path;

    try {
      // Role claims authorization verification
      const userRole = req.user.user_metadata?.role || req.user.role;
      if (userRole !== 'manager' && req.user.role !== 'authenticated') {
        fs.unlinkSync(serverPath);
        return res.status(403).json({ error: 'Access denied: Managers only' });
      }

      // Map columns correctly to match trailers/shipped tables
      let updatePayload: Record<string, string> = {};

      // Clean up old files in the same directory with the same base name but different extensions
      const directory = path.dirname(serverPath);
      const filename = path.basename(serverPath);
      const ext = path.extname(filename);
      const baseName = path.basename(filename, ext);

      if (fs.existsSync(directory)) {
        const files = fs.readdirSync(directory);
        for (const f of files) {
          if (f !== filename && f.startsWith(baseName)) {
            const oldFilePath = path.join(directory, f);
            try {
              fs.unlinkSync(oldFilePath);
              logger.info(`Cleaned up old/replaced file: ${f}`);
            } catch (unlinkErr: any) {
              logger.error(`Failed to clean up old file ${f}: ${unlinkErr.message}`);
            }
          }
        }
      }
      if (type === 'photo_1' || type === 'photo_1_url') updatePayload = { photo_1_url: relativePath };
      else if (type === 'photo_2' || type === 'photo_2_url') updatePayload = { photo_2_url: relativePath };
      else if (type === 'photo_3' || type === 'photo_3_url') updatePayload = { photo_3_url: relativePath };
      else if (type === 'spec_sheet') updatePayload = { spec_sheet_file: relativePath };
      else if (type === 'inspection_sheet') updatePayload = { inspection_sheet_file: relativePath };
      else if (type === 'spec_sheet_template') updatePayload = { spec_sheet_template: relativePath };
      else {
        fs.unlinkSync(serverPath);
        return res.status(400).json({ error: 'Invalid document upload type parameter' });
      }

      // Handle matching primary key column name
      const primaryKeyCol = table === 'shipped_trailers' ? 'serial_number' : 'id';

      // Update metadata path directly in Supabase using the admin service client
      const { error } = await supabaseAdmin
        .from(table)
        .update(updatePayload)
        .eq(primaryKeyCol, id);

      if (error) {
        fs.unlinkSync(serverPath);
        throw error;
      }

      logger.info(`[AUDIT] File uploaded by ${req.user.email}: ${relativePath} (${req.file.size} bytes)`);

      res.status(201).json({
        message: 'Upload completed',
        filePath: relativePath,
        fileName: req.file.filename
      });
    } catch (dbError: any) {
      logger.error(`Database record updates failed: ${dbError.message}`);
      res.status(500).json({ error: 'Saving metadata to database failed.' });
    }
  });
});

// 3. FILE DOWNLOAD
app.get('/api/download', authenticateJWT, (req: AuthenticatedRequest, res: Response): void => {
  const relativePath = req.query.path as string;
  if (!relativePath) {
    res.status(400).json({ error: 'File path query parameter is required' });
    return;
  }

  // Defend against Directory Traversal attacks
  const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\))+/, '');
  const absoluteFilePath = path.join(SMB_MOUNT_PATH, safePath);

  // Validate the absolute path is strictly nested inside SMB folder
  if (!absoluteFilePath.startsWith(path.normalize(SMB_MOUNT_PATH))) {
    logger.warn(`Potential directory traversal blocked: ${relativePath} from ${req.user.email}`);
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  if (!fs.existsSync(absoluteFilePath)) {
    res.status(404).json({ error: 'File not found on storage server' });
    return;
  }

  logger.info(`[AUDIT] File downloaded by ${req.user.email}: ${safePath}`);
  res.download(absoluteFilePath, path.basename(absoluteFilePath));
});

// 4. FILE DELETION
app.delete('/api/file', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const { path: relativePath, table, id, column } = req.body;

  if (!relativePath || !table || !id || !column) {
    return res.status(400).json({ error: 'Missing path, table, id, or column parameter' });
  }

  // Guard: Managers only can delete
  const userRole = req.user.user_metadata?.role || req.user.role;
  if (userRole !== 'manager') {
    return res.status(403).json({ error: 'Access denied: Managers only' });
  }

  const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\))+/, '');
  const absoluteFilePath = path.join(SMB_MOUNT_PATH, safePath);

  if (!absoluteFilePath.startsWith(path.normalize(SMB_MOUNT_PATH))) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    // Delete file if it exists on disk
    if (fs.existsSync(absoluteFilePath)) {
      fs.unlinkSync(absoluteFilePath);
      logger.info(`Deleted file from network share: ${safePath}`);
    }

    const primaryKeyCol = table === 'shipped_trailers' ? 'serial_number' : 'id';

    // Clear column link in database
    const { error } = await supabaseAdmin
      .from(table)
      .update({ [column]: null })
      .eq(primaryKeyCol, id);

    if (error) throw error;

    logger.info(`[AUDIT] File metadata link deleted by ${req.user.email}: ${safePath}`);
    res.json({ message: 'File and metadata deleted successfully' });
  } catch (err: any) {
    logger.error(`File deletion failed: ${err.message}`);
    res.status(500).json({ error: 'Failed to process file deletion' });
  }
});

// Start API Server
app.listen(PORT, () => {
  logger.info(`Local Storage Gateway server started successfully on port: ${PORT}`);
});
