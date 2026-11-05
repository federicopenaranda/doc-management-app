# CLAUDE.md - Guía de Desarrollo para el DMS (Enterprise)

## 🏗️ Visión General y Arquitectura
- **Proyecto:** Sistema de Gestión Documental (DMS) para PyMEs orientado a estándares ISO (15489, 30301) y modelo RiC-CM.
- **Repositorio Único (Monorepo en GitHub):**
  - `/backend`: NestJS + SWC + PostgreSQL (`pgvector`) + Apache Tika worker.
  - `/frontend`: Angular (v22+) + Signals + Tailwind CSS + Angular Material/CDK.
  - `/infrastructure`: Terraform + GCP.
  - `/docs`: Documentación técnica y especificaciones.

---

## ☁️ Infraestructura y Despliegue en GCP
- **Entorno Core:** 100% Google Cloud Platform (GCP).
- **Cómputo:** 
  - **Cloud Run:** Los tres servicios corren como contenedores Docker livianos: **frontend** (Angular compilado, servido por nginx), **backend** (API NestJS) y **Apache Tika**.
  - **App Engine no se usa:** se descartó (una sola app por proyecto, región inmutable, no puede correr Tika y sus servicios no encajan en Terraform).
- **Almacenamiento y Mensajería:**
  - **Google Cloud Storage (GCS):** Bucket principal de recepción de documentos origen y almacenamiento de archivos `.md` procesados.
  - **GCP Pub/Sub:** Arquitectura orientada a eventos. GCS emite notificaciones a un tópico de Pub/Sub que despacha mensajes en modo *Push* hacia los workers de NestJS.
- **Base de Datos y Datos Vectoriales:**
  - **Cloud SQL (PostgreSQL):** Base de datos relacional con extensión `pgvector` activada para metadatos, estructuración RiC-CM y búsquedas semánticas.
- **Automatización y CI/CD:**
  - **Terraform:** Provisionamiento como código (IaC) de la infraestructura en GCP, en `/infrastructure`. El *state* es remoto, en el bucket GCS `<project-id>-tfstate` (con versionado), creado a mano una sola vez junto con la identidad de despliegue.
  - **GitHub Actions:** Pipelines para compilación, tests TDD, análisis con `knip`, escaneo de vulnerabilidades y despliegue.
    - Un PR que toque `infrastructure/**` ejecuta `terraform fmt -check`, `validate` y `plan` para ver qué cambiaría; al hacer merge a `main` se ejecuta `terraform apply`.
    - Autenticación sin llaves guardadas: Workload Identity Federation hacia la cuenta de servicio `github-deployer`, limitada a este repositorio.

---

## 🤖 Integración con Claude Code y Git
- **Conectividad Directa al Repositorio:** Claude Code tiene acceso operativo al repositorio de GitHub y está autorizado para:
  - Crear ramas temáticas (`feature/`, `fix/`).
  - Escribir código y ejecutar pruebas bajo la metodología TDD.
  - Abrir Pull Requests (PRs) automáticos con descripciones detalladas de los cambios realizados.
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

### 🚩 Feature Flags
- Implementar Feature Flags tanto en FE como en BE para cualquier funcionalidad nueva.
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