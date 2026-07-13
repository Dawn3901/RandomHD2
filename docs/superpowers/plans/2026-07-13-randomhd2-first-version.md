# RandomHD2 First Version Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first local web version of the Helldivers 2 randomizer described in `设计.md`.

**Architecture:** Use a Vite + React + TypeScript single-page app. Keep randomization in pure functions, keep generated catalog data separate from UI, and use `localStorage` for player names, enabled items, custom stratagem sets, and last roll.

**Tech Stack:** Vite, React, TypeScript, Vitest, local JSON/TS data, local Wiki assets.

## Global Constraints

- This tool is for local and friend-group use, not commercial publication.
- Frontend only; no backend, account system, or cloud sync in the first version.
- Use local Wiki assets from `assets/wiki`; do not hotlink Wiki images at runtime.
- Support random faction, 4 stratagems, primary weapon, secondary weapon, grenade.
- Support 2-4 players drawing non-repeated custom 4-stratagem sets from a shared pool.
- Save preferences and custom sets in `localStorage`.

---

## File Structure

- Create `package.json`, `tsconfig*.json`, `vite.config.ts`, `index.html`: project tooling.
- Create `scripts/generate-data.mjs`: copies Wiki assets into `public/assets/wiki` and generates `src/data/generatedCatalog.ts`.
- Create `src/types.ts`: shared domain types.
- Create `src/lib/random.ts`: pure random and validation functions.
- Create `src/lib/storage.ts`: resilient localStorage helpers.
- Create `src/lib/random.test.ts`: Vitest coverage for random logic.
- Create `src/App.tsx`: first version app shell, quick random panel, squad pool panel, data browser.
- Create `src/main.tsx`, `src/styles.css`: app entry and UI styling.

---

### Task 1: Tooling and generated catalog pipeline

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `scripts/generate-data.mjs`

**Interfaces:**
- Produces: `npm run generate:data`, `npm test`, `npm run build`, `npm run dev`
- Produces: `src/data/generatedCatalog.ts` with `factions`, `stratagems`, `weapons`, `grenades`

- [ ] **Step 1: Add Vite/React/Vitest tooling files**
- [ ] **Step 2: Add data generation script**
- [ ] **Step 3: Install dependencies**
- [ ] **Step 4: Run `npm run generate:data` and confirm generated catalog exists**

### Task 2: Random logic with TDD

**Files:**
- Create: `src/types.ts`
- Create: `src/lib/random.test.ts`
- Create: `src/lib/random.ts`

**Interfaces:**
- Produces: `pickOne<T>(items: T[], rng?: Rng): T`
- Produces: `pickManyUnique<T>(items: T[], count: number, rng?: Rng): T[]`
- Produces: `rollQuickLoadout(catalog: Catalog, enabledIds: string[], rng?: Rng): QuickLoadout`
- Produces: `drawSquadSets(players: Player[], pool: StratagemSet[], rng?: Rng): SquadDrawResult[]`

- [ ] **Step 1: Write failing tests for empty pools, unique picking, quick roll, and squad draw**
- [ ] **Step 2: Run tests and verify they fail because implementation is missing**
- [ ] **Step 3: Implement minimal random logic**
- [ ] **Step 4: Run tests and verify they pass**

### Task 3: Storage helpers and app shell

**Files:**
- Create: `src/lib/storage.ts`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`

**Interfaces:**
- Consumes: generated catalog and random functions from Task 1 and Task 2
- Produces: visible app with quick random, squad pool, and data browser sections

- [ ] **Step 1: Add safe localStorage helpers**
- [ ] **Step 2: Build quick random UI**
- [ ] **Step 3: Build squad pool UI with 2-4 players and non-repeated draw**
- [ ] **Step 4: Build data browser with enable toggles and search**
- [ ] **Step 5: Style the app with stable responsive layout and local icon assets**

### Task 4: Verification and local URL

**Files:**
- Modify: no source files unless verification exposes a concrete issue

**Interfaces:**
- Produces: a local dev server URL

- [ ] **Step 1: Run `npm test`**
- [ ] **Step 2: Run `npm run build`**
- [ ] **Step 3: Start `npm run dev -- --host 127.0.0.1`**
- [ ] **Step 4: Report the local URL and any remaining caveats**

---

## Self-Review

- Spec coverage: first version covers random faction, stratagems, primary, secondary, grenade, multiplayer custom pool, icons, local storage, and frontend-only operation.
- Placeholder scan: no TODO/TBD placeholders are required for implementation.
- Type consistency: `Catalog`, `QuickLoadout`, `Player`, `StratagemSet`, and `SquadDrawResult` are defined once in `src/types.ts` and consumed by random/UI modules.
