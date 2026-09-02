# PlanWise — Desktop App (Windows, v1)

**Date:** 2026-09-03
**Status:** Approved for implementation planning

---

## Overview

PlanWise's stated long-term vision is to be a universal plan detector across
every platform someone plans on — the privacy policy already anticipates
"future PlanWise apps on other platforms (desktop, iOS, Android)." This spec
is the first step toward that: a native Windows desktop app that detects
plans as they're typed into *any* application, not a fixed list of
browser-only sites the way the Chrome extension is scoped today.

**Scope for v1:** Windows only. macOS/Linux are explicitly future work, not
because the mechanism is Windows-specific in concept, but because the
OS-level text-capture API differs completely per platform (Windows UI
Automation vs. macOS Accessibility API) and building/validating both at once
doubles the riskiest part of this project for no v1 benefit.

**The core mechanism, and why it's shaped this way:** the extension's magic —
reading text as it's typed, before it's sent — comes from browser DOM
content-scripts, which only work on web pages. A desktop app has no
equivalent for native applications; reaching into another app's UI requires
an OS accessibility API. Three mechanisms were considered:

1. **Windows UI Automation (UIA), used generically** — a built-in Windows
   accessibility framework (successor to MSAA, built for screen readers and
   UI test automation). Any app *can* expose a tree of UI elements with
   readable text values; external code queries them via the `IUIAutomation`
   COM interface. **Chosen approach.** Built generically — "read whatever
   text field currently has keyboard focus, in any app" — rather than
   hardcoded per named app, so there is no engineering-imposed limit on
   which apps are supported. Coverage is limited only by whether the target
   app itself implements standard UI accessibility (most Win32/WPF/UWP apps
   do natively; most Chromium/Qt apps do partially; a minority of apps with
   fully custom-rendered UI expose nothing at all — see Known Limitations).
2. **A system-wide low-level keyboard hook** (`WH_KEYBOARD_LL`) — **rejected.**
   This is the literal mechanism malware keyloggers use, and Windows
   Defender / every AV and EDR product has signatures watching for exactly
   this API call — a legitimate app doing this risks near-certain
   quarantine or SmartScreen blocking regardless of intent. It also
   captures every keystroke in every app (not just the focused
   compose box), can't distinguish a chat message from a password, and
   doesn't see pasted text at all (paste events don't generate keystrokes),
   which would silently miss a common way people actually share plan
   details.
3. **Continuous screen OCR** — **rejected.** Genuinely mechanism-agnostic
   (reads pixels, not app internals, so it doesn't care what framework an
   app uses), but CPU-heavy, error-prone, and requires a screen-recording-
   level OS permission that reads as more alarming to users than either
   other option, while still not cleanly solving "which region is the
   compose box, live, as text changes."

UIA, built generically, is the only option that gets meaningfully close to
"detect from anywhere" without trading the whole app's trustworthiness for
it. The gap it leaves (apps with no exposed accessible text) is treated as a
known, disclosed limitation for now — not solved by falling back to either
rejected mechanism. If specific real apps turn out to hit that ceiling once
this ships, that's a problem to revisit with real data, not to design around
speculatively today.

---

## Architecture

Five isolated components, each with one job:

### 1. UIA Watcher (new) — `desktop/uia-watcher/`

A small standalone Windows process (C#, using `System.Windows.Automation` —
.NET's managed wrapper over UIA, dramatically less boilerplate than raw COM
in C++). Its only job: subscribe to focus-changed and text-changed
automation events **generically** (whatever element currently has keyboard
focus, in whatever window, in whatever process), and when that element's
text value changes, check whether the owning process's name is in the
current allowlist (see Component 5) and, if so, emit the current text.

**Interface:** writes newline-delimited JSON to stdout —
`{"type":"focus-text","processName":"whatsapp.exe","windowTitle":"...","text":"...","timestamp":"..."}`.
Reads its allowlist at startup from a file path passed as a launch argument,
and re-reads it on a `SIGHUP`-equivalent signal sent by its parent when the
user edits the list (exact IPC signal mechanism is an implementation
decision, not specified here).

**Depends on:** Windows UIA APIs only. Has zero knowledge of PlanWise's
detection logic, Supabase, or UI — it is purely "watched text in, JSON
events out," independently testable by running it standalone and typing
into any allowlisted app.

### 2. Text Bridge (new) — `desktop/main/text-bridge.js`

Runs in the Electron main process. Spawns and supervises the UIA Watcher
child process (restarts it if it exits unexpectedly), parses its stdout
JSON lines, and applies the same debounce/buffering policy the extension's
`content/text-buffer.js` already uses today (reused, not reinvented — same
proven "wait for a pause in typing before analyzing" behavior).

