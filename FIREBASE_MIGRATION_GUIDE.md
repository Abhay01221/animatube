# 🔥 Firebase Authentication Migration Guide

## ✅ Migration Complete

Animatube has been successfully migrated from Auth.js/NextAuth to Firebase Authentication.

---

## 📦 Package Changes

### Installed
```bash
npm install firebase firebase-admin
```

### Removed
```bash
npm uninstall next-auth @auth/prisma-adapter bcryptjs @types/bcryptjs
```

---

## 🔧 Environment Variables Required

### Client SDK (Frontend-safe)
```bash
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### Server SDK (Server-only - NEVER expose to client)
```bash
FIREBASE_ADMIN_PROJECT_ID=your_project_id
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your_project.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour_Private_Key_Here\n-----END PRIVATE KEY-----\n"
```

**Note:** The private key must include `\n` for newlines. Keep the quotes.

---

## 🔥 Firebase Console Setup

### 1. Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Enter project name: `animatube` (or your choice)
4. Disable Google Analytics (optional)
5. Click "Create project"

### 2. Enable Authentication
1. In Firebase Console, go to **Authentication**
2. Click "Get started"
3. Enable **Email/Password** provider
4. Enable **Google** provider
   - Add your support email
   - Click "Save"

### 3. Get Client SDK Config
1. Go to **Project Settings** (gear icon)
2. Scroll to "Your apps"
3. Click **Web** icon (`</>`)
4. Register app name: `animatube-web`
5. Copy the config values:
   - `apiKey` → `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `authDomain` → `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `projectId` → `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `appId` → `NEXT_PUBLIC_FIREBASE_APP_ID`

### 4. Get Admin SDK Credentials
1. Go to **Project Settings** → **Service accounts**
2. Click "Generate new private key"
3. Download the JSON file
4. Extract values:
   - `project_id` → `FIREBASE_ADMIN_PROJECT_ID`
   - `client_email` → `FIREBASE_ADMIN_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_ADMIN_PRIVATE_KEY`

**Important:** Replace `\n` in private key with actual newlines or keep as `\n` in .env

### 5. Configure Authorized Domains
1. Go to **Authentication** → **Settings** → **Authorized domains**
2. Add your domains:
   - `localhost` (already added)
   - `your-vercel-domain.vercel.app`
   - `your-custom-domain.com`

---

## 🗄️ Database Schema Changes

### Added Field
```prisma
model User {
  firebaseUid String? @unique // ← ADDED
}
```

### Removed Field
```prisma
password String? // ← REMOVED (Firebase manages passwords)
```

### Run Migrations
```bash
npx prisma generate
npx prisma db push
```

---

## 🔐 Authentication Flow

### Registration (Email/Password)
```
1. User fills registration form
2. Firebase creates user account
3. Client calls /api/auth/sync-user with Firebase ID token
4. Server verifies token and creates/updates Prisma user
5. User redirected to /dashboard
```

### Sign In (Email/Password)
```
1. User enters credentials
2. Firebase authenticates user
3. Client calls /api/auth/sync-user with Firebase ID token
4. Server verifies token
5. User redirected to /dashboard
```

### Google Sign-In
```
1. User clicks "Continue with Google"
2. Firebase popup opens
3. User selects Google account
4. Firebase returns user with ID token
5. Client calls /api/auth/sync-user
6. User redirected to /dashboard
```

**Important:** Google Sign-In only requests basic scopes (openid, email, profile). YouTube scopes are NOT requested during login.

---

## 🛡️ API Route Protection

### Before (NextAuth)
```typescript
import { auth } from "@/auth";

const session = await auth();
if (!session?.user?.id) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

### After (Firebase)
```typescript
import { verifyIdToken } from "@/lib/firebase-admin";

const authHeader = req.headers.get("Authorization");
if (!authHeader || !authHeader.startsWith("Bearer ")) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

const token = authHeader.split("Bearer ")[1];
const decoded = await verifyIdToken(token);

const user = await prisma.user.findUnique({
  where: { firebaseUid: decoded.uid },
});
```

---

## 🎯 Page Protection

### Before (Middleware)
```typescript
// middleware.ts - Edge Runtime
export async function middleware(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.redirect("/sign-in");
  }
}
```

### After (Client-side AuthGuard)
```typescript
// app/dashboard/page.tsx
import { AuthGuard } from "@/components/auth/AuthGuard";

