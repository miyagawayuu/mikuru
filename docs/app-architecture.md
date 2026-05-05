# Mikuru App Architecture Guide

Mikuru is best used as a small view layer. Keep `.mikuru` files focused on rendering, event wiring, and component composition. Put application complexity into TypeScript modules for API access, state management, forms, auth, and tests.

## Goals

- Keep `.mikuru` files small enough to review quickly.
- Make API, state, auth, and form behavior testable without compiling a full component.
- Prefer explicit TypeScript types for data crossing module boundaries.
- Let UI components stay reusable and mostly unaware of server details.
- Keep app-level rules consistent across examples, templates, and production apps.

## Recommended Structure

```text
src/
  app/
    router.ts
    authGuard.ts
    bootstrap.ts
  pages/
    LoginPage.mikuru
    DashboardPage.mikuru
    NotFoundPage.mikuru
  features/
    notes/
      NoteList.mikuru
      NoteEditor.mikuru
      notesApi.ts
      notesStore.ts
      notesTypes.ts
      notesForm.ts
  components/
    ui/
      Button.mikuru
      Input.mikuru
      Modal.mikuru
      Dropdown.mikuru
  lib/
    apiClient.ts
    auth.ts
    errors.ts
    form.ts
    logger.ts
  types/
    api.ts
    auth.ts
```

Use this as a starting point, not a required framework convention. Small apps can collapse folders, but avoid putting unrelated API, auth, and form logic directly into `App.mikuru`.

## Component Rules

- Treat page components as route-level composition roots.
- Treat feature components as the owner of one product area, such as notes, account settings, or billing.
- Treat `components/ui/` as shared presentational components with no API calls.
- Keep `.mikuru` templates declarative. Move non-trivial branching, mapping, sorting, and validation into functions or computed values.
- Split a component when it owns more than one loading state, form, modal, or server interaction.
- Prefer props and events over importing feature stores inside generic UI components.

Good boundaries:

- `pages/DashboardPage.mikuru` decides which feature appears.
- `features/notes/NoteEditor.mikuru` owns note editing UI.
- `features/notes/notesStore.ts` owns note loading and mutation state.
- `features/notes/notesApi.ts` owns HTTP calls.
- `components/ui/Button.mikuru` only renders a button style and emits click behavior.

## State Management

Separate local UI state from server state.

- Local state belongs in the component when it only affects local rendering, such as an open modal or selected tab.
- Feature state belongs in a feature store module when it is shared across multiple components.
- Server state belongs behind API and store modules, not directly in a `.mikuru` file.
- Derived state should use `computed` or plain TypeScript functions.
- Loading and error values should be part of the same store or form state as the operation they describe.

Recommended shape:

```ts
import { ref } from "mikuru";

import { listNotes } from "./notesApi";
import type { Note } from "./notesTypes";

export function createNotesStore() {
  const notes = ref<Note[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function load() {
    loading.value = true;
    error.value = null;

    try {
      notes.value = await listNotes();
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : "Failed to load notes";
    } finally {
      loading.value = false;
    }
  }

  return { notes, loading, error, load };
}
```

## API Client

All HTTP access should go through a shared API client.

- Centralize `fetch` defaults.
- Add auth headers in one place.
- Normalize error responses into typed app errors.
- Keep JSON parsing and response validation out of `.mikuru` files.
- Let feature API modules expose domain-specific functions such as `listNotes()` or `updateProfile()`.

Recommended layers:

- `lib/apiClient.ts`: base URL, headers, JSON parsing, common error mapping.
- `features/*/*Api.ts`: endpoint functions.
- `features/*/*Store.ts`: loading state, mutation state, retry decisions.
- `.mikuru`: calls store actions and renders state.

## Types

Use TypeScript as the contract layer between API, state, and UI.

- API response types should live near the API module or in `types/api.ts`.
- Form input types should live near form logic, such as `notesForm.ts`.
- Auth user/session types should live in `types/auth.ts` or `lib/auth.ts`.
- UI component prop types should be exported when a component is reused from TypeScript.
- Avoid passing raw `unknown` API data into templates.

Recommended type groups:

```ts
export type ApiErrorBody = {
  message: string;
  code?: string;
};

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  roles: string[];
};

export type LoginFormInput = {
  email: string;
  password: string;
};
```

## Forms

Forms should have a small shared foundation rather than custom state in every component.

- Keep input values, validation errors, submit state, and server errors together.
- Prefer a feature-specific form module for validation rules.
- Disable submit actions while a request is in flight.
- Render field errors next to fields and form-level errors near the submit action.
- Keep validation functions pure when possible so they can be unit tested.

