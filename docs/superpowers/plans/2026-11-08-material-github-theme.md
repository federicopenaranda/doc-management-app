# GitHub-style Material theme and app shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SCRUM-6: give the frontend a GitHub-looking Angular Material theme (dark and light, following the OS) and an app shell with a thin toolbar, an overlay left menu and a `/`-focused search input.

**Architecture:** The theme is one SCSS file in `frontend/src/themes/` that sets Material 3 tokens with GitHub (Primer) colors for both schemes; `styles.scss` pulls it in with one `@use`. The shell is a parent route component (`Shell`) wrapping every page; a runtime flag `shellEnabled` decides whether it draws the toolbar and menu (the single `<main>` is always there). The "Hello" content moves out of `App` into a `HomePage` route so `App` is only a router outlet.

**Tech Stack:** Angular 22 (standalone, Signals, OnPush), Angular Material/CDK 22, Tailwind 4, Vitest + Angular Testing Library, `node --test` for the SCSS check.

**Spec:** `docs/superpowers/specs/2026-11-08-material-github-theme-design.md`

## Global Constraints

- All work in `frontend/`. Branch `feature/scrum-6-github-theme` off `main`. Do not stage the unrelated `backend/package-lock.json` change.
- Standalone components, `ChangeDetectionStrategy.OnPush`, Signals, lazy-loaded routes. Zero `any`.
- Tailwind + Angular Material/CDK. Material icons for all icons (`index.html` already loads Material Symbols Outlined; make `mat-icon` use that font set).
- Texts use Angular's `i18n` / `i18n-aria-label` attributes with English source strings (as `uploads/upload-page.ts` does). No new dependency.
- Feature flag `shellEnabled` follows the `uploadsEnabled` pattern in `AppConfigService`. It gates the shell only; the theme always applies. Mark it with the same two-weeks-removal comment.
- Search input: in the toolbar, right-aligned, no icon inside it, small `/` hint badge, no popup. Pressing `/` only focuses it.
- Left menu: opens from the hamburger, overlays the content with a dark scrim, closes on any outside click (the scrim).
- Narrow screens: search input shrinks, system name hides.
- Toolbar order: hamburger, system icon + name, gap, search, create-document dropdown (3 test options), notifications button, profile photo/menu (icon or initials placeholder).
- Strict TDD per task: failing test first, watch it fail, then implement.
- Commits: Conventional Commits, author email must be the GitHub noreply address (check `git config user.email`), end messages with the Claude co-author trailer from the session's attribution rule.
- Before the last commit: `npm test`, `npm run lint`, `npx prettier --check .`, `npx stylelint "**/*.scss"`, `npx knip`, `npm audit` all clean.

## Review Focus

1. `/` typed inside any input, textarea, select or contenteditable must type the character, not move focus (Task 4).
2. `Ctrl+/`, `Cmd+/`, `Alt+/` must not be hijacked (Task 4).
3. `Escape` closes the open menu and puts focus back on the hamburger (Task 5).
4. Clicking a menu entry closes the menu (Task 5).
5. Flag off: exactly one `<main>`, no toolbar, no menu, pages still render (Task 3).

## File Structure

- Create `src/themes/github.scss`: both color schemes, compact density, font stack.
- Modify `src/styles.scss`: replace the inline theme with `@use './themes/github';` and keep the body reset.
- Create `scripts/themes.spec.mjs`: compiles the theme and checks key values.
- Modify `src/app/app-config.service.ts` (+ spec): `shellEnabled`.
- Create `src/app/hello/home-page.ts` (+ spec): old `App` content. Modify `src/app/app.ts`, `app.html`, `app.spec.ts`.
- Create `src/app/shell/shell.ts`, `toolbar.ts`, `side-menu.ts`, `is-typing-target.ts` (+ specs).
- Modify `src/app/app.routes.ts` and `app.routes.spec.ts`.

---

### Task 1: Feature flag `shellEnabled`

**Files:** Modify `src/app/app-config.service.ts`; Test `src/app/app-config.service.spec.ts`

**Interfaces:** Produces `AppConfigService.shellEnabled: boolean` (getter, defaults to `false` when absent; accepts `true`/`false` and `"true"`/`"false"`; anything else throws `config.json: "shellEnabled" must be true or false`).

- [ ] **Step 1:** Add tests mirroring the existing `uploadsEnabled` ones: `shellEnabled` defaults to false when missing; reads `true`; reads string `"true"`; rejects `"yes"` with the message above.
- [ ] **Step 2:** Run `npm test` (or `npx ng test --include src/app/app-config.service.spec.ts`). Expected: the new tests FAIL.
- [ ] **Step 3:** Generalize the existing boolean parsing into one helper used by both flags; add the `shellEnabled` field and getter.
- [ ] **Step 4:** Run the same command. Expected: PASS, old `uploadsEnabled` tests still pass.
- [ ] **Step 5:** Commit `feat(frontend): add shellEnabled feature flag`.

