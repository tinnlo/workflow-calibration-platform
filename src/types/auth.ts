export interface AuthUser {
  id: string
  organizationId: string
  email: string
  name: string
  role: 'admin' | 'reviewer'
}

export interface LoginResponse {
  accessToken: string
}
