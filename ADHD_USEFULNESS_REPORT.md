# ADHD Usefulness Summary Report

## 1. Executive Summary

This app is strongly oriented toward ADHD-friendly task management rather than generic checklist behavior. The implementation supports starting, restarting, and recovering from tasks with features such as Help Me Start, First Small Action, Minimum Version, Start 2 Min, task-linked focus sessions, notification deep-linking, Current Task quick access, mood support, recovery/rescheduling, Overwhelm Mode, and Energy-Based Task Matching.

The most useful pattern is that the app repeatedly turns "do the whole task" into "choose one small next step." It also tracks reminder actions and task friction signals, which lets the UI respond to tasks that may be feeling heavy. The main risk is not missing ADHD support. The main risk is density: many helpful controls live in one large screen and complex task cards, so careful QA is needed to ensure the interface stays calming on real devices.

## 2. Overall Usefulness Rating

**Strong**

The app includes multiple implemented ADHD support loops:

- Task initiation: `Help Me Start`, `Start 2 Min`, `First Small Action`, `Minimum Version`, `Make Smaller`, and focus timer entry points in `app/(tabs)/index.tsx`.
- Re-entry: notification payloads carry `taskId`, and the main screen can expand, scroll to, and highlight exact tasks through `extractTaskNavigationPayload`, `queueNotificationTaskNavigation`, `focusTaskById`, and `scrollToTask`.
- Overwhelm reduction: sections collapse, Overwhelm Mode limits choices to three suggestions, and Energy-Based Task Matching opens a suggestion sheet instead of filtering the main list.
- Emotional safety: app copy leans toward "No guilt", "Small counts", "Move gently", and "softer start" language.
- Recovery: overdue pending tasks can be moved back into today with gentle wording.

This rating assumes the implemented flows work reliably on device. Notification actions, strong alarms, keyboard behavior, and stacked sheets still need manual verification on iOS and Android.

## 3. ADHD Support Strengths

### Help Me Start and task initiation

- **Feature name:** Help Me Start / Start Assist
- **Why it helps ADHD users:** Supports activation when a task feels too large or vague. It offers a first step, 2-minute focus entry, breakdown, Make Smaller, and stuck support instead of expecting the user to self-generate momentum.
- **Evidence:** `app/(tabs)/index.tsx` contains Start Assist state and handlers such as `handleStartAssistTwoMinutes`, `handleStartAssistShowFirstStep`, `handleStartAssistBreakDown`, `handleStartAssistOpenMakeEasier`, `handleStartAssistStuck`, and UI labels including `Help Me Start`, `Start 2-Minute Timer`, `First Small Action`, and `Smallest Useful Version`. Task fields `firstAction`, `minimumVersion`, `startAssistUsedCount`, and `stuckCount` are persisted in the tasks table.

### First Small Action and Minimum Version

- **Feature name:** First Small Action / Minimum Version
- **Why it helps ADHD users:** Gives the user a concrete starting point and permission to complete a smaller useful version, which reduces task paralysis.
- **Evidence:** `app/(tabs)/index.tsx` creates and stores `firstAction` and `minimumVersion`, displays them on task cards, and includes them in completed/pending task detail views. `utils/taskSearchHelpers.js` also searches these fields, making small-entry cues retrievable later.

### Task re-entry after distraction

- **Feature name:** Notification deep-linking and exact task re-entry
- **Why it helps ADHD users:** ADHD users often leave the app or get interrupted after reminders. Returning to the exact task reduces the working-memory cost of finding the right item again.
- **Evidence:** `utils/taskNavigationHelpers.js` builds reminder payloads with `taskId`, `sectionId`, `taskTitle`, `scheduledFor`, and `scheduledAt`; `app/(tabs)/index.tsx` handles notification responses, queues task navigation, and uses `focusTaskById` and `scrollToTask` to expand/navigate to a target. The app also has `Current Task` quick access through `findBestCurrentTask` in `utils/taskNavigationHelpers.js`.

