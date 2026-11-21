# History Vault Item-Level AI Chat & Gemini Shimmer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace bulky in-page meeting chat containers with an item-level micro-action icon on each history vault card that opens a compact floating AI chat window equipped with a multi-hued Gemini holographic loading shimmer.

**Architecture:** React component event coordination between `MeetingHistory`, `AiChatBox`, and `App.tsx`. CSS keyframe animations provide Google Gemini's signature multi-stop holographic shimmer wave and rotating 4-pointed sparkle stars. The Express/Supabase backend continues powering semantic vector memory and Groq LLM inference.

**Tech Stack:** React 19, TypeScript 5.8+, Vite 8+, Tailwind/Liquid Glass CSS, Lucide Icons, Supabase, Groq AI.

**Spec:** `.agent/SPEC.md`

## Global Constraints

- **BUG-002 Invariant:** `html, body { overflow-x: hidden; width: 100%; }`. Zero horizontal scrollbars permitted on desktop or mobile.
- **BUG-003 Invariant:** Git commits must be authored by `teeyouhao <yhtee2007@gmail.com>`.
- **BUG-004 Invariant:** Absolute prohibition on declaring success without running `scripts/verify.bat` and confirming exit code 0.
- **Liquid Glass Invariant:** Frosted glass material (`backdrop-filter: blur(28px) saturate(190%)`), semi-transparent borders (`rgba(255, 255, 255, 0.12)`), rounded cards (20px-26px).
- **Inference Invariant:** Zero Gemini API key reintroduction; Groq backend inference remains active while adopting Gemini's visual aesthetic in the UI.

## Review Focus

1. Clicking the AI chat button on any vault card must not navigate to the meeting summary view (`e.stopPropagation()`).
2. Opening chat from a vault card must cleanly bind the chat context to that specific meeting ID and title, displaying the meeting badge in the chat window.
3. Chat popup window must fit within mobile viewports without causing horizontal overflow or getting clipped by the bottom navigation bar.
4. Gemini loading shimmer must show animated holographic multi-stop wave gradients (`#4285f4`, `#9b72cb`, `#d96570`, `#06b6d4`) and rotating sparkles during loading.
5. All build commands and verification checks must pass cleanly with exit code 0.

---

### Task 1: Create scripts/verify.bat and Verification Infrastructure

**Files:**
- Create: `scripts/verify.bat`
- Test: Execute `scripts/verify.bat`

**Interfaces:**
- Consumes: Project git config, `src/index.css`, `package.json`, `server/package.json`.
- Produces: Command exit code 0 when all validation criteria are met.

- [ ] **Step 1: Write `scripts/verify.bat`**
Implement batch script verifying git author identity (`teeyouhao <yhtee2007@gmail.com>`), CSS overflow rules, server TypeScript build, and client production build.

- [ ] **Step 2: Run verification script**
Run: `cmd /c scripts\verify.bat`
Expected: PASS with exit code 0.

---

### Task 2: Implement Gemini Holographic Shimmer Styles in CSS

**Files:**
- Modify: `src/index.css`

**Interfaces:**
- Consumes: Theme variables in `src/index.css`.
- Produces: `.gemini-shimmer-wave`, `.gemini-sparkle-spin`, `.gemini-gradient-text`, `.vault-action-btn-ai`.

- [ ] **Step 1: Add Gemini multi-stop gradient animations and styles**
Add keyframe animations `gemini-shimmer-sweep`, `gemini-sparkle-pulse`, and `gemini-rotate` with colors `#4285f4`, `#9b72cb`, `#d96570`, `#06b6d4`, and `#fbbc04`.
Add card action button style `.vault-action-btn-ai` featuring liquid glass styling with subtle glowing gradient on hover.

- [ ] **Step 2: Verify CSS rules**
Ensure `overflow-x: hidden` and `width: 100%` remain strictly enforced.

---

### Task 3: Upgrade AiChatBox Component with Gemini Aesthetic & External Triggers

**Files:**
- Modify: `src/components/AiChatBox.tsx`

**Interfaces:**
- Consumes: `meetingId?: string`, `meetingTitle?: string`, window event `meetwithai:open-chat`.
- Produces: Interactive floating chat popup with Gemini holographic shimmer loading skeleton and 4-point sparkle stars.

- [ ] **Step 1: Update AiChatBox props and event listeners**
Allow external opening with specific meeting binding via `window.dispatchEvent(new CustomEvent('meetwithai:open-chat', { detail: { meetingId, meetingTitle } }))` and reactive internal state.

- [ ] **Step 2: Implement Gemini-style loading UI**
Replace generic loading bar with multi-colored wave gradient, pulsing 4-pointed Gemini star sparkles, and localized reasoning status text.

---

### Task 4: Integrate AI Chat Micro-Action on History Vault Cards

**Files:**
- Modify: `src/components/MeetingHistory.tsx`
- Modify: `src/context/LanguageContext.tsx` (add i18n keys for vault chat action if needed)

**Interfaces:**
- Consumes: `onOpenChat?: (meeting: MeetingRecord) => void` callback.
- Produces: Micro-action button on each meeting card launching the scoped AI Chat window.

- [ ] **Step 1: Add onOpenChat prop to `MeetingHistoryProps`**
- [ ] **Step 2: Add AI Chat icon button beside View and Delete buttons**
Add button with `Bot` / `Sparkles` icon, `e.stopPropagation()`, and trigger `onOpenChat(item)` or dispatch `meetwithai:open-chat`.

---

### Task 5: Coordinate App-Level Chat State in App.tsx

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `MeetingHistory`, `MeetingSummaryView`, `AiChatBox`.
- Produces: Seamless active meeting state binding whether launched from card, summary, or global FAB.

- [ ] **Step 1: Wire active chat meeting state in `AppShell`**
Support opening chat for a specific vault meeting without requiring entering the summary view.

---

### Task 6: Comprehensive Verification with scripts/verify.bat

**Files:**
- Test: `scripts/verify.bat`

- [ ] **Step 1: Execute `scripts/verify.bat`**
Run: `cmd /c scripts\verify.bat`
Expected: Exit code 0, all builds passing, git identity verified, CSS guards intact.

- [ ] **Step 2: Git status and commit verification**
Verify author identity and prepare clean commit.
