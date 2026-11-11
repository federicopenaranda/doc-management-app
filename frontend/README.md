# DocManagement

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.5.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Languages (English and Spanish)

The app is built twice, `/en/` and `/es/` (Angular build-time i18n, SCRUM-32). English is the source text in the templates; the Spanish is `src/locale/messages.es.json`. Route names (`/users`) are never translated.

- `npm run start:es` serves the Spanish copy locally; `npm start` serves English.
- After changing any text marked with `i18n` or `$localize`: `npm run i18n:extract`, then add the new IDs to every `messages.<code>.json`. The production build fails on a missing translation.
- Spanish addresses the user as "tú"; records vocabulary follows the Spanish terms of ISO 15489.

To add a language (about 20 minutes, no component changes): 1) add `src/locale/messages.<code>.json`; 2) add the code to `i18n.locales` in `angular.json`; 3) allow the code in the `users.language` `CHECK` (`backend/scripts/db-bootstrap.mjs`), the backend `z.enum` (`auth.controller.ts`) and the `Language` type (`auth.service.ts`); 4) add the option in the Preferences dialog; 5) add the prefix to `docker/nginx.conf` (the `en|es` regexes). Every language adds one more build.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
