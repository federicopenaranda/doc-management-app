# Spanish / English UI (i18n) - design

Follow-up of SCRUM-19 (Preferences dialog). Needs its own Jira ticket.

## Intent

The Preferences dialog already saves a language (`en` or `es`) in `users.language` and in
sessionStorage (`dms.language`), but the app text never changes. Make every piece of text the user
reads follow that choice. Spanish is the main language of the product; English stays available.

## Goals

- When the user's language is Spanish, all UI text is Spanish: menus, the profile menu, buttons,
  form labels, validation messages, dialogs, snackbars/notices, page titles and dynamic
  `aria-label`s. Same for English.
- The login page (nobody is known yet) defaults to Spanish.
- New users are created with `es`. Existing users keep the language they have now.
- Changing the language in Preferences saves it, then reloads the app in that language. A reload is
  acceptable (owner's decision).

## Non-goals

- Route names are not translated (owner's decision): `/users`, `/upload`, `/login` stay English in
  both languages. Only the `/en/` or `/es/` prefix is added in front of them. Jira: SCRUM-32.

- Server error text, logs, Swagger docs and the text inside processed documents stay as they are.
  The frontend never shows server text (it maps status codes to its own messages), so nothing
  server-side needs translating.
- No more than two languages. No per-environment or per-tenant languages.
- No changing the language without a reload, and no translation tooling or service.

## Constraints

- **No feature flag for this feature** (owner's decision, overrides the `CLAUDE.md` flag rule for
  this work only). Nothing to remove after two weeks.
- Frontend rules in `CLAUDE.md` apply: standalone components, signals, TDD, the zero-`any` rule,
  AXE/WCAG AA, `knip` clean.
- The same image still serves every environment. Runtime configuration (`config.json`) stays
  language independent.

## How it gets made (my calls, not yet confirmed by the owner)

- **Angular built-in i18n, build time.** English is the source text (the templates already carry 107
  `i18n` attributes in 9 files, plus some `$localize` calls). Spanish lives in
  `src/locale/messages.es.xlf`. `angular.json` sets `sourceLocale: en` and `locales.es`, and the
  production build uses `localize: true`, giving `/en/` and `/es/` copies (about twice the build time).
- **nginx:** `/` redirects to `/es/`. Each locale has its own `try_files` fallback to its own
  `index.html`. Hashed assets keep the long cache; `index.html` stays `no-cache`. `/config.json`
  stays at the root.
- **Choosing the copy:** a user whose saved language differs from the copy they are on is sent to
  the other copy right after login (and on a reload while logged in). Preferences saves first, then
  navigates to `/<lang>/` (a full page load).
- **Database:** `db:bootstrap` gets one more statement that sets the default of `users.language` to
  `'es'`. It changes only new rows; existing rows keep their value. Run by the owner as usual.
- **Dynamic text:** strings built in code move to `$localize` with stable custom IDs so the
  translations survive a reword. `aria-label`s use `i18n-aria-label`.
- **Dev:** `ng serve` runs the source language (English); a `start:es` script serves Spanish.

## Answered from the code (builder check)

- Auth lives in sessionStorage (`auth.service.ts`), which is per origin, not per path. `/en/` and
  `/es/` share it, so a language switch keeps the user logged in in the same tab.
- `INSERT INTO users` (`users.repository.ts:149`) does not set `language`, so the column default
  decides. Changing the default is enough; no backend code change. Users created between the
  frontend deploy and the bootstrap run would get `en`: run the bootstrap before merging.
- After login the server's `users.language` wins over sessionStorage.

## My calls (minor, marked as mine)

- The locale redirect keeps the current route (`/en/users` becomes `/es/users`) and ignores
  `Accept-Language`. The saved language, or Spanish when none, decides.
- The existing Playwright suite keeps running against the English dev server; add one Spanish
  check. The builder confirms CI and `knip` do not depend on the flat `dist` layout.
- Angular Material's own labels (paginator, datepicker) are translated by setting `LOCALE_ID` and
  the matching Material locale providers.
- CI fails when a source string has no Spanish translation (extract messages and compare); no
  other lint for unmarked text.

## Spanish text (owner's decisions)

- Address the user as "tú" (informal): "¿Seguro que quieres archivar...?".
- Records-management vocabulary follows the Spanish terms of ISO 15489 (record = "documento de
  archivo", series = "serie", fonds = "fondo"). I write all the Spanish; the owner reviews it in the PR.

## Adding a language later (checklist the plan must keep short)

1. Add `src/locale/messages.<code>.json` (translation files use the JSON format, easier to edit than XLF).
2. Add the code to `locales` in `angular.json`.
3. Allow the code in the database `CHECK`, the backend `z.enum` and the frontend `Language` type.
4. Add the option in the Preferences dialog.
5. Add the locale to nginx and the Material locale setup.

About 20 minutes, no component changes; every language adds one more build.

## Decisions made while building

- CI fails on a missing Spanish translation through the build option `i18nMissingTranslation: "error"`; no custom script.
- nginx serves `/config.json` under each prefix too, because the app requests it relative to its base href.
- The Spanish check is an image test (grep inside the image), not Playwright.
- No Material locale step: no Material component with built-in text is used.

## Left to the builder

- Exact nginx rules, the redirect code that picks the locale, file layout of the locale folder, and
  how CI extracts messages and fails when a Spanish translation is missing.
- Date, number and `LOCALE_ID` formatting for `es`.
- Tests: unit tests for the redirect logic and the Preferences flow; one Playwright check that the
  Spanish copy shows Spanish text.

## Success

- A user set to Spanish sees no English UI text in any screen; same for English.
- The login page opens in Spanish for a visitor with no saved language.
- A newly created user has `language = 'es'`; existing users are unchanged.
- The build fails (or CI reports) when a source string has no Spanish translation.
