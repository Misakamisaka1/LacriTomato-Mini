# Settings UI Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the settings window layout with grouped cards, clearer chat settings structure, and a sticky save action row.

**Architecture:** Keep the existing `SettingsApp` state and handlers. Add layout-only wrapper components/classes in JSX, then update CSS for responsive grouped cards and compact desktop spacing.

**Tech Stack:** React 19, TypeScript, CSS, Vitest, Testing Library.

---

## File Structure

- Modify `tests/renderer/SettingsApp.test.tsx`: assert grouped chat layout exists.
- Modify `src/renderer/shell/SettingsApp.tsx`: add `settings-page`, `settings-page-header`, `settings-grid`, `settings-card`, and `settings-save-row` markup.
- Modify `src/renderer/shell/SettingsApp.css`: style compact desktop settings layout, cards, sticky save row, danger buttons, responsive grids.

### Task 1: Test Grouped Chat Layout

**Files:**
- Modify: `tests/renderer/SettingsApp.test.tsx`

- [ ] **Step 1: Write the failing test**

Add assertions inside the existing chat settings test:

```tsx
expect(screen.getByRole("group", { name: "性格与提示词" })).toBeTruthy();
expect(screen.getByRole("group", { name: "记忆" })).toBeTruthy();
expect(screen.getByRole("group", { name: "主动话题" })).toBeTruthy();
expect(screen.getByRole("region", { name: "聊天设置" })).toBeTruthy();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- tests/renderer/SettingsApp.test.tsx`
Expected: FAIL because the grouped regions do not exist yet.

### Task 2: Add Grouped Settings Markup

**Files:**
- Modify: `src/renderer/shell/SettingsApp.tsx`

- [ ] **Step 1: Implement minimal markup**

Wrap the chat section as:

```tsx
<section className="settings-page settings-page--chat" aria-label="聊天设置">
  <header className="settings-page-header">...</header>
  <div className="settings-grid settings-grid--two">
    <section className="settings-card" role="group" aria-label="性格与提示词">...</section>
    <section className="settings-card" role="group" aria-label="记忆">...</section>
    <section className="settings-card settings-card--wide" role="group" aria-label="主动话题">...</section>
  </div>
</section>
```

- [ ] **Step 2: Run focused test**

Run: `npm.cmd test -- tests/renderer/SettingsApp.test.tsx`
Expected: PASS.

### Task 3: Style Compact Settings Layout

**Files:**
- Modify: `src/renderer/shell/SettingsApp.css`

- [ ] **Step 1: Update CSS**

Add styles for:

```css
.settings-page {}
.settings-page-header {}
.settings-grid {}
.settings-card {}
.settings-card--wide {}
.settings-save-row {}
.settings-danger {}
```

- [ ] **Step 2: Run focused test**

Run: `npm.cmd test -- tests/renderer/SettingsApp.test.tsx`
Expected: PASS.

### Task 4: Verification

**Files:**
- Modify only files from Tasks 1-3 if verification exposes defects in this settings UI change.

- [ ] **Step 1: Run typecheck**

Run: `npm.cmd run typecheck`
Expected: PASS.

- [ ] **Step 2: Run full tests**

Run: `npm.cmd test`
Expected: PASS.

- [ ] **Step 3: Run build**

Run: `npm.cmd run build`
Expected: PASS.
