# AGENTS.md

## Project purpose

This is a static, framework-free Vite application for exploring separated
eigenmodes of the scalar two-dimensional wave equation on a fixed square. It
must remain usable without a backend and deploy safely at a GitHub Pages
repository subpath.

## Mathematical invariants

- The domain is `0 <= x,y <= L` and the boundary condition is Dirichlet:
  `u = 0` on all four sides. This is a membrane/wave model, not Kirchhoff plate
  bending theory.
- Allowed indices are integers `1 <= nx,ny <= 8`.
- The normalized spatial mode is
  `phi = sin(nx*pi*x/L) sin(ny*pi*y/L)` and the angular frequency is
  `omega = (pi*c/L) sqrt(nx^2 + ny^2)`.
- Interior nodal lines are exactly `x = kL/nx` and `y = jL/ny`. Derive both the
  visible lines and their description from the spatial mode, never from the
  instantaneous animation phase.
- Animation timing always preserves the exact modal-frequency ratio
  `sqrt((nx^2 + ny^2) / 2)` relative to `(1,1)`, with a deliberately slow
  10-second visual cycle for the fundamental. Do not label browser time as
  physical time while `c` and `L` remain symbolic.
- Color and height encode instantaneous signed displacement. Nodal lines,
  labels, and geometry must keep the view understandable without color alone.

## Architecture

- Keep semantic HTML, DOM wiring, and lifecycle in `index.html` and
  `src/app.ts`.
- Keep accepted state and validation in `src/ui/controller.ts`.
- Keep pure wave functions and nodal metadata in `src/math/`.
- Keep Three.js resources, phase, camera state, and animation scheduling in
  `src/membrane/`.
- Preserve Vite's relative `base: "./"` and the single test/build/deploy
  workflow.

## UX and verification

- The membrane is a full-viewport layer centered on the page. Desktop controls
  are overlays and must not reserve a layout column or shift the surface.
- Preserve visible KaTeX `n_x` and `n_y` labels and explicit values; never
  communicate selection through color alone.
- Keep both mode controls native, keyboard accessible, and at least 44 CSS
  pixels across their interactive axis.
- Preserve clean view, renderer fallback/retry, reduced-motion behavior, and
  keyboard camera controls.
- Run unit tests, typecheck, production build, browser smoke tests, and visual
  desktop/mobile inspection for interaction or layout changes. Run the browser
  benchmark for rendering-performance changes.
