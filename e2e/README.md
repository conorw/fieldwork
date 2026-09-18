# UI / e2e tests (Playwright)

Happy-path demos run against `/dev/*` pages (no live Supabase). Each passing test records a `.webm` under `e2e/videos/`.

## Record all scenario videos

```bash
# Uses existing Vite on :3001 when available
npm run test:e2e:videos
```

## Videos produced

| File | Scenario |
|------|----------|
| `new-cemetery-onboarding.webm` | Create cemetery → teach 3 stones → offline learning → map |
| `auth-sign-in.webm` | Email sign-in |
| `auth-sign-up.webm` | Create account |
| `join-cemetery.webm` | Search & request to join public cemetery |
| `teach-finish-later.webm` | Defer teaching, continue field work |
| `headstone-confirm.webm` | Review / confirm AI names |
| `map-browse.webm` | Map markers → plot info → details |
| `create-plot-photo.webm` | Camera/gallery plot wizard with names |
| `create-plot-skip-photo.webm` | Create plot without photo |
| `create-plot-map-point.webm` | Add plot at map location |
| `plots-search-filter.webm` | Plots list search & status filter |
| `plot-detail-edit.webm` | Edit plot metadata + add person |
| `settings-facility-ai.webm` | Switch facility, AI status, teach from settings |
| `app-shell-nav.webm` | Map ↔ Plots ↔ Settings + sign out |
| `location-admin.webm` | Cemetery settings, invite, approve, remove member |

## Demo URLs

- http://127.0.0.1:3001/dev/onboarding-demo
- http://127.0.0.1:3001/dev/usage-demo?scenario=map-browse
