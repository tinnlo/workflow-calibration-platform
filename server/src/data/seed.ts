/**
 * Demo seed data: 3 organisations × 2 users each.
 * Passwords are stored as bcrypt hashes (rounds=10).
 * All values are hard-coded for reproducibility in demos.
 */

export interface SeedUser {
  id: string
  organizationId: string
  email: string
  /** bcrypt hash of the plain-text password shown in README */
  passwordHash: string
  name: string
  role: 'admin' | 'reviewer'
}

// Hashes were generated with bcrypt rounds=10 for password: Demo1234!
export const SEED_USERS: SeedUser[] = [
  // ── Org A: Apex Analytics ────────────────────────────────────────────────
  {
    id: 'user-aa-admin',
    organizationId: 'org-apex',
    email: 'admin@apex.example',
    passwordHash: '$2b$10$ZFu6xoOaL3vvr9WV6otEAOJntHnmGmOKfYZmdGkNa4bOT9WfS0RK6',
    name: 'Alice Admin',
    role: 'admin',
  },
  {
    id: 'user-aa-reviewer',
    organizationId: 'org-apex',
    email: 'reviewer@apex.example',
    passwordHash: '$2b$10$ZFu6xoOaL3vvr9WV6otEAOJntHnmGmOKfYZmdGkNa4bOT9WfS0RK6',
    name: 'Aaron Reviewer',
    role: 'reviewer',
  },

  // ── Org B: Beacon Data ───────────────────────────────────────────────────
  {
    id: 'user-bd-admin',
    organizationId: 'org-beacon',
    email: 'admin@beacon.example',
    passwordHash: '$2b$10$ZFu6xoOaL3vvr9WV6otEAOJntHnmGmOKfYZmdGkNa4bOT9WfS0RK6',
    name: 'Brenda Admin',
    role: 'admin',
  },
  {
    id: 'user-bd-reviewer',
    organizationId: 'org-beacon',
    email: 'reviewer@beacon.example',
    passwordHash: '$2b$10$ZFu6xoOaL3vvr9WV6otEAOJntHnmGmOKfYZmdGkNa4bOT9WfS0RK6',
    name: 'Brian Reviewer',
    role: 'reviewer',
  },

  // ── Org C: Clarity Corp ──────────────────────────────────────────────────
  {
    id: 'user-cc-admin',
    organizationId: 'org-clarity',
    email: 'admin@clarity.example',
    passwordHash: '$2b$10$ZFu6xoOaL3vvr9WV6otEAOJntHnmGmOKfYZmdGkNa4bOT9WfS0RK6',
    name: 'Carol Admin',
    role: 'admin',
  },
  {
    id: 'user-cc-reviewer',
    organizationId: 'org-clarity',
    email: 'reviewer@clarity.example',
    passwordHash: '$2b$10$ZFu6xoOaL3vvr9WV6otEAOJntHnmGmOKfYZmdGkNa4bOT9WfS0RK6',
    name: 'Chris Reviewer',
    role: 'reviewer',
  },
]
