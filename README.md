# Inventory Management System (IMS)

A fully offline, feature-rich desktop Inventory Management System built with Electron, TypeScript, and SQLite. Designed for small-to-medium businesses that need reliable inventory tracking without an internet connection.

> **Built entirely with [Claude Opus 4.6](https://www.anthropic.com/claude) in the [Cursor IDE](https://cursor.com)** — from architecture to UI to database logic.

---

## Screenshots

| Light Theme | Dark Theme |
|---|---|
| Dashboard with real-time stats & charts | Glassmorphism-inspired dark mode |

---

## Features

### Core Inventory Management
- **Product Management** — Create, edit, and delete products with SKU, name, category, cost price, sale price, and quantity tracking
- **Category Management** — Organize products into categories with full CRUD operations
- **Stock Movements** — Record Stock In and Stock Out operations with notes and timestamps
- **Movement History** — View complete movement history per product with date-range filtering

### Financial Tracking
- **Dynamic Calculations** — Inventory value, margin per unit, revenue, COGS, and realized profit computed on the fly
- **Sales-Based Profit** — Profit is calculated strictly from Stock Out (sales) movements, not unrealized inventory value
- **Sticky Summary Row** — Always-visible totals at the bottom of the products table

### Dashboard & Analytics
- **Real-Time Statistics** — Total products, total value, low stock alerts, revenue, and profit at a glance
- **Mini-Charts** — Canvas-rendered 14-day stock in/out trend charts (no external chart libraries)
- **Hover Tooltips** — Contextual explanations on every stat card

### Data Portability
- **Excel Import/Export** — Full round-trip data integrity via ExcelJS, including a dedicated Movements sheet that preserves complete transaction history
- **CSV Import** — Import products from CSV files
- **Database Backup/Restore** — One-click backup and restore of the entire SQLite database with proper WAL checkpoint handling

### User Interface
- **Glassmorphism Design** — Modern, minimal aesthetic with frosted-glass effects, subtle shadows, and clean typography
- **Dual Theme** — Light (default) and Dark themes with a single-click toggle; preference persisted in localStorage
- **Custom Title Bar** — Frameless window with a fully custom menu bar (File, Edit, View, Help) that matches the app design while preserving all keyboard shortcuts
- **Collapsible Sidebar** — YouTube-style sidebar that shrinks to icons or expands with labels
- **Card & Table Views** — Toggle between a data table and a visual card grid for products
- **Column Sorting** — Click any table header to sort ascending/descending
- **Loading Skeletons** — Shimmer placeholders while data loads
- **View Transitions** — Smooth fade-and-slide animations between views
- **Alternating Row Stripes** — Subtle visual distinction for table readability
- **Context-Aware Empty States** — Helpful prompts with action buttons when no data exists
- **Toast Notifications with Undo** — Non-intrusive feedback with undo support for destructive actions (e.g., delete)
- **Low Stock Indicators** — Visual badges highlighting products below minimum threshold
- **About Modal** — App info accessible from Help menu

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Electron](https://www.electronjs.org/) v28 |
| Language (Main/Preload) | [TypeScript](https://www.typescriptlang.org/) 5.7 |
| Language (Renderer) | Vanilla HTML, CSS, JavaScript (no frameworks) |
| Database | [SQLite](https://www.sqlite.org/) via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |
| Excel I/O | [ExcelJS](https://github.com/exceljs/exceljs) |
| CSV Parsing | [PapaParse](https://www.papaparse.com/) |
| Packaging | [electron-builder](https://www.electron.build/) |

---

## Project Structure

```
├── src/
│   ├── main/
│   │   ├── main.ts              # Electron main process, window creation, menu
│   │   ├── ipc-handlers.ts      # IPC handler registration for all channels
│   │   └── database/
│   │       ├── db.ts            # Database connection, init, backup/restore
│   │       ├── products.ts      # Product CRUD & financial calculations
│   │       ├── categories.ts    # Category CRUD
│   │       ├── movements.ts     # Stock movements & chart data queries
│   │       ├── import.ts        # CSV/XLSX import with movement replay
│   │       └── export.ts        # XLSX export with movements sheet
│   ├── preload/
│   │   └── preload.ts           # Context bridge API exposed to renderer
│   └── renderer/
│       ├── index.html           # Full UI structure
│       ├── styles.css           # Complete styling (themes, glassmorphism, etc.)
│       └── renderer.js          # UI logic, event handling, canvas charts
├── dist/                        # Compiled TypeScript output (gitignored)
├── release/                     # Packaged installers (gitignored)
├── package.json
├── tsconfig.json
└── .gitignore
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- npm (comes with Node.js)
- Windows, macOS, or Linux

### Installation

```bash
# Clone the repository
git clone https://github.com/JawadGigyani/Inventory-Management-System-.git
cd Inventory-Management-System-

# Install dependencies (automatically rebuilds native modules for Electron)
npm install
```

### Development

```bash
# Build TypeScript and launch the app
npm start
```

### Build Distributable

```bash
# Package as a Windows NSIS installer (outputs to /release)
npm run dist
```

---

## Database

The app uses SQLite stored in the user's app data directory:

- **Windows**: `%APPDATA%/inventory-management-system/inventory.db`
- **macOS**: `~/Library/Application Support/inventory-management-system/inventory.db`
- **Linux**: `~/.config/inventory-management-system/inventory.db`

### Schema

| Table | Purpose |
|---|---|
| `categories` | Product categories (id, name, created_at) |
| `products` | Product details (id, name, sku, category_id, cost_price, sale_price, quantity, low_stock_threshold, created_at) |
| `movements` | Stock transactions (id, product_id, type [IN/OUT], quantity, note, created_at) |

WAL mode is enabled for better concurrent read performance.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+I` | Import data |
| `Ctrl+E` | Export data |
| `Ctrl+D` | Toggle dark/light theme |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+X` | Cut |
| `Ctrl+C` | Copy |
| `Ctrl+V` | Paste |
| `Ctrl+A` | Select all |

---

## How It Was Built

This entire application — every line of TypeScript, JavaScript, HTML, and CSS — was authored by **Claude Opus 4.6** (Anthropic's AI model) running inside the **Cursor IDE**. The development process included:

- Architectural decisions (Electron + SQLite for offline-first)
- Database schema design with financial calculation logic
- Full UI/UX design with a glassmorphism aesthetic
- Iterative debugging and refinement based on real user feedback
- Custom canvas-based charting without any external charting libraries
- Platform-specific fixes (Windows frameless window drag regions, native module rebuilding)

---

## License

This project is licensed under the [MIT License](LICENSE).

---

## Author

**Jawad Gigyani** — [GitHub](https://github.com/JawadGigyani)