### Time blindness support

- **Feature name:** Scheduled reminders, multi-stage reminders, focus timer, daily focus totals
- **Why it helps ADHD users:** Scheduled cues, visible focus state, and accumulated focus time help with "now/not-now" problems.
- **Evidence:** `app/(tabs)/index.tsx` schedules reminders through `scheduleProReminders`, tracks active focus through `startFocus`, `completeFocusSession`, and the `Active Focus` panel, and displays daily focus using `dailyStats.totalFocusTime`. `services/notificationService.js` schedules focus completion and task completion notifications.

### Reminder action tracking

- **Feature name:** Interactive reminder actions
- **Why it helps ADHD users:** Snooze, Start, Move, and Smaller actions preserve agency while providing data about friction.
- **Evidence:** `services/notificationService.js` registers task reminder actions `START_NOW`, `SNOOZE_10`, `SNOOZE_30`, `MOVE_GENTLY`, and `MAKE_SMALLER`. `app/(tabs)/index.tsx` persists `reminderOpenCount`, `reminderStartNowCount`, `reminderSnoozeCount`, `reminderMoveGentlyCount`, `reminderMakeSmallerCount`, `lastReminderAction`, and `reminderActionHistory`.

### Overwhelm Mode

- **Feature name:** Basic Overwhelm Mode
- **Why it helps ADHD users:** When the list is too much, the app reduces choices to a small set: Quick win, Important, and Feeling heavy.
- **Evidence:** `utils/overwhelmMode.js` selects at most three suggestions and labels them `Quick win`, `Important`, and `Feeling heavy`. `components/task/OverwhelmModeSheet.js` shows only those suggestions with `Go to Task`, `Start 2 Min`, `Start Small`, `Make Smaller`, and `Move Gently`.

### Energy-Based Task Matching

- **Feature name:** Energy-Based Task Matching dropdown and suggestion sheet
- **Why it helps ADHD users:** Lets users choose tasks based on current capacity without hiding or rearranging the main list unexpectedly.
- **Evidence:** `utils/energyTaskMatching.js` implements filters such as `Low energy`, `Quick win`, `Important`, `Needs focus`, `Can do anywhere`, `Feeling heavy`, and `Today only`. `getEnergyTaskSuggestions` defaults to seven suggestions and caps at twelve. `app/(tabs)/index.tsx` exposes `Find a task that fits me now` and opens `renderEnergyTaskSuggestionSheet`.

### Feeling Heavy / avoidance support

- **Feature name:** Avoidance signal and Feeling Heavy UI
- **Why it helps ADHD users:** The app detects patterns like repeated snoozing, moving gently, rescheduling, stuck presses, many subtasks, and overdue pending tasks, then recommends softer starts.
- **Evidence:** `utils/taskSupportSignals.js` calculates `getTaskAvoidanceSignal`, `isTaskFeelingHeavy`, and `getAvoidanceReasonText`. It uses reminder history, snooze counts, move-gently counts, make-smaller counts, reschedule count, stuck count, opened-without-completion count, overdue schedule, and missing Minimum Version. UI copy says things like "This may need a softer start" and "A smaller version may help."

### Emotional support and mood support

- **Feature name:** Mood tracker, affirmations, mood-aware copy
- **Why it helps ADHD users:** Shame and emotional load can block task initiation. The app normalizes difficult days and rewards returning.
- **Evidence:** `utils/affirmations.js` and `utils/moodHelpers.js` include supportive messages such as "Small progress still matters today", "Gentle progress is enough right now", and "One difficult moment does not define your day." `app/(tabs)/index.tsx` stores daily moods, displays Mood Today, and uses mood affirmations across daily, weekly, monthly, and yearly views.

### Recovery after slipped days

