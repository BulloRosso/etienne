# Quick Actions — Migration List

Tracks every artifact created or modified for the global Quick Actions feature.

## Created files

- `backend/src/quick-actions/dto/quick-actions.dto.ts` — payload types (`QuickActionDto`, `QuickActionsDto`)
- `backend/src/quick-actions/quick-actions.service.ts` — read/write `<workspace>/.agent/quick-actions.json`
- `backend/src/quick-actions/quick-actions.controller.ts` — `GET /api/quick-actions` (public), `POST /api/quick-actions` (role: user)
- `backend/src/quick-actions/quick-actions.module.ts` — NestJS module
- `frontend/src/utils/iconRegistry.js` — shared react-icons lookup (allReactIcons, reactIconNames, POPULAR_ICONS, getIcon)
- `frontend/src/components/IconPickerDialog.jsx` — reusable icon-picker dialog
- `frontend/src/components/QuickActions.jsx` — chat-pane row (iconed → bare icon + tooltip; non-iconed → outlined button)
- `frontend/src/components/QuickActionsAdmin.jsx` — dashboard editor (load/edit/save, reorder, icon picker)

## Changed files

- `backend/src/app.module.ts` — imported and registered `QuickActionsModule`
- `frontend/src/components/ChatPane.jsx` — imported `QuickActions`, rendered above `ChatInput`, reused `editingMessage` state to populate the input on click
- `frontend/src/components/DashboardGrid.jsx` — added `quickactions` tile (always enabled, not project-scoped, `minRole: 'user'` — visible to user and admin, hidden from guest) using `/quickactions.png`
- `frontend/src/components/ProjectMenu.jsx` — imported `QuickActionsAdmin`, added open-state, dispatch case in `handleDashboardItemClick`, and a Dialog rendering the editor
- `frontend/src/components/SettingsModal.jsx` — same wiring (this is the second entry point for dashboard tiles)
- `frontend/public/i18n/en/dashboard.json` — added `itemQuickActions: "Quick Actions"`
- `frontend/public/i18n/de/dashboard.json` — added `itemQuickActions: "Schnellaktionen"`
- `frontend/public/i18n/it/dashboard.json` — added `itemQuickActions: "Azioni rapide"`
- `frontend/public/i18n/zh/dashboard.json` — added `itemQuickActions: "快捷操作"`

## Notes

- The existing per-project `welcomePage.quickActions` in `.etienne/user-interface.json` (rendered on the WelcomePage) is untouched and continues to coexist with this new global feature.
- The KnowledgeViewer's inline icon picker was not migrated to the shared `IconPickerDialog`/`iconRegistry`. Follow-up: deduplicate when convenient.
