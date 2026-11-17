# CLAUDE.md - Guía de Desarrollo para __PROJECT_TITLE__

## 🏗️ Visión General y Arquitectura
- **Proyecto:** __PROJECT_TITLE__. Describe aquí qué hace y para quién.
- **Repositorio único (monorepo):**
  - `/backend`: NestJS + SWC + PostgreSQL.
  - `/frontend`: Angular (v22+) + Signals + Tailwind CSS + Angular Material/CDK.
  - `/infrastructure`: infraestructura como código.
  - `/docs`: documentación técnica y especificaciones.

---

## 🤖 Integración con Claude Code y Git
- **Conectividad Directa al Repositorio:** Claude Code tiene acceso operativo al repositorio de GitHub y está autorizado para:
  - Crear ramas temáticas (`feature/`, `fix/`).
  - Escribir código y ejecutar pruebas bajo la metodología TDD.
  - Hacer **un commit por tarea** en la rama de trabajo (se trabaja en muchas tareas pequeñas).
- **Pull Requests y merge:** Claude Code **no abre PRs ni hace merge por cuenta propia**. El dueño decide cuándo se crea el PR (después de varias tareas) y cuándo se hace merge a `main`; cada merge despliega, y se quiere desplegar menos veces. Al abrir el PR, la descripción detalla los cambios realizados.
- **Git Hooks (Husky + lint-staged):**
  - Bloquear commits automáticamente si el código no pasa el linter o presenta errores de formato.
- **Convenciones:** Usar Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`).

---

## 💻 Reglas de Código y Patrones de Diseño

### ⚙️ TypeScript General
- **Type Safety Avanzada:** Configurado con `strict: true` absoluto. Prohibición estricta de `any` (Zero `any` policy).

### 🎨 Frontend (Angular v22+)
- **Arquitectura:** Componentes Standalone exclusivamente.
- **Rendimiento y Rendereo:** 
  - Estrategia de detección de cambios estricta `ChangeDetectionStrategy.OnPush` combinada con **Angular Signals** para reactividad y alto rendimiento en listas masivas.
  - **Code Splitting:** Lazy loading obligatorio en todas las rutas para mantener un bundle inicial ligero.
  - **Web Workers:** Delegar algoritmos pesados de procesamiento de texto (ej. comparación de texto / diff) a hilos secundarios para evitar congelar el hilo principal de la UI.
- **Estado y Formularios:**
  - Gestión de estado explícita (**State Management**) con Signals.
  - Formularios dinámicos renderizados mediante **esquemas JSON**.
- **UI & Estilos:**
  - **Tailwind CSS** combinado con **Angular Material / CDK**.
  - **Iconografía:** Material Icons.
- **Internacionalización (i18n):** Arquitectura de textos preparada desde el inicio para soporte multilenguaje.

### 🔌 Backend (NestJS)
- Compilación ultrarrápida con **SWC** (`nest-cli.json`).
- DTOs validados estrictamente con `class-validator` (`whitelist: true`, `forbidNonWhitelisted: true`).
- Las interfaces y tipos compartidos entre archivos van en un archivo `<feature>.model.ts` exportado, en la carpeta de la feature (por ejemplo `clients/client.model.ts`), nunca dentro de un servicio, repositorio o controlador. Se importan con `import type`. Los tipos internos de un solo archivo (por ejemplo las filas de la base de datos) y los derivados de un esquema `zod` pueden quedarse en su archivo.

### 📁 Convenciones de archivos (FE y BE)
- **Modelos:** `<feature>.model.ts`, siempre en singular (`user.model.ts`, no `users.model.ts`), con las interfaces y tipos compartidos.
- **Templates de Angular:** más de 5 líneas van en su propio `<componente>.html` junto al componente (`templateUrl`); 5 líneas o menos pueden ir inline en `template`.
- **Tipos compartidos de la UI** (por ejemplo `LoadState`) viven en `frontend/src/app/shared/*.model.ts`; no se duplican por componente.

### 🚩 Feature Flags
- Usar Feature Flags **solo para trabajo incompleto**: una funcionalidad que se despliega a medio hacer y no debe verse todavía, tanto en FE como en BE. Una funcionalidad terminada dentro de su ticket se entrega sin flag (así cerramos los tickets más rápido).
- No crear una flag nueva por costumbre ni para funcionalidades completas; si hay duda, preguntar al dueño.
- **Regla de Limpieza:** Toda Feature Flag debe ser completamente eliminada del código tras **2 semanas** de estar activa en uso/producción.

---

## 🧪 Metodología TDD, CI/CD y Calidad de Código
- **Desarrollo TDD Estricto:**
  1. Escribir **primero** los tests unitarios/integración basándose en requisitos.
  2. Verificar que los tests *fallen*.
  3. Implementar el código mínimo necesario para que las pruebas pasen.
- **Testing Tools:**
  - **Pruebas Unitarias:** Vitest + Angular Testing Library (componentes aislados y servicios).
  - **Pruebas E2E (End-to-End):** Playwright.
- **Checklist Pre-Commit / Pre-Push (Validación obligatoria):**
  - Ejecutar y verificar que **pasan el 100% de las pruebas**.
  - **Linting & Formato:** ESLint + Prettier (reglas estrictas para TS/Angular) + Stylelint (ordenamiento y validación de clases de Tailwind CSS).
  - **Análisis de Código Muerto:** `npx knip` para eliminar archivos, exportaciones o tipos huérfanos.
  - **Auditoría de Seguridad:** Escaneo de vulnerabilidades en código y dependencias (`npm audit` / Snyk).
- **Smoke Tests en CI (GitHub Actions):**
  - Todo Pull Request ejecutará una prueba de humo automatizada que levante el backend en un entorno aislado y valide la conectividad/respuesta con PostgreSQL antes del merge.

---

## 🚀 Comandos Rápidos de Referencia
- **Desarrollo Backend:** `npm run start:dev` (en `/backend`)
- **Desarrollo Frontend:** `npm run start` o `ng serve` (en `/frontend`)
- **Compilación Backend:** `npx nest build` (SWC)
- **Ejecutar Pruebas Unitarias (TDD):** `npm run test` (Vitest)
- **Ejecutar Pruebas E2E:** `npx playwright test`
- **Linting & Estilos:** `npm run lint` / `npx stylelint "**/*.scss"`
- **Análisis Estático (Código Muerto):** `npx knip`
- **Auditoría de Seguridad:** `npm audit`