- **Feature name:** Recovery/reschedule flow
- **Why it helps ADHD users:** Prevents abandoned overdue tasks from becoming a shame backlog. It helps move tasks forward gently.
- **Evidence:** `app/(tabs)/index.tsx` implements `loadRecoveryPendingTasks`, `openRecoveryModal`, `openRecoveryModalFromTodayPlanTask`, `saveRecoveryEdit`, and recovery success copy such as "Moved gently. No reset needed." Empty/recovery copy includes "No guilt. You can bring one task back into today."

### Recurring task readiness

- **Feature name:** Recurring task generation and edit scope
- **Why it helps ADHD users:** Supports routines without requiring the user to recreate repeated tasks manually.
- **Evidence:** `utils/repeatTaskHelpers.js` defines daily, weekly, monthly, and yearly repeat settings. `utils/repeatTaskGenerator.js` builds the next recurring task instance, resets completion/subtasks, and keeps the next occurrence in the future. `app/(tabs)/index.tsx` stores repeat fields and has repeating task update/delete scope UI.

### Universal student and professional usefulness

- **Feature name:** Universal task model
- **Why it helps ADHD users:** The current task structure supports study, work, home/admin, follow-ups, focus sessions, and routines without splitting the app into modes.
- **Evidence:** `SECTION_ORDER` in `utils/sectionHelpers.js` uses Morning, Work, and Evening. Task metadata includes context, energy required, focus required, estimated minutes, repeat settings, scheduled time, subtasks, reminders, and pinned state.

## 4. ADHD Friction Points

### Large single-screen implementation

- **Problem:** `app/(tabs)/index.tsx` owns a very large amount of state, persistence, notifications, reminders, focus timer, mood, recovery, task rendering, search, Start Assist, and modals.
- **Why it matters for ADHD:** More implementation coupling increases the risk that one helpful feature accidentally blocks another, especially with overlays and focus/keyboard behavior.
- **File/component where observed:** `app/(tabs)/index.tsx`
- **Suggested improvement:** Gradually extract stable pieces into focused components/hooks, starting with read-only UI sections like task cards, daily progress, Start Assist sheet, recovery sheet, and energy suggestion sheet.

### Task cards may still be dense

- **Problem:** Expanded task cards can contain title, metadata pills, support signals, subtasks, First Small Action, Minimum Version, reminders, focus controls, mood controls, and actions.
- **Why it matters for ADHD:** Helpful options can become decision overload if many are visible at once.
- **File/component where observed:** `renderSection` and task card rendering in `app/(tabs)/index.tsx`
- **Suggested improvement:** Keep the current progressive disclosure, but consider an optional "simple card" or "next action only" view for low-capacity moments.

### Notification and strong alarm behavior needs device QA

- **Problem:** Reminder categories, notification response handling, strong alarms, and deep-link navigation are implemented, but platform behavior can differ across iOS, Android, Expo, permission states, and background conditions.
- **Why it matters for ADHD:** Re-entry is only useful if reminder taps reliably open the exact task.
- **File/component where observed:** `services/notificationService.js`, `services/androidClockAlarm.ts`, `app/_layout.tsx`, `app/(tabs)/index.tsx`
- **Suggested improvement:** Manual verification required on physical Android and iOS devices for normal reminder tap, Start, Snooze, Move, Smaller, focus completion notification, and strong alarm fallback.

### Modal and sheet stacking risk

- **Problem:** The app has several high-value overlays: task edit modal, Start Assist, recovery sheet, Overwhelm Mode, energy suggestions, mood prompt, snooze affirmation, date picker, and schedule picker.
- **Why it matters for ADHD:** Stacked or conflicting overlays can create a "where am I?" moment and break task re-entry.
- **File/component where observed:** `app/(tabs)/index.tsx`, `components/task/OverwhelmModeSheet.js`
- **Suggested improvement:** Add a manual QA checklist for transitions between search, energy suggestions, Start Assist, recovery, notification navigation, and edit modal.

### Keyboard overlap risk still needs manual verification