export default function DashboardPage() {
  return (
    <AuthGuard>
      {/* Protected content */}
    </AuthGuard>
  );
}
```

**Why the change?**
- Avoids Edge Runtime compatibility issues
- Firebase Admin SDK requires Node.js runtime
- Client-side guards are simpler and more reliable

---

## 🔄 Token Refresh Strategy

Firebase ID tokens expire after 1 hour. Always refresh before API calls:

```typescript
const user = auth.currentUser;
if (!user) return;

// Force token refresh
const token = await user.getIdToken(true);

const res = await fetch("/api/generate", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(data),
});
```

---

## 📝 Files Created

```
lib/firebase.ts                      - Firebase client SDK
lib/firebase-admin.ts                - Firebase Admin SDK
components/auth/AuthGuard.tsx        - Client-side page protection
components/auth/AuthProvider.tsx     - Firebase auth context
app/api/auth/sync-user/route.ts     - User sync endpoint
```

## 📝 Files Modified

```
package.json                         - Updated dependencies
prisma/schema.prisma                 - Added firebaseUid, removed password
app/layout.tsx                       - Replaced SessionProvider with AuthProvider
app/sign-in/page.tsx                 - Firebase authentication
app/dashboard/page.tsx               - Added AuthGuard + token refresh
app/api/generate/route.ts            - Firebase token verification
```

## 📝 Files Deleted

```
auth.ts                              - NextAuth config (replaced)
middleware.ts                        - Edge middleware (replaced with AuthGuard)
components/Providers.tsx             - SessionProvider wrapper (replaced)
app/api/auth/register/route.ts      - Custom registration (Firebase handles this)
app/api/auth/[...nextauth]/route.ts - NextAuth handler (no longer needed)
```

---

## 🚀 Deployment

### Vercel (Frontend)
1. Add all environment variables in Vercel dashboard
2. Deploy: `vercel --prod`

### Railway (Worker)
- No changes needed
- Worker doesn't use authentication

---

## ✅ Testing Checklist

- [ ] Email/password registration works
- [ ] Email/password sign-in works
- [ ] Google Sign-In works
- [ ] User syncs to Prisma database
- [ ] Protected pages redirect to /sign-in
- [ ] API routes verify Firebase tokens
- [ ] Credit deduction works
- [ ] Video generation works
- [ ] Dashboard loads user videos
- [ ] Sign out works

---

## 🔍 Troubleshooting

### "User not found" error
- User hasn't been synced to Prisma
- Call `/api/auth/sync-user` after Firebase authentication

### "Invalid token" error
- Token expired (refresh with `getIdToken(true)`)
- Wrong Firebase project credentials
- Check `FIREBASE_ADMIN_*` environment variables

### Google Sign-In popup blocked
- Browser blocking popups
- User needs to allow popups for your domain

### "Missing Firebase credentials" error
- Check all `NEXT_PUBLIC_FIREBASE_*` variables are set
- Check all `FIREBASE_ADMIN_*` variables are set
- Restart dev server after adding env vars

---

## 📚 Additional Resources

- [Firebase Authentication Docs](https://firebase.google.com/docs/auth)
- [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)
- [Next.js + Firebase](https://firebase.google.com/docs/web/setup)

---

## ⚠️ Important Notes

1. **YouTube Integration Separated**
   - Login only requests basic scopes
   - YouTube scopes will be requested separately later
   - Implement "Connect YouTube Channel" button in dashboard

2. **No Middleware**
   - Authentication middleware removed
   - Using client-side AuthGuard instead
   - API routes verify tokens server-side

3. **Password Management**
   - Firebase handles all password operations
   - No bcrypt, no password storage in Prisma
   - Password reset handled by Firebase

4. **Session Strategy**
   - JWT-based (Firebase ID tokens)
   - Tokens expire after 1 hour
   - Always refresh before API calls

5. **Account Linking**
   - Firebase automatically links accounts with same email
   - Google + Email/Password can share same account

---

**Migration completed successfully! 🎉**
