# Storage Gateway Service & Migration Documentation

This service replaces direct Supabase Storage/Base64 database storage with a local, highly secure Express Storage Gateway. It routes file uploads/downloads/deletions directly to a company intranet network share (SMB mount), while retaining Supabase for authentication, real-time sync, and database metadata.

## Table of Contents
1. [Architecture Diagram](#1-architecture-diagram)
2. [Deployment Guide](#2-deployment-guide)
3. [Environment Variables](#3-environment-variables)
4. [Backup & Recovery Procedures](#4-backup--recovery-procedures)
5. [Operational Runbook](#5-operational-runbook)

---

## 1. Architecture Diagram

```mermaid
graph TD
    subgraph LAN (Intranet Zone)
        A[Vite React Frontend Web App]
        B[Local Storage Gateway Express API]
        C[Windows Shared Drive / Mounted SMB Share]
        
        A -->|1. Authenticate / Login| D[Supabase Auth]
        A -->|2. Upload/Download/Delete File with JWT| B
        B -->|3. Validate Supabase JWT token claims| D
        B -->|4. Read/Write file to SMB Mount path| C
        B -->|5. Update relative file path metadata| E[Supabase PostgreSQL DB]
        A -->|6. Real-time updates & notifications| F[Supabase Realtime]
    end
```

---

## 2. Deployment Guide

The Storage Gateway runs on an on-premise server with access to both the intranet network share and the internet (to check JWT claims with Supabase).

### Prerequisites
- Node.js (v18 or higher)
- SMB Mount access (read/write permissions for the user account running this Node.js process)
- A Cloudflare Tunnel or local proxy to expose the gateway securely to the React App (if hosted in the cloud, e.g. Vercel)

### Setup Steps
1. Navigate to the gateway directory:
   ```bash
   cd storage-gateway
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` configuration file (see details below).
4. Build the TypeScript application:
   ```bash
   npm run build
   ```
5. Run the service using PM2 or Node:
   ```bash
   npm run start
   ```

---

## 3. Environment Variables

Create a `.env` file in the root of the `storage-gateway` directory:

```env
# Server Configuration
PORT=3001
NODE_ENV=production

# Storage Location
# Path to the mounted network share or fallback directory.
# Windows paths (e.g. \\server\share) or Unix paths (e.g. /mnt/share) are supported.
SMB_MOUNT_PATH=/path/to/mounted/network/share

# Supabase Settings
SUPABASE_URL=https://your-supabase-project-id.supabase.co
# Service Role key is required to update metadata tables bypassing RLS constraints.
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
# Secret used to verify and unpack the Supabase JWT tokens.
SUPABASE_JWT_SECRET=your-supabase-jwt-token-secret
```

---

## 4. Backup & Recovery Procedures

### File System Backup
1. **Cron Backup**: Configure a daily incremental backup of the `SMB_MOUNT_PATH` volume to an offsite secure storage server.
2. **Snapshot Policy**: Enable weekly read-only snapshots on the network share storage controller.

### Recovery
In the event of network drive failure:
1. Re-mount the backup storage mount path.
2. Verify read/write permissions for the service user.
3. Update the `SMB_MOUNT_PATH` variable in the gateway's `.env` if the mount point changed.
4. Restart the service.

---

## 5. Operational Runbook

### Health Monitoring
The gateway exposes a health probe at `GET /api/health`. It verifies:
- Uptime
- Storage directory write status (`online` / `offline`)

Example response:
```json
{
  "status": "healthy",
  "uptime": 14502.3,
  "storage": {
    "status": "online",
    "path": "/mnt/shared-drive/files"
  }
}
```

### Log Management
- Logs are structured JSON formats managed via Winston.
- **Combined Logs**: Saved to `logs/combined.log`.
- **Error logs**: Filtered and saved to `logs/error.log`.
- **Security Audit Logs**: Track all authenticated downloads, uploads, and deletions prefixing `[AUDIT]`.

### Emergency Troubleshooting
- **Network Share Unreachable**: The health probe returns `"status": "offline"` for storage. Check local network connectivity, domain permissions, and mount commands.
- **JWT Errors**: Check if the `SUPABASE_JWT_SECRET` is synchronized with your Supabase console auth settings.
- **Upload Failures**: Check if client payloads exceed the configured `50MB` size limit or if the MIME type is not allowed (images, PDFs, xlsx, and CSVs only).