### Task 2: Move the Hello page into a `HomePage` route

**Files:** Create `src/app/hello/home-page.ts`; Modify `src/app/app.ts`, `src/app/app.html`, `src/app/app.scss` (delete if empty), `src/app/app.routes.ts`; Move tests `app.spec.ts` to `hello/home-page.spec.ts`; Test `src/app/app.routes.spec.ts`

**Interfaces:** Produces `HomePage` (selector `dms-home-page`, default export none, named `HomePage`), same behavior and template as today's `App` minus the outer `<main>` (use a `<section>`; the shell will own `<main>`), keeps `<h1>Hello, doc-management</h1>`, the "Say hello to the API" button, the upload link, status and alert. `App` becomes only `<router-outlet />`. Routes: `{ path: '', pathMatch: 'full', loadComponent: () => import('./hello/home-page').then((m) => m.HomePage) }` added next to `upload`.

- [ ] **Step 1:** Move the six `App` tests into `home-page.spec.ts`, rendering `HomePage`. Add to `app.routes.spec.ts`: `navigateByUrl('/')` renders the heading "Hello, doc-management".
- [ ] **Step 2:** Run `npm test`. Expected: FAIL (`HomePage` does not exist).
- [ ] **Step 3:** Create `HomePage` by moving the class body and template from `App`; reduce `App` to a router outlet; add the home route.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `refactor(frontend): move hello page into a home route`.

### Task 3: `Shell` parent route and the flag-off path

**Files:** Create `src/app/shell/shell.ts`; Modify `src/app/app.routes.ts`; Test `src/app/shell/shell.spec.ts`, `src/app/app.routes.spec.ts`

**Interfaces:** Consumes `AppConfigService.shellEnabled`. Produces `Shell` (selector `dms-shell`): template is `@if (shellEnabled) { toolbar + menu (added by Tasks 4 and 5) }` then `<main class="..."><router-outlet /></main>`. Routes become one parent `{ path: '', loadComponent: () => import('./shell/shell').then((m) => m.Shell), children: [home, upload] }`; the `upload` child keeps its `canMatch` flag.

- [ ] **Step 1:** Tests in `shell.spec.ts`: with `shellEnabled: false`, renders exactly one `main` landmark and no `banner` (toolbar) role; with `true`, still exactly one `main`. In `app.routes.spec.ts`, add `shellEnabled` to the config stub and keep the two upload tests passing, plus: `/upload` content lives inside the shell's `main`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `Shell` (OnPush, imports `RouterOutlet`) and restructure routes as above.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(frontend): add shell parent route`.

### Task 4: Toolbar and the `/` shortcut

**Files:** Create `src/app/shell/toolbar.ts`, `src/app/shell/is-typing-target.ts`; Modify `shell.ts`; Test `toolbar.spec.ts`, `is-typing-target.spec.ts`, `shell.spec.ts`

**Interfaces:**
- Produces `isTypingTarget(target: EventTarget | null): boolean` (true for `input`, `textarea`, `select`, any `isContentEditable` element).
- Produces `Toolbar` (selector `dms-toolbar`, role `banner`): `menuToggle = output<void>()`, `focusSearch(): void`. Contains, in order: hamburger button (`aria-label` "Open menu", `aria-expanded` bound to a `menuOpen = input<boolean>(false)`), system icon + name "DMS" (name hidden below Tailwind `sm`), a `<div class="flex-1">` gap, `<input type="search">` with `aria-label` "Search" and a `/` badge, a "Create" `matMenu` button with 3 test items ("Test document 1/2/3"), notifications icon button, profile icon button with `matMenu` (Profile, Documents, Settings). Height compact (about 32 to 40px). Search input: `min-w-0 flex-1 max-w-xs`, no icon inside.
- `Shell` listens to `document:keydown`.