- **Problem:** The app uses `KeyboardAvoidingView`, scroll containers, and action rows, but mobile keyboards are platform-sensitive.
- **Why it matters for ADHD:** If Save/Cancel or the text field being edited is hidden, task capture becomes frustrating and abandonment-prone.
- **File/component where observed:** Task modal, Start Assist modes, recovery edit sheet in `app/(tabs)/index.tsx`
- **Suggested improvement:** Test Add Task, Edit Task, Minimum Version, First Small Action, breakdown input, recovery date/section editing, and search on small Android and iOS screens.

### Streaks can motivate, but may create pressure

- **Problem:** The app tracks current/best streaks and shows a streak badge, though it also has `Hide streak badge` and `Reset streak gently`.
- **Why it matters for ADHD:** Strict streak logic can create all-or-nothing feelings after missed days.
- **File/component where observed:** `productivityStats`, `showStreak`, `getStreakBadge`, and settings actions in `app/(tabs)/index.tsx`
- **Suggested improvement:** Keep streaks optional and framed as momentum, not proof of discipline. Avoid adding punitive streak loss copy.

### Medical positioning is not yet visible

- **Problem:** I did not find in-app or project documentation wording that clarifies the app does not diagnose, treat, cure, or replace clinician support.
- **Why it matters for ADHD:** ADHD-related products should avoid medical overclaims and set safe expectations.
- **File/component where observed:** No matching disclaimer found in scanned `app`, `components`, `utils`, `services`, or Markdown docs.
- **Suggested improvement:** Add a short medical disclaimer in About/Settings or onboarding.

## 5. Feature-by-Feature Assessment

| Area | Current Status | ADHD Value | Risk/Gap | Recommendation |
| ---- | -------------- | ---------- | -------- | -------------- |
| Task initiation | Strongly implemented through Help Me Start, Start 2 Min, breakdown, Start Small, Make Smaller, First Small Action, and Minimum Version. | Reduces activation energy and converts vague tasks into a doable first step. | Many controls can still feel like a lot on expanded cards. | Keep progressive disclosure; consider an optional "next action only" low-capacity mode. |
| Task re-entry | Implemented with notification task metadata, queued navigation, section expansion, scroll-to-task, highlight, Current Task, and search. | Helps users return after distraction without rebuilding context. | Needs manual verification across notification states and completed/pending task views. | Test all reminder action paths on device and document expected behavior. |
| Reminders | Implemented with scheduled reminders, multi-stage reminder offsets, interactive actions, notification categories, and strong alarm support. | Supports time blindness and preserves agency through Start/Snooze/Move/Smaller. | Platform notification permissions and action behavior can vary. | Add a focused QA matrix for iOS/Android foreground/background/terminated states. |
| Focus timer | Implemented with task-linked `startFocus`, active focus panel, focus completion, completion notification, and daily focus totals. | Creates a bounded start and visible time container. | Needs verification that focus panel remains discoverable and does not block core task controls. | Keep active focus visible but compact; test navigation back to the active task. |
| Overwhelm Mode | Implemented through `getOverwhelmSuggestions` and `OverwhelmModeSheet`; limited to three suggestions. | Reduces decision load and offers a safe one-step path. | The sheet has several actions per suggestion, which may be enough but still needs user testing. | Keep the three-card limit; consider making one primary action visually dominant. |
| Energy-Based Task Matching | Implemented as dropdown plus suggestion sheet, not main-list filtering. | Helps users choose based on current capacity without losing the full list. | Seven suggestions may be high for some low-energy states. | Consider reducing default display to 3-5 on low-energy or overwhelmed mood states. |
| Feeling Heavy / Avoidance Detection | Implemented in `taskSupportSignals` using snooze, move gently, make smaller, reschedule, stuck, opened-without-completion, overdue, and subtasks. | Gently identifies friction and suggests softer starts. | Avoidance score is heuristic; false positives are possible. | Keep language non-judgmental and expose this as "may be feeling heavy", not a diagnosis or label. |
| Minimum Version / First Small Action | Implemented as stored task fields, visible card sections, Start Assist edit modes, search fields, and completed task details. | Excellent for initiation and re-entry. | User may skip adding them during task creation if optional. | Keep optional, but prompt gently when a task is repeatedly snoozed or marked stuck. |
| Mood support | Implemented with daily moods, mood tracker views, mood-aware affirmations, task mood, and mood header support. | Supports emotional regulation and shame reduction. | Mood tracking can become another task if overemphasized. | Keep mood check-in lightweight and skippable. |
| Recovery/reschedule | Implemented with overdue pending task recovery, Move Gently, no-guilt copy, and reschedule counts. | Helps users restart after slipped days instead of abandoning the list. | Needs QA around target task highlight and date picker transitions. | Keep recovery visible but gentle; test from Today Plan, reminders, and Start Assist. |
| Recurring tasks | Implemented with repeat types, repeat group IDs, recurrence labels, next-instance generation, and edit/delete scopes. | Supports routines without manual re-creation. | Strict habit tracking is not implemented and should not be assumed. | Use recurrence as task support, not strict habit enforcement. |
| Progress/streaks | Implemented through daily stats, focus totals, completed counts, current/best streak, hide streak, and reset streak gently. | Can build momentum and make effort visible. | Streaks can create pressure after missed days. | Keep streak optional, gentle, and framed as momentum rather than compliance. |

