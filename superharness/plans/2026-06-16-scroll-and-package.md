# Plan: Authorization card scrollable + package as double-clickable exe

Date: 2026-06-16
Branch: feat/scroll-and-package

## Goal

1. **Scroll/visibility fix** — authorization (permission) and question cards
   currently clip long content (`.row-desc { max-height: 48px; overflow: hidden }`)
   and the window has no height cap, so long content is unreachable. Make panel
   content fully visible and scrollable, and cap the window height to the screen.
2. **Packaging** — add electron-builder so a non-developer can run a double-clickable
   Windows exe instead of `npm start`.

## Assumptions

- Window height must never exceed the primary display work area (minus top margin).
- When content exceeds the cap, the panel scrolls internally (not the row-desc).
- Packaging targets Windows; portable + NSIS are reasonable defaults.

## Tasks (TDD)

### Task 1 — `clampWindowHeight` pure function + cap window to screen
- RED: `test/windowLayout.test.js` — new pure module `src/main/windowLayout.js`
  exporting `clampWindowHeight(requested, available, { min, topMargin })`. Assert:
  small requested passes through; requested > available is clamped to
  `available - topMargin`; values below `min` floor to `min`.
- GREEN: implement the pure function.
- Wire `main.js positionTopCenter` to use it with `screen.getPrimaryDisplay().workArea.height`.
- Commit.

### Task 2 — CSS: scrollable panel, remove row-desc hard clip
- Make `.panel` scrollable: `max-height` bound to viewport, `overflow-y: auto`.
- Replace `.row-desc { max-height: 48px; overflow: hidden }` with a larger,
  scrollable cap (`overflow-y: auto`) so full command text is reachable.
- Keep `html, body { overflow: hidden }` (frameless) but let `.panel` scroll.
- This is CSS-only behavior; guard with a renderModel/integration assertion where
  feasible, otherwise verify by inspection + existing suite stays green.
- Commit.

### Task 3 — electron-builder packaging config
- RED: `test/packaging.test.js` — assert `package.json` has a `build` block with
  `appId`, a Windows `win.target`, and a `dist`/`pack` npm script.
- GREEN: add electron-builder devDependency + `build` config + scripts.
- Verify `npx electron-builder --help` resolves (no full build in CI to keep fast).
- Commit.

## Verification
- `npm test` full suite green.
- Manual note: launch, trigger a long permission, confirm scroll.
