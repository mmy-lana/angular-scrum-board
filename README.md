# Angular Scrum Board

> A high-performance, local-first Scrum and Agile board built with Angular and Tailwind CSS. Delivers the instant responsiveness of Linear with the structural rigor of Jira.

[![Live Demo](https://img.shields.io/badge/Live_Demo-angular--scrum--board.vercel.app-6366f1?style=flat-square)](https://angular-scrum-board.vercel.app)
[![Repository](https://img.shields.io/badge/GitHub-mmy--lana%2Fangular--scrum--board-1e293b?style=flat-square)](https://github.com/mmy-lana/angular-scrum-board)
[![Tech Stack](https://img.shields.io/badge/Stack-Angular_%2B_Tailwind_CSS_v4-0f172a?style=flat-square)](https://github.com/mmy-lana/angular-scrum-board)
[![License](https://img.shields.io/badge/License-MIT-slate?style=flat-square)](LICENSE)

---

## Overview

Traditional project management tools suffer from network latency, bloated bundles, and sluggish interaction loops. **Angular Scrum Board** operates directly inside the browser using an offline-first, client-side database. Every drag, edit, reorder, and filter mutation executes with zero round-trip latency.

### Key Value Propositions

* **Zero-Latency Interaction:** Local persistence via IndexedDB (Dexie.js) paired with reactive Angular Signals for immediate sub-millisecond UI updates.
* **Fractional Reordering Engine:** O(1) drag-and-drop card positioning with automated column rebalancing to eliminate array rewrites and precision exhaustion.
* **Complete Offline Autonomy:** Fully functional without an active network connection, featuring portable JSON checkpoint export and atomic transactional restore.
* **External Context Sharing:** Instant Markdown clipboard export and direct WhatsApp dispatch for friction-free team coordination.
* **Enterprise Viewport Hardening:** Locked viewport architecture preventing document-level jitter, with responsive single-lane tab switching below 1024px.

---

## System Capabilities

### 1. Interactive Kanban Board
* 4-lane layout (To Do, In Progress, In Review, Done) with strict horizontal progression.
* Native Angular CDK drag-and-drop with custom grab handles, drop previews, and touch-drag suppression.
* Dynamic WIP (Work In Progress) calculation with visual threshold warnings (`At WIP`, `Over WIP`).
* High-density and comfortable visual toggle modes with intelligent priority-preserving text truncation.

### 2. Sprint Lifecycle & Backlog Management
* Sprint planning view grouping tasks by sprint status (`Active`, `Future`, `Completed`) and unscheduled pools.
* One-click sprint completion that automatically records velocity metrics and rolls unfinished tasks back to the backlog.
* Progress tracking displaying committed vs. completed story points per sprint.

### 3. Disaster Recovery & Team Administration
* **Snapshot Checkpoints:** Full database serialization into schema-validated JSON files for migration and backup.
* **Atomic Restore:** Single-transaction import with schema version verification and fallback protection.
* **Team Management:** Add, edit, or purge team members with automatic referential integrity repairs across assigned and reported tasks.

---

## Keyboard Shortcuts

Navigation and issue triage can be performed entirely from the keyboard without opening menus:

| Key | Action | Scope |
| :--- | :--- | :--- |
| `c` | Open quick create modal | Global (unfocused) |
| `/` | Focus search filter input | Global (unfocused) |
| `Escape` | Dismiss open dialogs, sheets, and drawers | Top-level overlay |
| `1` - `5` | Create issue with pre-set priority (`Urgent` to `Lowest`) | Global (unfocused) |
| `s`, `b`, `t`, `e` | Create issue with pre-set type (`Story`, `Bug`, `Task`, `Epic`) | Global (unfocused) |

*Single-key shortcuts automatically suppress when typing in form controls or when dialogs are active.*

---

## Architecture & Tech Stack

| Layer | Technology | Details |
| :--- | :--- | :--- |
| **Framework** | Angular (Latest) | Standalone components, Signals, Control Flow (`@if`, `@for`, `@switch`), Zoneless change detection |
| **Styling** | Tailwind CSS (v4) | CSS-first configuration via `@theme`, strict slate/indigo design tokens, custom responsive breakpoints |
| **Drag & Drop** | `@angular/cdk/drag-drop` | Connected drop lists, custom drag handles, bounded viewport scroll containment |
| **Data Layer** | Dexie.js (IndexedDB) | Reactive `liveQuery` observables bridged to Signals via `toSignal`, transactional multi-table writes |
| **Build Tool** | Vite + AnalogJS | Fast HMR dev server and optimized production bundling |
| **Package Manager**| `pnpm` | Strict dependency graph isolation and shared content-addressable store |

---

## Local Development

### Prerequisites

* Node.js (Active LTS version recommended)
* `pnpm` (Corepack or standalone install)

### Setup Instructions

1. Clone the repository:
   ```bash
   git clone https://github.com/mmy-lana/angular-scrum-board.git
   ```

2. Navigate to the project root:
   ```bash
   cd angular-scrum-board
   ```

3. Install pinned dependencies:
   ```bash
   pnpm install
   ```

4. Start the local development server:
   ```bash
   pnpm dev
   ```

5. Access the application in your browser at `http://localhost:5173`.

### Production Build

Run static type-checking and compile the optimized production bundle:

```bash
pnpm run build
```

Preview the production build locally:

```bash
pnpm run preview
```

---

## License

This project is open-source software licensed under the [MIT License](LICENSE).
