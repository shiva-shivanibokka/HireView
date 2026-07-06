// Base URL of the FastAPI backend, used by the Next.js route handlers (server-side).
// Set BACKEND_URL in the deployment env (e.g. your Cloud Run URL); falls back to
// localhost for local development.
export const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000"