**Interface:** emits a `plan-detected` event carrying the same extracted-event
shape `extractEvent()` already returns today (title, date, time, location,
participants, notes, source text) whenever the buffered text clears
detection.

**Depends on:** the UIA Watcher's stdout stream, and the Detection Engine
(Component 3).

### 3. Detection Engine (reused, unchanged) — `detection/rules.js`,
`engine.js`, `extractor.js`

These three files are pure text-in/JSON-out logic (`analyzeIntent()`,
`extractEvent()}`) with no DOM dependency — the browser-specific glue lives
entirely in separate files (`dom-observer.js`, the old `text-buffer.js`)
that the desktop app does not reuse. This is the entire reason the desktop
app doesn't need to reimplement detection: the proven scoring/classification
pipeline, and its existing Jest test coverage, carry over with zero code
changes.

### 4. Notification / Confirm UI (new) — Electron renderer

A small popup window (or native OS notification that opens one), mirroring
the extension popup's existing pending-event review UX: shows the extracted
details, lets the user edit fields, then Confirm or Dismiss.

**Interface:** receives the `plan-detected` payload from the Text Bridge via
Electron IPC. On confirm, calls the existing (unmodified)
`extension/utils/supabase-client.js` save path — same table, same schema,
same account, so an event confirmed on desktop appears on the Chrome
extension's calendar and vice versa with no new sync logic.

### 5. Dashboard/Tasks/Settings Shell (ported, mostly unchanged) —
Electron renderer, loading `dashboard.html`/`tasks.html`/`settings.html`

Electron is Chromium + Node, so the existing vanilla-JS, no-bundler calendar/
tasks/groups pages load essentially as-is. New addition: a "Detection
Sources" section in Settings for viewing/editing the process allowlist (see
below) — the one new piece of UI this component needs.