Recommended form state:

```ts
export type FormState<TValues> = {
  values: TValues;
  fieldErrors: Partial<Record<keyof TValues, string>>;
  formError: string | null;
  submitting: boolean;
};
```

## Routing

Mikuru does not need to own routing in the core runtime. Prefer an app-level router module.

- Keep route definitions in `app/router.ts`.
- Keep auth checks in `app/authGuard.ts`.
- Keep route pages in `pages/`.
- Provide a `NotFoundPage.mikuru` for unmatched routes.
- Let route changes mount and unmount page components cleanly.

Minimum route responsibilities:

- page transition
- auth guard
- redirect target
- 404 fallback
- cleanup of the previous page component

## Authentication

Auth should be isolated from view components.

- Store token/session handling in `lib/auth.ts`.
- Store route decisions in `app/authGuard.ts`.
- Keep current user state in an auth store or session module.
- Add auth headers through `apiClient`, not per request.
- Treat login, logout, refresh, and current-user loading as explicit operations with loading and error states.

Security rules:

- Prefer HTTP-only cookies when the backend can support them.
- If JWTs are stored in browser-accessible storage, document the XSS tradeoff.
- Validate OAuth `state` before exchanging codes.
- Do not log tokens, session cookies, or OAuth codes.

## Errors and Loading

Use consistent UI states.

- Every server operation should expose `loading` and `error`.
- Use field-level errors for validation.
- Use form-level errors for submit failures.
- Use page-level errors for route data failures.
- Use global errors only for unexpected or unrecoverable failures.
- Keep retry behavior near the store action that failed.

Recommended display hierarchy:

- `InlineError.mikuru` for field or form errors.
- `EmptyState.mikuru` for successful empty results.
- `LoadingState.mikuru` for page or panel loading.
- `ErrorState.mikuru` for retryable server failures.

## UI Components

Shared UI components should be boring and predictable.

- `Button.mikuru`: variants, disabled state, loading label.
- `Input.mikuru`: label, value, error, disabled state.
- `Modal.mikuru`: open state, close event, focus behavior when supported.
- `Dropdown.mikuru`: selected value, options, open/close events.
- `InlineError.mikuru`: accessible error text.
- `LoadingState.mikuru`: consistent loading display.

Avoid placing API calls, auth decisions, or feature-specific data transformations inside shared UI components.

## Testing Strategy

Tests should cover the layers that absorb app complexity.

- API client tests: headers, JSON parsing, error mapping, auth behavior.
- Store tests: loading transitions, success updates, failure updates, retry behavior.
- Form tests: validation, submit state, server errors.
- Component tests: generated DOM behavior for critical UI interactions.
- E2E tests: routing, auth guard, main happy paths, important failure paths.

Minimum for a real app:

```text
tests/
  apiClient.test.ts
  notesStore.test.ts
  loginForm.test.ts
  e2e/
    auth.spec.ts
    main-flow.spec.ts
```

## Build and Quality

Use automated checks before release.

- `typecheck`
- unit tests
- generated DOM tests for key components
- Vite production build
- E2E tests for major flows
- lint and format when the app adds those tools
- CI that runs the same commands as local release validation

Keep framework-level checks and app-level checks separate. A Mikuru app should be able to validate its API client and stores even when no browser is involved.

## Observability

Start with simple hooks that can be replaced later.

- Centralize logging in `lib/logger.ts`.
- Capture unexpected errors at route or app boundaries.
- Track API latency and failure rates where practical.
- Measure page mount and primary interaction timings for complex screens.
- Avoid sending personal data, tokens, or full request bodies to logs.

## Security

Security should be designed at the app layer, not hidden in components.

- Escape-by-default text rendering should be preserved by avoiding `v-html`.
- Do not introduce raw HTML rendering without a sanitizer and a clear trust boundary.
- Centralize auth headers in the API client.
- Include CSRF protection when using cookie-based auth.
- Validate OAuth `state` and redirect targets.
- Keep secrets out of client-side code and test fixtures.
- Treat error messages from the server as untrusted text.

## Growth Checklist

Before a `.mikuru` file grows further, ask:

- Can this API call move to a feature API module?
- Can this loading/error state move to a store or form helper?
- Can this validation move to a pure TypeScript function?
- Can this repeated markup become a UI component?
- Can this feature become a folder under `features/`?
- Can the important behavior be tested without rendering the whole app?

This keeps Mikuru focused on rendering while the app grows through typed, testable TypeScript modules.
