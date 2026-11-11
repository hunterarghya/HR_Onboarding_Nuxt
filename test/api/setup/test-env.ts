// Shared by the global setup (which boots the server) and the tests (which mint tokens and seed rows).

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
  || 'postgresql://postgres:postgres@localhost:5434/hr_onboarding_test'

export const TEST_JWT_SECRET = 'smoke-test-jwt-secret-not-for-real-use-0123456789'

export const TEST_GOOGLE_CLIENT_ID = 'smoke-test-client-id.apps.googleusercontent.com'

// Nothing listens here, so Qdrant and Ollama calls fail fast. Their callers already swallow those
// errors, and the smoke suite never touches the dev Qdrant collection.
export const UNREACHABLE_URL = 'http://127.0.0.1:9'
