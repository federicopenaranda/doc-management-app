import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { map } from 'rxjs';
import { API_URL } from '../api-url';

/** The body of every response of our API (SCRUM-20): `data` on success, `errors` on failure, always the same keys. */
interface ApiSuccess {
  success: true;
  code: number;
  data: unknown;
  errors: unknown[];
}

const isApiSuccess = (body: unknown): body is ApiSuccess =>
  typeof body === 'object' &&
  body !== null &&
  (body as { success?: unknown }).success === true &&
  'data' in body &&
  Array.isArray((body as { errors?: unknown }).errors);

/**
 * Hands the caller the `data` of a success response of our API, so services keep asking for the payload itself
 * (null when there was nothing to return). An error stays an HttpErrorResponse: its status is on it and the standard
 * body is in `error.error`. A body without the standard shape (an older backend) passes through untouched.
 */
export const apiResponseInterceptor: HttpInterceptorFn = (req, next) => {
  // The config.json request is relative and runs before the API address is known.
  if (!req.url.startsWith('http')) return next(req);
  if (!req.url.startsWith(`${inject(API_URL)}/`)) return next(req);

  return next(req).pipe(
    map((event) =>
      event instanceof HttpResponse && isApiSuccess(event.body)
        ? event.clone({ body: event.body.data })
        : event,
    ),
  );
};
