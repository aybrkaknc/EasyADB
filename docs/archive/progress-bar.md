# Task: Progress Bar System

## Goal
Implement a detailed Progress Bar integrated into the Log Panel (Bottom Status Rail) to provide visual feedback during long-running operations (Backup, Restore, Debloat).

## UI/UX Design (Option B)
- **Location:** Integrated into `LogPanel.tsx` header or as a sticky footer within the log area.
- **Components:**
    - **Status Text:** `> PULLING: com.pubg.im/main.obb...` (Typing effect or simple monospace).
    - **Visual Bar:** Neon green loader with smooth transition.
    - **Counters:** `[ 4 / 12 ]` (Current / Total) and `%35`.

## Status
- [x] Phase 1: Create `ProgressBar` Component
- [x] Phase 2: Update `AppState` & Context (Add `progress` object)
- [x] Phase 3: Integrate into `LogPanel`
- [x] Phase 4: Emit Progress Events from App Logic
- [x] Phase 5: Verification

## Technical Changes

### 1. `src/types/index.ts` (New Type)
```typescript
interface ProgressState {
    isActive: boolean;
    currentTask: string; // "Backing up WhatsApp"
    detail?: string;     // "Pulling main.obb..."
    percent?: number;    // 0-100 (Optional, if we calculate file size)
    current: number;     // 4
    total: number;       // 12
}
```

### 2. `src/components/ui/ProgressBar.tsx`
- A reusable component using `framer-motion` for smooth width animation.
- Accepts `ProgressState` as props.

### 3. `src/App.tsx`
- Add `progress` state.
- Pass `setProgress` to modules (`BackupModule`, `RestoreModule` logic).
- NOTE: Since `useBackup` hooks manage logic, we might need to drill props or use Context. `AppContext` is ideal here.

### 4. `src/context/AppContext.tsx` (If exists) or `App.tsx`
- Lift state up.

## User Review Required
- **Indeterminate State:** For operations where exact percentage is unknown (like "zipping"), the bar will be in "indeterminate" mode (striped animation).
