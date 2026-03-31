/** RFC 7807 Problem Details response shape */
export interface ProblemDetail {
  type: string
  title: string
  status: number
  detail: string
  instance?: string
  correlationId?: string
}

/** Wraps a fetch error so callers can distinguish network vs API errors */
export class ApiError extends Error {
  readonly status: number
  readonly problem: ProblemDetail

  constructor(problem: ProblemDetail) {
    super(problem.detail)
    this.name = 'ApiError'
    this.status = problem.status
    this.problem = problem
  }
}
