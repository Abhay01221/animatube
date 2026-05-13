# 🚀 Firebase Authentication - Quick Start Guide

## Step 1: Create Firebase Project (5 minutes)

1. Go to https://console.firebase.google.com/
2. Click **"Add project"**
3. Enter project name: `animatube`
4. Disable Google Analytics (optional)
5. Click **"Create project"**

---

## Step 2: Enable Authentication (2 minutes)

1. In left sidebar, click **"Authentication"**
2. Click **"Get started"**
3. Click **"Email/Password"** → Enable → Save
4. Click **"Google"** → Enable → Add support email → Save

---

## Step 3: Get Client Credentials (3 minutes)

1. Click gear icon (⚙️) → **"Project settings"**
2. Scroll to **"Your apps"** section
3. Click Web icon (`</>`)
4. Register app name: `animatube-web`
5. Copy the config values:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",           // ← Copy this
  authDomain: "animatube-....firebaseapp.com",  // ← Copy this
  projectId: "animatube-...",  // ← Copy this
  appId: "1:123...:web:abc..." // ← Copy this
};
```

6. Add to `.env`:
```bash
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=animatube-....firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=animatube-...
NEXT_PUBLIC_FIREBASE_APP_ID=1:123...:web:abc...
```

---

## Step 4: Get Admin Credentials (3 minutes)

1. Still in **Project settings**
2. Click **"Service accounts"** tab
3. Click **"Generate new private key"**
4. Click **"Generate key"** (downloads JSON file)
5. Open the JSON file and find:

```json
{
  "project_id": "animatube-...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@animatube-....iam.gserviceaccount.com"
}
```

6. Add to `.env`:
```bash
FIREBASE_ADMIN_PROJECT_ID=animatube-...
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-xxxxx@animatube-....iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour_Key_Here\n-----END PRIVATE KEY-----\n"
```

**Important:** Keep the quotes around the private key and the `\n` characters.

---

## Step 5: Test Locally (2 minutes)

```bash
# Start dev server
npm run dev

# Open browser
http://localhost:3000/sign-in
```

### Test Registration
1. Click **"Register"** tab
2. Enter name, email, password
3. Click **"Create Account"**
4. Should redirect to `/dashboard`

### Test Sign In
1. Sign out
2. Go to `/sign-in`
3. Enter email and password
4. Click **"Sign In"**
5. Should redirect to `/dashboard`

### Test Google Sign-In
1. Sign out
2. Go to `/sign-in`
3. Click **"Continue with Google"**
4. Select Google account
5. Should redirect to `/dashboard`

---

## Step 6: Verify Everything Works

### Check User in Firebase Console
1. Go to **Authentication** → **Users**
2. You should see your registered user

### Check User in Database
```bash
npx prisma studio
```
1. Open `User` table
2. Verify `firebaseUid` is populated

### Test Video Generation
1. Go to home page
2. Enter a prompt
3. Click **"Generate Video"**
4. Should create job and redirect to generation page

---

## 🎉 Done!

Your Firebase Authentication is now fully configured and working!

---

## 🔧 Production Deployment

### Vercel
1. Go to Vercel dashboard
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add all Firebase variables:
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`
   - `FIREBASE_ADMIN_PROJECT_ID`
   - `FIREBASE_ADMIN_CLIENT_EMAIL`
   - `FIREBASE_ADMIN_PRIVATE_KEY`
5. Redeploy

### Add Production Domain
1. Go to Firebase Console
2. **Authentication** → **Settings** → **Authorized domains**
3. Click **"Add domain"**
4. Enter your Vercel domain: `your-app.vercel.app`
5. Save

---

## ⚠️ Common Issues

### "Missing Firebase credentials"
**Solution:** Restart dev server after adding env vars
```bash
# Stop server (Ctrl+C)
npm run dev
```

### "Popup blocked" for Google Sign-In
**Solution:** Allow popups for localhost in browser settings

### "User not found" after sign-in
**Solution:** Check browser console for errors in `/api/auth/sync-user`

### Private key error
**Solution:** Make sure private key has quotes and `\n` characters:
```bash
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour_Key\n-----END PRIVATE KEY-----\n"
```

---

## 📚 Need Help?

- **Full Guide:** `FIREBASE_MIGRATION_GUIDE.md`
- **Firebase Docs:** https://firebase.google.com/docs/auth
- **Support:** Check browser console for error messages

---

**Total Setup Time: ~15 minutes** ⏱️
