# Graph Task Status Indicator Design

## Goal

Keep background graph-build progress available without covering page content or duplicating the sidebar QA navigation.

## Interaction

- The persistent trigger is labelled `图谱任务状态`.
- Active task count is shown as a separate compact badge when non-zero.
- The standalone `问答首页` button and its shell event/handler are removed.
- Clicking the trigger toggles the task popover; the close button and Escape key collapse it.
- The popover has a viewport-bounded maximum height and scrolls internally when task rows overflow.
- Project-specific `查看进度` and `去问答` actions remain available inside task rows.

## Accessibility and responsive behavior

- The trigger continues to expose `aria-expanded` and `aria-controls`.
- Closing restores focus to the trigger.
- Mobile keeps a viewport-bounded scroll region below the fixed header.

## Scope

Only the frontend indicator, persistent shell wiring, and focused tests change. Backend code and graph-task monitoring behavior do not change.
