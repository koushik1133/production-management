# 🏭 LT - Production & Labor Management System

[![Live Demo](https://img.shields.io/badge/Live_Demo-Online-brightgreen?style=for-the-badge&logo=vercel)](https://production-management-murex.vercel.app)
[![TypeScript](https://img.shields.io/badge/TypeScript-91.8%25-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![React 19](https://img.shields.io/badge/React_19-Vite-61dafb?style=for-the-badge&logo=react)](https://react.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Realtime_PostgreSQL-3ecf8e?style=for-the-badge&logo=supabase)](https://supabase.com/)

> An enterprise Manufacturing Execution System (MES) and labor pipeline manager designed for heavy-equipment assembly floors. Features real-time multi-user drag-and-drop Kanban tracking, shop floor station matrix routing, automated Excel spec sheet injection, Web Push tablet alarms, and live TV broadcast displays.

---

> [!IMPORTANT]
> ### ⚠️ Public Demo & Sandbox Notice
> * **Demonstration Environment**: This public repository and its live deployment represent a **portfolio demo / sandbox preview**.
> * **Mock / Synthetic Data**: All serial numbers, dealer names, pricing figures, and customer entries shown in this sandbox environment are **fictitious sample data** used exclusively for demonstration.
> * **Feature Limitations & Security Safeguards**:
>   * Corporate single sign-on (Azure AD / Entra ID enterprise tenant) is replaced with standard sandbox authentication.
>   * Live production database clusters are disconnected; the demo runs on an isolated staging Supabase sandbox.
>   * Administrative write operations (destructive catalog deletions, master PIN resets, and company-wide broadcast commands) are sandboxed or restricted under Row-Level Security (RLS) policies.
>   * Shop-floor physical tablet alarms operate in simulated preview mode.

---

## 🔗 Live Sandbox Test Link

👉 **Explore the Live Demo:** [**production-management-murex.vercel.app**](https://production-management-murex.vercel.app)

---

## 🛠️ Tech Stack

### **Frontend & Architecture**
* **Framework**: [React 19](https://react.dev/) with [TypeScript](https://www.typescriptlang.org/)
* **Build Tool**: [Vite](https://vitejs.dev/)
* **Routing**: [React Router v6](https://reactrouter.com/) (`react-router-dom`)
* **Icons**: [Lucide React](https://lucide.dev/)
* **Date Utilities**: [date-fns](https://date-fns.org/)

### **Styling & UI Experience**
* **Design System**: High-contrast Dark Mode with Glassmorphism, dynamic gradients, responsive grid reflows, micro-animations, and shop-floor high-visibility badges.
* **Layout Engine**: Pure modern CSS custom properties with responsive mobile & tablet breakpoints.

### **Backend, Database & Real-Time Sync**
* **Database**: [Supabase PostgreSQL](https://supabase.com/) with Row-Level Security (RLS)
* **Realtime Engine**: Supabase Realtime Channels (WebSockets for sub-50ms multi-screen sync across factory floor monitors)
* **Storage**: Supabase Storage Buckets for document handling (Excel Spec Sheets, Inspection Checklists, Unit Photos)

### **Drag-and-Drop (DnD) Engine**
* **Library**: [@dnd-kit/core](https://dndkit.com/) & [@dnd-kit/sortable]
* **Collision Detection**: Custom hybrid collision strategy (`rectIntersection` + `pointerWithin` + `closestCorners`) with zero-loop index guards for glitch-free touch and desktop card reordering.

### **Document Automation & Excel Engine**
* **Spreadsheet Engine**: [ExcelJS](https://github.com/exceljs/exceljs) + [JSZip](https://stuk.github.io/jszip/)
* **Dynamic Injection**: Client-side parsing and dynamic cell substitution on raw `.xlsx` templates for instant Quote and Spec Sheet compilation.

---

## 🗺️ Application Views & Modules

| Route | Module | Purpose |
| :--- | :--- | :--- |
| **`/`** | **Dashboard (Kanban Pipeline)** | Interactive production pipeline divided into phases (`PREFAB`, `BUILD`, `PAINT`, `OUTSOURCE`, `TRIM`). Features real-time drag-and-drop ordering, remaining labor hours calculation, priority markers, and trailer inspection modals. |
| **`/stations`** | **Bays (Station Allocations)** | Physical factory bay matrix (`Bay 1`, `Bay 2`, `Bay 3`, `Bay 4`) with live capacity monitoring, bottleneck indicators, and station reassignment. |
| **`/backlog`** | **Backlog & Registration** | Order queue and unit registration with auto-incremented serial allocation, dealer selection, and instant Excel quote generation. |
| **`/schedule`** | **Timeline & Scheduling** | Workload scheduling horizon with target completion forecasts, promised ship dates, and runway capacity analysis. |
| **`/catalog`** | **Model & Dealer Catalog** | Central catalog for trailer models, target labor hours per phase, spec options, and dealer branch locations *(Manager Access)*. |
| **`/archive`** | **Shipping Archive** | Permanent searchable log of all completed and shipped units with ZIP export for spec sheets and inspection photos. |
| **`/find-my`** | **Find My Tablets** | 24/7 tablet locator system utilizing Web Push notifications, screen wake locks, and dual-engine sonar alarms. |
| **`/messages`** | **Internal Floor Chat** | Real-time messaging suite with audio voice notes and attachment sharing for factory floor communications. |
| **`/tv`** | **TV Floor Display Mode** | High-contrast, auto-scrolling monitor view optimized for wall-mounted TVs and Google Cast displays. |

---

## ⚡ Key Highlights

1. **Sub-50ms Real-Time Collaboration**: Updates made by one station instantly reflect on all other tablets, office managers, and floor TVs without manual page refreshing.
2. **Dynamic Spreadsheet Compilation**: Fills complex proprietary Excel templates entirely in the browser and triggers instant downloads.
3. **Manager PIN Protection**: Financial values (sales margins, base costs, dealer invoices) are protected behind global manager PIN authorization.
4. **Resilient Offline & Screen-Off Alarms**: Dual-engine audio synthesizer + Web Push notification service worker triggers tablets even when locked.

---

## 🚀 Local Development Setup

### **Prerequisites**
* [Node.js](https://nodejs.org/) (v18 or higher)
* `npm` or `pnpm`

### **Installation**

1. **Clone the repository:**
   ```bash
   git clone https://github.com/koushik1133/production-management.git
   cd production-management
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env.local` file in the project root:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

4. **Start the local development server:**
   ```bash
   npm run dev
   ```

5. **Build for production:**
   ```bash
   npm run build
   ```

---

## 📄 License & Attribution

Designed and engineered by **[koushik1133](https://github.com/koushik1133)**.  
*This demo build is published for portfolio presentation and demonstration purposes.*
