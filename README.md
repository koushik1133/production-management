# LT - Production & Sales Management System

A high-performance, real-time web application built for **Lane Trailers** to manage trailer manufacturing pipelines, bay allocations, backlog registrations, dealer networks, quote generation, and shipping archives.

---

## 🛠️ Tech Stack

### **Frontend & Framework**
* **Framework**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
* **Build Tool**: [Vite](https://vitejs.dev/)
* **Routing**: [React Router v6](https://reactrouter.com/) (`react-router-dom`)
* **Icons**: [Lucide React](https://lucide.dev/) (`lucide-react`)
* **Date Utilities**: [date-fns](https://date-fns.org/)

### **Styling & Aesthetics**
* **CSS Architecture**: Modern Vanilla CSS with CSS Custom Properties (Variables)
* **Design System**: Sleek Dark Mode with Glassmorphism, dynamic gradients, responsive grids, micro-interactions, and high-visibility status indicators.

### **Backend, Database & Real-Time Sync**
* **Database**: [Supabase PostgreSQL](https://supabase.com/)
* **Real-time Engine**: Supabase Realtime Channels (WebSockets for multi-user live board syncing)
* **File Storage**: Supabase Storage Buckets (`trailers-files`) for document uploads (Spec Sheets, Inspection Sheets, Trailer Photos)

### **Drag-and-Drop (DND)**
* **DND Engine**: [@dnd-kit/core](https://dndkit.com/) & [@dnd-kit/sortable]
* **Collision Strategy**: Custom hybrid collision detection (`rectIntersection` + `pointerWithin` + `closestCorners`) with zero-loop index guards for responsive touch and desktop card reordering.

### **Excel Processing & Document Generation**
* **Excel Engine**: [ExcelJS](https://github.com/exceljs/exceljs) + [JSZip](https://stuk.github.io/jszip/)
* **Dynamic Injection**: Automated parsing of `.xlsx` model templates with dynamic cell label replacement (Customer Name, Serial Number, Salesperson, Specs) for instant Quote and Spec Sheet generation.

---

## 🗺️ Application Navigation & Views

| Route | View Name | Description |
| :--- | :--- | :--- |
| **`/`** | **Dashboard (Kanban Pipeline)** | Main interactive production board divided into manufacturing phases (`PREFAB`, `BUILD`, `PAINT`, `OUTSOURCE`, `TRIM`). Features real-time drag-and-drop ordering, remaining workload hours, priority flags, and trailer details. |
| **`/stations`** | **Bays (Station Allocations)** | Production bay matrix view mapping trailers to physical factory bays (`B1`, `B2`, `B3`, `B4`). Includes customizable bay capacities and live floor tracking. |
| **`/backlog`** | **Backlog & Registration** | Queue management and unit registration. Allows registering new trailer orders, auto-assigning serial numbers, selecting dealer locations, and generating custom Excel quotes. |
| **`/schedule`** | **Timeline & Scheduling** | Time-horizon scheduling view displaying estimated completion dates, promised shipping deadlines, and runway capacity analysis across weeks. |
| **`/catalog`** | **Model & Dealer Catalog** | Centralized management hub for trailer models, target production hours per phase, spec configurations, Excel templates, and dealer branch locations *(Manager Access Only)*. |
| **`/archive`** | **Shipping Archive** | Complete historical record of all shipped trailers with search filters, financial summaries, and automated ZIP exports for spec sheets and photos. |
| **`/tv`** | **TV Floor Display Mode** | High-contrast, auto-scrolling full-screen monitor view optimized for workshop floor displays and Google Cast TVs (`/tv/station1`, `/tv/station2`). |

---

## ⚡ Key Features

1. **Real-time Multi-User Collaboration**: Live updates across all connected browsers and floor monitors using Supabase Realtime WebSockets.
2. **Manager Price Lock & PIN Protection**: Financial values (sale prices, cost breakdowns, dealer pricing) are protected behind global manager PIN authorization (`isPriceUnlockedGlobally`).
3. **Role-Based View Controls**: Tailored user experiences for Managers and Factory Workers.
4. **Automated Excel Quote & Spec Sheet Generation**: Fills spreadsheet templates on-the-fly directly in the browser and triggers downloads.
5. **Mandatory Spec Sheet & Shipping Verification**: Safeguards in the shipping workflow to ensure compliance before completing shipments.
6. **Ultra-Fast Payload Performance**: Optimized database queries utilizing Supabase Storage for documents to ensure sub-second page loads.

---

## 🚀 Getting Started

### **Prerequisites**
* Node.js v18+ 
* npm / pnpm / yarn

### **Installation**

1. **Clone the repository:**
   ```bash
   git clone https://github.com/****
   cd *****
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env.local` file in the root directory:
   ```env
   VITE_SUPABASE_URL=https://your-supabase-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```

4. **Run Development Server:**
   ```bash
   npm run dev
   ```

5. **Build for Production:**
   ```bash
   npm run build
   ```

---

## 📄 License

Internal Proprietary Software for **Lane Trailers**. All Rights Reserved.
