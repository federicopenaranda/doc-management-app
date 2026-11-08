# SCRUM-6: GitHub-style Angular Material theme and app shell

Date: 2026-11-08. Status: draft, waiting for approval.

## Intent

The frontend today is the default Material azure theme (light only) and a "Hello" test page. The owner wants the app to look and feel like GitHub: compact, a thin toolbar, and most of the screen for content. This ticket delivers the look (theme) and the page layout (shell) together.

## Goals

1. **Theme:** an Angular Material theme that copies GitHub's design: dark and light palettes, compact density, GitHub-like fonts and component styling.
2. **Themes folder:** the theme lives in `frontend/src/themes/` so more themes can be added later as new files, without touching existing ones.
3. **Follows the system:** the app uses the computer's dark or light setting (`prefers-color-scheme`). No manual toggle here.
4. **Shell:** a layout component wrapping every page, with:
   - A thin top toolbar, left to right: hamburger button, system icon and name, a gap, search input, create-document dropdown, notifications button, user profile photo and menu.
   - A left menu that opens over the content when the hamburger is clicked, and closes as soon as the user clicks anywhere outside it.
   - A big content area under the toolbar (the router outlet).
5. **Search:** a text input in the toolbar, right-aligned, no icon inside it, with a small `/` hint. Pressing `/` anywhere (when not already typing in a field) moves focus into the input. No popup, no overlay.

## Non-goals

- The manual dark/light toggle button (SCRUM-14).
- Real behavior behind the toolbar items: search results, document creation, notifications, user profile (SCRUM-9 to SCRUM-13 and later). These are visible placeholders only. The create-document dropdown shows 3 test options.
- Login, users, roles (other tickets).
- Any backend change.

## Anti-goals (a failure even if it technically works)

- The toolbar takes noticeable vertical space or the content area feels cramped by chrome.
- The `/` key hijacks typing in other inputs, or opens any popup.
- Adding a theme requires editing the shell or existing themes.
- Colors that look like GitHub in one scheme only.

## Constraints (from CLAUDE.md)

- Standalone components, `ChangeDetectionStrategy.OnPush`, Signals, lazy-loaded routes.
- Tailwind CSS plus Angular Material/CDK. Material Icons for icons.
- TypeScript `strict`, no `any`.
- Texts must be i18n-ready (no hard-coded strings scattered in templates).
- Strict TDD: tests first (Vitest + Angular Testing Library), watch them fail, then implement.
- Feature flag for new functionality, following the existing `uploadsEnabled` pattern in `config.json` (my call, see below).
- Before commit: tests pass 100%, eslint, prettier, stylelint, `npx knip`, `npm audit`.
- Accessibility: the menu and search must work by keyboard; the hamburger has a label; focus is visible.

## Decisions made by the owner

- Look inspired by GitHub: compact view, small toolbar, big content space.
- Left menu opens from the hamburger and closes on any outside click.
- Search is an input in the toolbar (not a popup), focused by typing `/`. No icon in the input, aligned right.
- Build both dark and light palettes in this ticket.
- Follow the computer's dark/light setting.
- Do both the theme and the layout in SCRUM-6.

## Calls I made (owner should check)

- Existing stack stays: Material's `mat.theme()` mixin (Material 3 tokens) is used to define the themes, not a custom component library. The current `styles.scss` theme block moves into `src/themes/`.
- Menu entries are placeholders (Home, Documents, Shared, Settings) with no real routes yet.
- The `/` hint is shown in the input as a small key badge.
- The shell is behind a feature flag in `config.json` (name chosen by the builder, e.g. `shellEnabled`), per the CLAUDE.md rule; flag removal after 2 weeks is tracked there. When off, the app renders as today.
- GitHub color values are taken from GitHub's published Primer palette, approximated by eye; exact parity is not required.

## Calls added after the builder check (owner should check)

- **Flag scope:** the flag gates the shell only. The GitHub theme always applies. When the flag is off, the app renders the current pages, now with the new look. No runtime theme swapping. (Replaces the earlier "renders as today".)
- **Routing:** the shell is a parent route with lazy-loaded children, so it wraps every page, including `/upload`. The shell owns the single `<main>` landmark; the upload page keeps its labelled region (see commit a57cbbf). The "Hello" page stays as the home route until a real home exists, and existing tests are updated to match.
- **What a "theme" is:** one SCSS file in `src/themes/` holding both the light and dark palettes. The active theme is chosen by a single `@use` line in `styles.scss`. A second theme is a new file plus changing that line; the shell is not touched. Runtime switching is out of scope (SCRUM-14 may add it).
- **i18n:** use Angular's built-in `i18n` attribute with English source strings, as `upload-page.ts` already does. No new dependency.
- **Narrow screens:** the toolbar stays usable; the search input shrinks and the system name hides. The left menu overlays the content with a dark scrim, and the scrim is what catches the outside click.
- **User photo:** a Material icon or initials avatar placeholder. No image source until auth exists.

## Left to the builder

- Exact file layout inside `src/themes/` and how the active theme is selected.
- How Material's tonal palettes are mapped to GitHub's colors (custom palette vs overriding system variables).
- Component split for the shell (toolbar, menu, search) and test strategy for the `/` shortcut.
- Font choice and the compact density values.

## Done means

- App opens in dark on a dark-mode computer and light on a light-mode one, with GitHub-like colors and compact density.
- Toolbar, menu and `/` search behave as described, covered by tests.
- Adding a second theme file in `src/themes/` requires no change to the shell.
- All checks in Constraints pass.
