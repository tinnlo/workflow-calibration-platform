/**
 * Application error classes with RFC 7807 Problem Details fields.
 * Throw these in route handlers; the global error handler will serialize them.
 */
export class AppError extends Error {
  readonly statusCode: number
  readonly problemType: string
  readonly title: string

  constructor(statusCode: number, problemType: string, title: string, detail: string) {
    super(detail)
    this.statusCode = statusCode
    this.problemType = problemType
    this.title = title
    this.name = 'AppError'
  }
}

export class NotFoundError extends AppError {
  constructor(detail = 'The requested resource was not found') {
    super(404, 'not-found', 'Not Found', detail)
  }
}

export class UnauthorizedError extends AppError {
  constructor(detail = 'Authentication required') {
    super(401, 'unauthorized', 'Unauthorized', detail)
  }
}

export class ForbiddenError extends AppError {
  constructor(detail = 'Access denied') {
    super(403, 'forbidden', 'Forbidden', detail)
  }
}

export class PreconditionFailedError extends AppError {
  constructor(
    detail = 'The resource was modified by another request. Refresh and retry with the latest ETag.'
  ) {
    super(412, 'precondition-failed', 'Precondition Failed', detail)
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(detail: string) {
    super(422, 'unprocessable-entity', 'Unprocessable Entity', detail)
  }
}

export class ConflictError extends AppError {
  constructor(detail: string) {
    super(409, 'conflict', 'Conflict', detail)
  }
}

export class PreconditionRequiredError extends AppError {
  constructor(detail = 'If-Match header is required to prevent blind overwrites') {
    super(428, 'precondition-required', 'Precondition Required', detail)
  }
}
