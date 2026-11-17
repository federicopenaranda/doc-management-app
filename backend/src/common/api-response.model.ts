/** Every response of the API has this shape, success or error (SCRUM-20). */
export interface ApiMeta {
  correlationId: string;
  timestamp: string;
  /** Only on errors. */
  path?: string;
}

export interface ApiErrorItem {
  errorCode: string;
  message: string;
  /** The input the error is about, when there is one (for example "email" or "files.0.name"). */
  field?: string;
}

export interface ApiSuccess<T> {
  success: true;
  /** The HTTP status. */
  code: number;
  data: T;
  errors: [];
  meta: ApiMeta;
}

export interface ApiFailure {
  success: false;
  code: number;
  data: null;
  errors: ApiErrorItem[];
  meta: ApiMeta;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