## 6. Language and Emotional Safety Review

The app generally uses ADHD-safe language. I did not find obvious user-facing shame labels such as "lazy", "bad", "missed again", "procrastinating", "ignored", or "overdue pressure" in the scanned app code. The word "failed" appears in technical error names/logging, such as strong alarm scheduling failure and scroll failure handlers, not as productivity judgment.

Positive language found:

- "No guilt. Your reminder will return gently. When you come back, one tiny step is enough." in `app/(tabs)/index.tsx`
- "No guilt. Let's find a better time." in recovery/move-gently flows
- "Moved gently. No reset needed." in recovery flow
- "This may need a softer start." in Feeling Heavy support
- "Small counts. Start with the minimum version." in Start Assist flows
- "You do not need to do everything right now. Pick one small next step." in `components/task/OverwhelmModeSheet.js`
- "Choose one. Not all." in `components/task/OverwhelmModeSheet.js`
- "Difficult days still count." and "One difficult moment does not define your day." in `utils/moodHelpers.js`

Recommended replacement language if harsh terms are introduced later:

| Avoid | Prefer |
| ----- | ------ |
| failed | still waiting |
| lazy | low energy / needs a softer start |
| bad | hard / heavy / not the right time yet |
| missed again | ready to restart today |
| procrastinating | feeling stuck / task may be heavy |
| ignored | not opened yet / still waiting |
| overdue pressure | move gently / choose a better time |

Keep "overdue" as an internal or neutral scheduling concept when needed, but avoid making it the emotional headline.

## 7. ADHD UX Review

- **Visual clutter:** The app uses collapsible Morning, Work, Evening, and Pinned sections, which helps reduce visual load. Expanded task cards are useful but dense, so the main UX risk is option overload inside a single task.
- **Number of choices:** Overwhelm Mode is strong because it limits suggestions to three. Energy-Based Task Matching is helpful but defaults to up to seven suggestions, which may be too many for very low-capacity states.
- **Dropdown/sheet usability:** The energy dropdown plus sheet is a good pattern because it avoids silently filtering the main list. The user can explore suggestions without losing their original context.
- **Task card complexity:** Task cards include many ADHD supports, including reminders, focus, subtasks, mood, heavy-task cues, first action, and minimum version. This is powerful but should remain collapsed by default unless the task is the re-entry target.
- **Button placement:** Floating buttons use computed bottom offsets for recovery, Add Task, and current/focus quick access in `app/(tabs)/index.tsx`. This reduces blocking risk, but needs manual verification on devices with different safe areas.
- **Keyboard overlap risks:** `KeyboardAvoidingView` and scroll containers are present for major modals, but Add/Edit Task, Start Assist inputs, search, and recovery editing need manual device verification.
- **Add Task / Current Task blocking:** The code computes separate floating positions for recovery, Add Task, and focus/current task controls. No obvious blocking issue is visible from code, but this should be checked on small screens and with the keyboard open.
- **Sections reduce overwhelm:** Yes. `renderSection` supports section expand/collapse, section-specific affirmations, and task expansion. This helps users scan one time/context bucket instead of the whole day.