- [ ] **Step 1:** Write tests. `isTypingTarget`: true for an input, a textarea, a select, a `div[contenteditable]`; false for a button and for `null`. `Toolbar`: buttons "Open menu", "Create", "Notifications" and a "Search" textbox exist in the DOM order given; clicking the hamburger emits `menuToggle`; the Create menu lists 3 items; the search input contains no `mat-icon`. `Shell` (flag on): pressing `/` on `document.body` focuses the search input and `preventDefault`s; pressing `/` while an input has focus does not move focus; `Ctrl+/`, `Meta+/`, `Alt+/` do not move focus.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `isTypingTarget`, `Toolbar` (Tailwind for layout, `MatIconButton`, `MatMenu`, `MatIcon`), and in `Shell` a `(document:keydown)` host handler that calls `toolbar.focusSearch()` via `viewChild`, only when `event.key === '/'`, no ctrl/meta/alt, and `!isTypingTarget(event.target)`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(frontend): add toolbar with slash-to-search`.

### Task 5: Left menu with scrim

**Files:** Create `src/app/shell/side-menu.ts`; Modify `shell.ts`; Test `side-menu.spec.ts`, `shell.spec.ts`

**Interfaces:** Produces `SideMenu` (selector `dms-side-menu`): `open = input.required<boolean>()`, `closed = output<void>()`. Renders a `nav` (aria-label "Main menu") with placeholder entries Home (`routerLink="/"`), Documents, Shared, Settings, plus a full-screen scrim `<button>`/div that emits `closed` on click. Overlays the content (fixed, below the toolbar), compact width. `Shell` owns `menuOpen = signal(false)`, toggles it from `Toolbar.menuToggle`, passes `[menuOpen]` to the toolbar.

- [ ] **Step 1:** Tests. `SideMenu`: when `open` is false the nav is not in the DOM; when true it is; clicking the scrim emits `closed`; clicking an entry emits `closed`. `Shell`: clicking "Open menu" shows the nav and sets `aria-expanded="true"`; clicking the scrim hides it; `Escape` hides it and focus returns to the hamburger button; clicking a menu entry hides it.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `SideMenu` and wire it into `Shell` (Escape handling via the same document keydown handler; restore focus with the toolbar's hamburger `ElementRef`).
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(frontend): add overlay left menu`.

### Task 6: GitHub theme in `src/themes/`

**Files:** Create `src/themes/github.scss`, `scripts/themes.spec.mjs`; Modify `src/styles.scss`

**Interfaces:** Produces the global theme: `html { color-scheme: light dark; }` and Material 3 system variables set with `mat.theme(...)` using `density: -2`, a system font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`), and the Primer colors below overriding `--mat-sys-*` surface/text/primary/outline variables through `light-dark(light, dark)`.
Primer values to use: dark canvas `#0d1117`, dark subtle surface `#161b22`, dark border `#30363d`, dark text `#e6edf3`, dark muted text `#8b949e`, dark accent `#388bfd`; light canvas `#ffffff`, light subtle `#f6f8fa`, light border `#d0d7de`, light text `#1f2328`, light muted `#656d76`, light accent `#0969da`. `styles.scss` keeps only `@use './themes/github';` and the existing body reset; the body drops its fixed `color-scheme: light`.

- [ ] **Step 1:** `scripts/themes.spec.mjs` using `sass` (already installed through the Angular toolchain; verify with `npm ls sass`): compile `src/themes/github.scss` with `loadPaths: ['node_modules']` and assert the CSS contains `color-scheme: light dark`, `#0d1117`, `#ffffff`, `#388bfd`, `#0969da`, and `Segoe UI`.
- [ ] **Step 2:** Run `npm run test:scripts`. Expected: FAIL (file missing).
- [ ] **Step 3:** Write `github.scss`; reduce `styles.scss` as described.
- [ ] **Step 4:** Run `npm run test:scripts` and `npm run build`. Expected: PASS and build OK (check the initial bundle stays within the existing budget).
- [ ] **Step 5:** Commit `feat(frontend): add GitHub-style Material theme`.

### Task 7: Full check and manual look

**Files:** none new (fix whatever fails); possibly `public/config.json` locally for testing only (do not commit it).

- [ ] **Step 1:** Run, in `frontend/`: `npm test`, `npm run test:scripts`, `npm run lint`, `npx prettier --check .`, `npx stylelint "**/*.scss"`, `npx knip`, `npm audit`, `npm run build`. Expected: all clean. Fix and re-run until they are.
- [ ] **Step 2:** Add `"shellEnabled": true` to the local `public/config.json`, run `npm run start`, open the app. Check by eye in OS dark and OS light: GitHub-like colors, compact toolbar, hamburger opens/closes the menu, `/` focuses search, narrow window hides the name. Take a screenshot of each scheme with the Playwright tools.
- [ ] **Step 3:** Revert the local `config.json` change. Push the branch and open a PR to `main` titled `feat(frontend): GitHub-style theme and app shell (SCRUM-6)`, description with the checks above and the PR attribution line.
- [ ] **Step 4:** Add `.superpowers/` to `.gitignore` in the same PR (the brainstorm mockups live there), and stop the visual companion server.

## Self-Review notes

- Spec coverage: themes folder (T6), dark and light, follows OS (T6), toolbar order and placeholders (T4), left menu overlay and scrim (T5), search focus and no popup (T4), flag scope (T1, T3), routing and single `main` (T2, T3), i18n and a11y (Global Constraints and tests), narrow screens (T4), profile placeholder (T4).
- Names used across tasks: `Shell`, `Toolbar`, `SideMenu`, `HomePage`, `menuToggle`, `menuOpen`, `focusSearch`, `isTypingTarget`, `shellEnabled`.
