## BUILDS

### Verify Commands
- Dev server: `npm run dev` (starts Vite at localhost:5173)
- Production build: `npm run build` (outputs to `dist/`)

### Known Issues
- "Cannot access 'Zt' before initialization" — production bundle TDZ error. Occurs on Vite production builds when module concatenation creates temporal dead zone for `const` variables. Likely caused by Rollup's scope hoisting reordering module-level `const` declarations incorrectly.
- Supabase env vars (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) are empty — no cloud sync, local storage only.
