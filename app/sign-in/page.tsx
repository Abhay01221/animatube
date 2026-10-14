"use client";

/**
 * Sign In / Register page with Firebase Authentication.
 * Supports Google Sign-In and Email/Password authentication.
 */
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles, Mail, Lock, User, Loader2 } from "lucide-react";
import Link from "next/link";
import {
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { toast } from "sonner";
import { safeCallback } from "@/components/generation-state";

type Tab = "signin" | "register";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallback(searchParams?.get("callbackUrl"));

  const [tab, setTab] = useState<Tab>("signin");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [verificationNotice,setVerificationNotice]=useState(false);

  // Sign In form state
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [signInError, setSignInError] = useState("");

  // Register form state
  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerErrors, setRegisterErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    general?: string;
  }>({});

  /**
   * Sync Firebase user to Prisma database
   */
  async function syncUser(): Promise<boolean> {
    try {
      const user = auth.currentUser;
      if (!user) return false;

      const token = await user.getIdToken(true);
      const res = await fetch("/api/auth/sync-user", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const message = await res.text();
        console.error("[sign-in] Failed to sync user:", message);
        return false;
      }
      return true;
    } catch (error) {
      console.error("[sign-in] Error syncing user:", error);
      return false;
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setSignInError("");
    setLoading(true);

    try {
      const credential=await signInWithEmailAndPassword(auth, signInEmail, signInPassword);
      if(!credential.user.emailVerified){setVerificationNotice(true);return;}
      if (!await syncUser()) throw new Error("Unable to sync account");
      router.push(callbackUrl);
      router.refresh();
    } catch (error: unknown) {
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
      console.error("[sign-in] Error:", error);
      if (code === "auth/invalid-credential" || code === "auth/user-not-found") {
        setSignInError("Invalid email or password");
      } else if (code === "auth/too-many-requests") {
        setSignInError("Too many failed attempts. Please try again later.");
      } else {
        setSignInError("An error occurred. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegisterErrors({});
    setLoading(true);

    try {
      // Validate inputs
      if (!registerName.trim()) {
        setRegisterErrors({ name: "Name is required" });
        setLoading(false);
        return;
      }

      if (registerPassword.length < 8) {
        setRegisterErrors({ password: "Password must be at least 8 characters" });
        setLoading(false);
        return;
      }

      // Create Firebase user
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        registerEmail,
        registerPassword
      );

      // Update display name
      await updateProfile(userCredential.user, {
        displayName: registerName,
      });

      // Reload user to ensure token includes display name
      await userCredential.user.reload();

      await sendEmailVerification(userCredential.user);
      setVerificationNotice(true);setTab("signin");setSignInEmail(registerEmail);
      toast.success("Verification email sent. Verify your email, then continue.");
    } catch (error: unknown) {
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
      console.error("[register] Error:", error);
      if (code === "auth/email-already-in-use") {
        setRegisterErrors({ email: "An account with this email already exists" });
      } else if (code === "auth/invalid-email") {
        setRegisterErrors({ email: "Invalid email address" });
      } else if (code === "auth/weak-password") {
        setRegisterErrors({ password: "Password is too weak" });
      } else {
        setRegisterErrors({ general: "Registration failed. Please try again." });
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      if (!await syncUser()) throw new Error("Unable to sync account");
      router.push(callbackUrl);
      router.refresh();
    } catch (error: unknown) {
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
      console.error("[google-signin] Error:", error);
      if (code === "auth/popup-closed-by-user") {
        toast.error("Sign-in cancelled");
      } else if (code === "auth/popup-blocked") {
        toast.error("Popup blocked. Please allow popups for this site.");
      } else if(code==="auth/unauthorized-domain") {
        toast.error("This address is not enabled for sign-in. Open the configured app address or contact the app owner.");
      } else {
        toast.error("Google sign-in failed. Please try again.");
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-16 bg-[#0a0a0a]">
      {/* Animated gradient orb */}
      <div
        className="gradient-orb"
        style={{ left: "50%", top: "40%" }}
        aria-hidden="true"
      />

      {/* Back to home link */}
      <Link
        href="/"
        className="fixed top-6 left-6 flex items-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors duration-300"
      >
        <Sparkles className="w-5 h-5 text-violet-400" />
        <span className="font-semibold">Animatube</span>
      </Link>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="bg-[#111111]/80 backdrop-blur-xl border border-[#1f1f1f] rounded-2xl p-8 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white mb-2">
              {tab === "signin" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="text-zinc-500 text-sm">
              {tab === "signin"
                ? "Sign in to continue generating videos"
                : "Start creating AI-powered videos today"}
            </p>
          </div>

          {/* Tab switcher */}
          {verificationNotice&&<div className="mb-4 space-y-2 rounded-lg border border-amber-800 p-3 text-sm text-amber-200"><p>Check your inbox and verify your email before continuing. Your video draft is saved.</p><button type="button" className="mr-3 underline" onClick={async()=>{if(!auth.currentUser)return;await auth.currentUser.reload();if(auth.currentUser.emailVerified&&await syncUser()){router.push(callbackUrl);router.refresh();}else toast.error("Email verification is not complete yet");}}>I have verified my email</button><button type="button" className="underline" onClick={async()=>{if(!auth.currentUser)return;try{await sendEmailVerification(auth.currentUser);toast.success("Verification email sent");}catch{toast.error("Unable to send another email yet. Please try later.");}}}>Resend email</button></div>}
          <div className="flex gap-2 mb-6 bg-[#0a0a0a] p-1 rounded-lg">
            <button
              onClick={() => setTab("signin")}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-300 ${
                tab === "signin"
                  ? "bg-violet-600 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setTab("register")}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all duration-300 ${
                tab === "register"
                  ? "bg-violet-600 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Register
            </button>
          </div>

          {/* Sign In Form */}
          {tab === "signin" && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label
                  htmlFor="signin-email"
                  className="block text-sm font-medium text-zinc-300 mb-2"
                >
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    id="signin-email"
                    type="email"
                    value={signInEmail}
                    onChange={(e) => setSignInEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="signin-password"
                  className="block text-sm font-medium text-zinc-300 mb-2"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    id="signin-password"
                    type="password"
                    value={signInPassword}
                    onChange={(e) => setSignInPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={8}
                    className="w-full pl-10 pr-4 py-2.5 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-none transition-all"
                  />
                </div>
                {signInError && (
                  <p className="mt-2 text-sm text-red-400">{signInError}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[#1f1f1f]" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-[#111111] text-zinc-500">
                    Or continue with
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
                className="w-full py-3 px-4 bg-[#0a0a0a] hover:bg-[#1a1a1a] border border-[#1f1f1f] text-zinc-200 font-medium rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
              >
                {googleLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    Continue with Google
                  </>
                )}
              </button>
            </form>
          )}

          {/* Register Form */}
          {tab === "register" && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label
                  htmlFor="register-name"
                  className="block text-sm font-medium text-zinc-300 mb-2"
                >
                  Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    id="register-name"
                    type="text"
                    value={registerName}
                    onChange={(e) => setRegisterName(e.target.value)}
                    placeholder="John Doe"
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-none transition-all"
                  />
                </div>
                {registerErrors.name && (
                  <p className="mt-2 text-sm text-red-400">
                    {registerErrors.name}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="register-email"
                  className="block text-sm font-medium text-zinc-300 mb-2"
                >
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    id="register-email"
                    type="email"
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-none transition-all"
                  />
                </div>
                {registerErrors.email && (
                  <p className="mt-2 text-sm text-red-400">
                    {registerErrors.email}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="register-password"
                  className="block text-sm font-medium text-zinc-300 mb-2"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    id="register-password"
                    type="password"
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={8}
                    className="w-full pl-10 pr-4 py-2.5 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-none transition-all"
                  />
                </div>
                {registerErrors.password && (
                  <p className="mt-2 text-sm text-red-400">
                    {registerErrors.password}
                  </p>
                )}
                <p className="mt-1 text-xs text-zinc-500">
                  Must be at least 8 characters
                </p>
              </div>

              {registerErrors.general && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-sm text-red-400">
                    {registerErrors.general}
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  "Create Account"
                )}
              </button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[#1f1f1f]" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-[#111111] text-zinc-500">
                    Or continue with
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
                className="w-full py-3 px-4 bg-[#0a0a0a] hover:bg-[#1a1a1a] border border-[#1f1f1f] text-zinc-200 font-medium rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
              >
                {googleLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    Continue with Google
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Footer text */}
        <p className="text-center text-xs text-zinc-600 mt-6">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </motion.div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      </main>
    }>
      <SignInForm />
    </Suspense>
  );
}
