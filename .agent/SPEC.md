# Specification: History Vault Item-Level AI Chat & Gemini Shimmer Experience

**Document Version:** 1.0.0  
**Status:** Approved for Implementation  
**Governing Architecture:** Liquid Glass Fullscreen Web Application (Notion MCP Blueprint)  
**Applicable Rules:** BUG-002 (Viewport Overflow), BUG-003 (Git Author Identity), BUG-004 (Prove It Works Invariant)

---

## 1. Executive Summary & Problem Definition

In the previous design, querying an individual meeting required navigating into a full summary view or relying on a static accordion container. The user requested:
1. **Remove Heavy In-Page Containers:** For each history vault meeting item, eliminate bulky in-page chat containers.
2. **Item-Level Quick Action Icon:** Replace it with an intuitive, compact AI trigger icon on each meeting card that launches a small floating chat window pre-scoped to that meeting's transcript and semantic context.
3. **Gemini-Style Holographic Shimmering Effect:** Replace basic skeleton bars with Google Gemini's signature multi-stop holographic wave shimmer (`#4285f4`, `#9b72cb`, `#d96570`, `#06b6d4`) and animated 4-pointed Gemini sparkle stars during inference/retrieval loading states.
4. **Liquid Glass Aesthetic & Mobile Fit:** Elevate the overall visual design adhering to the Notion MCP "Liquid Glass" design system (`backdrop-filter: blur(16px)`, specular reflections, pill buttons, zero horizontal viewport overflow).

---

## 2. Notion MCP Knowledge Alignment

### 2.1 Domain Vocabulary: Liquid Glass
- **Surface Material:** `background: rgba(255, 255, 255, 0.06)` (Dark) / `rgba(255, 255, 255, 0.78)` (Light), `backdrop-filter: blur(28px) saturate(190%)`.
- **Specular Accents:** Inset specular reflection borders (`inset 0 1px 0 rgba(255, 255, 255, 0.2)`).
- **Corner Radii:** Cards: 20px–26px; Pills / Triggers: 9999px (full pill) or 10px–12px for micro-actions.
- **Viewport Constraints:** `overflow-x: hidden; width: 100%;` on `html, body`. Flexbars must wrap or collapse below 1200px/640px.

### 2.2 System Blueprint: Liquid Glass Fullscreen Web Application
- **Topology:** Top floating island bar + responsive glass grid view + floating AI Copilot window.
- **Verification Protocol:** DOM audit asserting `scrollWidth <= clientWidth` across 1024px, 1280px, and 1440px viewports; modal open/close test.

### 2.3 Bug Prevention Registry Guardrails
- **BUG-002 (Viewport Horizontal Scrollbar Overflow):** Zero horizontal scrollbars. Cards and controls must maintain `box-sizing: border-box`, `max-width: 100%`, and flex-wrap behavior.
- **BUG-003 (Git Commit Misattributed Author):** Identity must be `teeyouhao <yhtee2007@gmail.com>`.
- **BUG-004 (Premature Completion Slop - Vibes over Proof):** Prohibits completion claims without executing `scripts/verify.bat` and confirming exit code 0.

### 2.4 User Core Aesthetic & UX Preferences (Notion Memory Sync)
- **Simplified Design & Low Chrome:** Clean, airy, distraction-free aesthetic with high signal-to-noise ratio.
- **Selection Lists over Multi-Widget Clutter:** Prefer compact selection lists, pickers, dropdowns, and segmented pills over proliferating multiple disparate widgets.
- **Glassmorphic Navigation Bar:** Navigation bar (dock/header) must feature high-end frosted glassmorphism (`backdrop-filter: blur`, subtle translucent border, specular reflections).
- **Minimalist Containers:** Avoid heavy box/card nesting and container sprawl ("don't want much container"). Use content-first breathing room rather than rigid multi-layered borders.
- **Mobile First:** Elements beside the audio wave and controls must maintain zero horizontal squeeze on small viewports.

---

## 3. Detailed Technical Requirements

### 3.1 Vault Card AI Chat Trigger
- Each meeting item in `src/components/MeetingHistory.tsx` must feature a micro-action button:
  - Icon: Gemini Sparkle / Bot icon with glowing purple-indigo styling.
  - Hover tooltip: "Chat with AI about this meeting" (localized: EN / ZH).
  - Clicking this button must:
    1. Bind the chat session directly to the clicked meeting ID and meeting title.
    2. Open the small floating AI Chat window immediately.
    3. Not trigger card navigation to the summary view (`e.stopPropagation()`).

### 3.2 Floating AI Chat Window
- Remains fixed and compact (ChatGPT / Gemini Copilot style).
- Accessible from both the global floating action button (FAB) and item-level vault cards.
- Displays meeting title context pill in the chat header when scoped to a specific meeting.
- Features one-click chat clear, dismiss button, and quick prompts tailored to the current meeting.

### 3.3 Gemini-Style Shimmering Animation
- **Holographic Color Spectrum:**
  - Google Blue: `#4285f4`
  - Amethyst Purple: `#9b72cb`
  - Coral Rose: `#d96570`
  - Cyan: `#06b6d4`
  - Amber Gold: `#fbbc04`
- **Animation Kinetics:**
  - Shimmer Wave: Smooth continuous 1.8s loop moving `background-position: -200% 0` to `200% 0`.
  - Sparkle Icon: 4-pointed Gemini star pulsating (`scale(0.9) -> scale(1.15)`) with rotating hue.
  - Shimmer Skeletons: 3 staggered lines with varying widths (85%, 100%, 60%) styled with holographic gradients.

---

## 4. Verification & Testing Protocol

1. **Compilation & Build:**
   - Server TypeScript: `npm --prefix server run build` (tsc clean).
   - Client Bundle: `tsc -b && vite build` (zero type errors, bundle generated).
2. **Git Identity Check:**
   - Assert `git config user.name == teeyouhao`.
   - Assert `git config user.email == yhtee2007@gmail.com`.
3. **Viewport Overflow Guard:**
   - Assert CSS contains `overflow-x: hidden` and `width: 100%`.
4. **Exit Code Invariant:**
   - `scripts/verify.bat` executes all phases and returns exit code 0.