## 8. Priority Improvement Recommendations

### 1. Add a safe medical disclaimer

- **What to improve:** Add a concise disclaimer in About/Settings or onboarding.
- **Why it helps ADHD users:** Sets safe expectations without implying diagnosis or treatment.
- **Estimated complexity:** Low
- **Suggested implementation area/file:** Settings/Profile area in `app/(tabs)/index.tsx`, or a small About component if settings are extracted later.

### 2. Create a device QA checklist for re-entry and overlays

- **What to improve:** Manually test notification tap, Start, Snooze, Move, Smaller, strong alarm, focus completion, Current Task, search result navigation, energy suggestion navigation, recovery sheet, and edit modal transitions.
- **Why it helps ADHD users:** The app's best ADHD value depends on reliable re-entry after distraction.
- **Estimated complexity:** Medium
- **Suggested implementation area/file:** QA document plus verification around `app/(tabs)/index.tsx`, `services/notificationService.js`, `services/androidClockAlarm.ts`, and `app/_layout.tsx`.

### 3. Gradually extract the main screen into smaller components/hooks

- **What to improve:** Split the largest stable sections out of `app/(tabs)/index.tsx`.
- **Why it helps ADHD users:** Reduces regression risk in high-value support flows like recovery, reminders, Start Assist, and task re-entry.
- **Estimated complexity:** High
- **Suggested implementation area/file:** Start with `components/task/TaskCard`, `components/task/StartAssistSheet`, `components/task/RecoverySheet`, and hooks for reminders/focus/recovery.

### 4. Add an optional low-capacity task card presentation

- **What to improve:** Provide a simple card state that prioritizes one next action, one start button, and one reschedule/move option.
- **Why it helps ADHD users:** Reduces cognitive load when the user is already overwhelmed.
- **Estimated complexity:** Medium
- **Suggested implementation area/file:** `renderSection` task card area in `app/(tabs)/index.tsx`; later extract to `components/task/TaskCard`.

### 5. Keep streaks optional and gentle

- **What to improve:** Preserve `Hide streak badge` and `Reset streak gently`; avoid punitive streak copy.
- **Why it helps ADHD users:** Momentum can motivate, but strict streak pressure can trigger shame and abandonment.
- **Estimated complexity:** Low
- **Suggested implementation area/file:** Productivity/settings portions of `app/(tabs)/index.tsx`.

## 9. What Not To Add Yet

- Strict habit streaks or penalties for missed days
- Too many badges, ranks, or gamified pressure
- Complex analytics dashboards before the core flows are device-tested
- Separate Student Mode and Professional Mode unless real user research shows the universal model is not enough
- Loud animations or high-stimulation effects
- Excessive notifications or reminder escalation without user control
- Medical claims, diagnosis language, treatment language, or clinician-replacement positioning
- A large AI planning layer before the simpler start/restart/recover loops are fully reliable

## 10. Final Product Positioning

An ADHD-friendly task manager that helps users start, restart, and recover with one small next step.

Alternative positioning:

- A calm task manager for ADHD brains that turns overwhelming tasks into small, recoverable next actions.
- A focus and recovery task system for people who need gentle reminders, flexible starts, and no-guilt rescheduling.

## 11. Medical Disclaimer Recommendation

Recommended in-app wording:

> This app supports planning, focus, reminders, and self-management. It does not diagnose ADHD, replace therapy, or provide medical treatment. For diagnosis, medication, or crisis support, contact a qualified professional.

Placement recommendation: Settings/About, onboarding footer, or first-run support screen. Keep it short and calm so it does not feel like legal clutter inside the daily task flow.
