import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, ProtectedRoute } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/Layout/AppLayout'
import { ErrorBoundary } from '@/components/ErrorBoundary'

// Lazy-loaded pages
const Login = lazy(() => import('@/pages/Login'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const WorkflowDetail = lazy(() => import('@/pages/WorkflowDetail'))
const NotFound = lazy(() => import('@/pages/NotFound'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

// Expose queryClient on window only when the E2E hook flag is explicitly set.
// Scoped to this opt-in var (not import.meta.env.DEV) so it never leaks in a
// regular dev session where E2E tests are not running.
if (import.meta.env.VITE_E2E_HOOKS === 'true') {
  ;(window as Window & { __queryClient?: typeof queryClient }).__queryClient = queryClient
}

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted-foreground text-sm">Loading…</p>
    </div>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* Public */}
                <Route path="/login" element={<Login />} />

                {/* Protected */}
                <Route
                  element={
                    <ProtectedRoute>
                      <AppLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/workflows/:id" element={<WorkflowDetail />} />
                </Route>

                {/* Redirects */}
                <Route path="/" element={<Navigate to="/dashboard" replace />} />

                {/* 404 */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