**Security requirement, not an implementation detail to decide later:** every
`BrowserWindow` in this app (the Dashboard/Tasks/Settings shell and the
Notification/Confirm UI) must be created with `contextIsolation: true`,
`nodeIntegration: false`, and `sandbox: true`, with a single minimal preload
script as the only bridge between renderer and main (exposing just the
`plan-detected` IPC event and the Supabase save call — nothing else of
Node's API surface). This matters specifically because these renderers load
the same pages that already had one stored-XSS bug this session (fixed, see
`extension/dashboard/dashboard.js`'s `escapeHtml()`). In the Chrome
extension, a DOM-based bug like that is contained to the extension's own
sandboxed page. In a misconfigured Electron renderer (`nodeIntegration`
enabled or `contextIsolation` off), the same class of bug stops being
"attacker JS runs in a sandboxed page" and becomes "attacker JS runs with
full Node.js access on the user's desktop" — filesystem, process spawning,
everything. Stating this now so the implementation plan bakes it in from the
first `BrowserWindow`, rather than retrofitting it after the fact.

### Allowlist Store (new, small) — shared between Components 1 and 5

Persists the list of process names (e.g. `whatsapp.exe`, `telegram.exe`,
`outlook.exe`) PlanWise actively watches. Read by the Text Bridge (to pass
to the UIA Watcher at launch and on change) and read/written by the new
Settings UI.

**Default list at v1:** `whatsapp.exe`, `telegram.exe`, `outlook.exe`,
`teams.exe`, `slack.exe`, `discord.exe` — common communication apps, editable
by the user at any time. Adding a new entry requires zero new code, since
the UIA Watcher's mechanism is generic — this is a scope/privacy control the
user owns, not an engineering limitation. **This is deliberate and worth
restating:** the reason for an allowlist at all isn't "PlanWise can't read
other apps" (it can, generically) — it's that running detection logic
against literally everything typed anywhere (a password manager, an IDE, a
system search box) would be worse for both privacy and performance than
scoping to communication apps by default, the same reasoning the extension
already applies by scoping to 3 sites in its manifest.

**Storage for v1:** local only (an Electron `userData` JSON file), not
synced to Supabase. Cross-device relevance of this specific setting is
unclear today (YAGNI) — worth revisiting only if it becomes a real pain
point once the app is in use.

---

## Data flow

1. User types in an allowlisted app (e.g. WhatsApp Desktop's compose box).
2. UIA Watcher's focus/text-changed subscription fires, reads the focused
   element's current text value, emits a `focus-text` JSON line on stdout.
3. Text Bridge reads the line, debounces per the existing text-buffer
   policy, and once the pause-in-typing condition is met, calls
   `analyzeIntent()` then, if it clears threshold, `extractEvent()` — both
   unmodified from today's extension code.
4. If a plan is detected, Text Bridge emits `plan-detected`; the
   Notification/Confirm UI shows it.
5. User edits if needed, then Confirms or Dismisses. Confirm calls the
   existing Supabase save path; the event appears in the same
   `dashboard.js` render flow (also unmodified) the next time the
   dashboard/tasks pages load or re-render.

No new backend work anywhere in this flow — same Supabase project, same
tables, same RLS, same auth. A user signed into both the Chrome extension
and the desktop app sees one unified calendar.

---

## Known limitations (disclosed, not solved in v1)

- **Apps with fully custom-rendered UI** (canvas/custom-widget text areas
  that expose no standard UIA text pattern) will produce no detection
  against that specific app. This is the mechanism's real ceiling — no
  amount of PlanWise-side engineering closes it without switching to the
  rejected keylogger/OCR mechanisms. Cross this bridge with real data once
  a specific app is confirmed to hit it, not speculatively now.
- **Elevated (Administrator-run) target apps** are invisible to a
  non-elevated PlanWise process — a Windows security boundary (UIPI:
  User Interface Privilege Isolation), not a bug. Not worked around by
  requesting PlanWise itself run elevated, since that request is its own
  significant trust cost, disproportionate to the edge case it would close.
- **macOS/Linux** are out of scope for this spec entirely — a future spec's
  concern, using that platform's own accessibility API (Accessibility API
  on macOS), not a code port of the Windows UIA Watcher.
- **Password-masked fields** — the UIA Watcher subscribes generically to
  "whatever element currently has keyboard focus" within an allowlisted
  process, which includes any password/PIN field that app happens to show
  (e.g. a re-auth prompt in Teams), not just its chat compose box. This is
  expected to be a non-issue in practice: native Windows password controls
  set `IsPassword` and don't expose their value via UIA's
  `TextPattern`/`ValuePattern` at the OS level, regardless of what's reading
  them. That expectation is not yet confirmed against real allowlisted
  apps — see Testing.

---

## Testing

The Detection Engine's existing Jest coverage (`tests/detection.test.js`
and friends) applies unchanged — it tests pure functions, and nothing about
running them from a desktop app instead of a content script changes their
behavior or their tests.

Everything OS-integration-specific (the UIA Watcher, the Text Bridge's
parsing/debouncing of its output, allowlist enforcement) has no realistic
unit-test story — this mirrors the existing project's own pattern of no
Jest coverage for DOM/UI-heavy or environment-dependent code, verified
manually instead. Verification is manual: run the UIA Watcher standalone
against each allowlisted app and confirm live text is captured as typed;
confirm a non-allowlisted app's focus produces no events; confirm a
detected plan reaches the Notification UI and a confirmed plan appears on
both the desktop dashboard and, on the same account, the Chrome extension's
calendar; confirm that focusing a password/PIN field in an allowlisted app
(e.g. a re-auth prompt) produces no `focus-text` event or an empty one,
closing the loop on the Known Limitations note above instead of leaving it
assumed.

---

## Out of scope for this spec

- Installer/distribution/auto-update mechanics — a real concern before
  shipping to anyone but not part of the architecture itself; worth its own
  pass once the app functions.
  - Since this desktop app is a new distributable surface, this includes
    updating the landing page (add a Windows download alongside the
    existing Chrome Web Store link) and the privacy policy (the policy's
    existing footer note already anticipates "future PlanWise apps on
    other platforms" needing their own linked version).
- macOS/Linux support (separate future spec, separate OS-level mechanism).
- Solving either disclosed known limitation above.
- Any change to the Supabase schema, RLS, or the Chrome extension itself —
  this is purely additive, a new client against the same backend.

---

## Self-review

**Placeholder scan:** none — every component names its exact file path (new
or existing), its interface shape, and what it depends on. Where an
implementation detail is genuinely undecided (e.g. the exact allowlist
reload IPC signal), it's named as an implementation decision explicitly,
not left as a vague TBD.

**Internal consistency:** the "generic mechanism, not a hardcoded app list"
decision (Overview) is carried through consistently — the UIA Watcher's
interface takes an allowlist as *input* rather than having app names
compiled into its logic, and the Allowlist Store section explicitly
restates why the allowlist is a scope control and not an engineering
limitation, so the two sections don't read as contradicting each other.

**Scope check:** contained to a new `desktop/` surface plus reuse of
existing, unmodified detection and Supabase-client code. No backend schema
changes. Single spec, single implementation plan — not decomposed further,
since the components are tightly sequential (Watcher → Bridge → Engine →
UI) rather than independent enough to ship separately.

**Ambiguity check:** "detect from anywhere" (the user's stated vision) is
made explicit as "no hardcoded app list in the detection mechanism itself,"
scoped by a user-editable allowlist for privacy/performance — not literally
"watches every keystroke in every window," which was explicitly discussed
and rejected as the keylogger/OCR mechanisms. This is the reading the
brainstorming conversation converged on, stated here so it isn't
re-litigated during implementation.
