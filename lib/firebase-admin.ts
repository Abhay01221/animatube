/**
 * Firebase Admin SDK configuration.
 * Server-side token verification for API routes.
 * Singleton-safe initialization for Next.js App Router.
 */
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

let adminApp: App | undefined;
let adminAuth: Auth | undefined;

/**
 * Initialize Firebase Admin SDK (singleton pattern).
 * Safe to call multiple times - will reuse existing instance.
 */
function initAdmin() {
  if (adminApp) {
    return { app: adminApp, auth: adminAuth! };
  }

  const apps = getApps();
  if (apps.length > 0) {
    adminApp = apps[0];
    adminAuth = getAuth(adminApp);
    return { app: adminApp, auth: adminAuth };
  }

  // Initialize with service account credentials
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (
    !process.env.FIREBASE_ADMIN_PROJECT_ID ||
    !process.env.FIREBASE_ADMIN_CLIENT_EMAIL ||
    !privateKey
  ) {
    throw new Error(
      "Missing Firebase Admin credentials. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY in .env"
    );
  }

  adminApp = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
  });

  adminAuth = getAuth(adminApp);

  return { app: adminApp, auth: adminAuth };
}

/**
 * Verify Firebase ID token and return decoded token.
 * Use this in API routes to authenticate requests.
 */
export async function verifyIdToken(token: string) {
  const { auth } = initAdmin();
  return auth.verifyIdToken(token);
}

/**
 * Get Firebase Admin Auth instance.
 */
export function getAdminAuth() {
  const { auth } = initAdmin();
  return auth;
}

export default initAdmin;
