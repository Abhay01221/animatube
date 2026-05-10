/**
 * NextAuth v5 (beta) configuration.
 * Uses Google OAuth with the Prisma adapter.
 * Stores YouTube OAuth tokens (encrypted) on the User record.
 */
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";
import { encrypt, decrypt } from "./encrypt";

const authConfig = {
  adapter: PrismaAdapter(prisma),
  debug: process.env.NODE_ENV === "development",
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          // Request YouTube upload scope alongside standard Google scopes
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/youtube.upload",
            "https://www.googleapis.com/auth/youtube",
          ].join(" "),
          access_type: "offline",
          prompt: "consent", // force refresh_token on every login
          response_type: "code",
        },
      },
    }),
  ],
  callbacks: {
    async session({ session, user }: any) {
      console.log("[auth] session callback - user:", user?.id, "email:", user?.email);
      // Attach user ID to session for API routes
      session.user.id = user.id;
      console.log("[auth] session callback - returning session with user.id:", session.user.id);
      return session;
    },
    async signIn({ user, account, profile }: any) {
      console.log("[auth] signIn callback triggered");
      console.log("[auth] - provider:", account?.provider);
      console.log("[auth] - user.id:", user?.id);
      console.log("[auth] - user.email:", user?.email);
      console.log("[auth] - account.access_token exists:", !!account?.access_token);
      console.log("[auth] - account.refresh_token exists:", !!account?.refresh_token);

      // Store encrypted YouTube tokens when user signs in with Google.
      if (account?.provider === "google" && account.access_token) {
        try {
          // Wait a bit for the adapter to create the user record first
          // The Prisma adapter creates the user before this callback completes
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Fetch existing user to preserve refresh token if new one not provided
          const existingUser = await prisma.user.findUnique({
            where: { email: user.email! },
            select: { youtubeTokens: true }
          });

          let existingRefreshToken: string | undefined;
          if (existingUser?.youtubeTokens) {
            try {
              const existingTokensJson = decrypt(existingUser.youtubeTokens);
              const existingTokens = JSON.parse(existingTokensJson);
              existingRefreshToken = existingTokens.refresh_token;
              console.log("[auth] - existing refresh_token found in DB:", !!existingRefreshToken);
            } catch (err) {
              console.error("[auth] Failed to decrypt existing tokens:", err);
            }
          }

          // Use new refresh token if provided, otherwise keep existing one
          const refreshToken = account.refresh_token ?? existingRefreshToken;
          
          if (!refreshToken) {
            console.warn("[auth] ⚠️ No refresh token available (new or existing)");
          } else {
            console.log("[auth] ✓ Refresh token available for storage");
          }

          const tokens = {
            access_token: account.access_token,
            refresh_token: refreshToken,
            expiry_date: account.expires_at
              ? account.expires_at * 1000
              : Date.now() + 3600 * 1000,
          };
          
          const encryptedTokens = encrypt(JSON.stringify(tokens));
          console.log("[auth] Saving YouTube tokens for user:", user.email);
          
          // Only update - don't create. The adapter handles user creation.
          const updated = await prisma.user.updateMany({
            where: { 
              email: user.email!
            },
            data: { 
              youtubeTokens: encryptedTokens 
            },
          });
          
          console.log("[auth] YouTube tokens update result - count:", updated.count);
          
          if (updated.count === 0) {
            console.error("[auth] ⚠️ Failed to update tokens - user not found");
          } else {
            console.log("[auth] ✓ Tokens saved successfully");
          }
        } catch (err) {
          // Non-fatal — user can still sign in, YouTube upload will prompt reconnect
          console.error("[auth] Failed to store YouTube tokens:", err);
          // Don't return false here - allow sign in to continue
        }
      }
      
      console.log("[auth] signIn callback returning true");
      return true;
    },
  },
  pages: {
    signIn: "/",
  },
  session: { 
    strategy: "database" as const,
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax' as const,
        path: '/',
        secure: false, // Set to false for localhost
      },
    },
  },
};

// Log the config on startup (excluding sensitive data)
console.log("[auth] NextAuth Configuration:");
console.log("[auth] - Adapter:", authConfig.adapter ? "PrismaAdapter" : "none");
console.log("[auth] - Session strategy:", authConfig.session.strategy);
console.log("[auth] - Session maxAge:", authConfig.session.maxAge);
console.log("[auth] - Debug mode:", authConfig.debug);
console.log("[auth] - Cookies config:", JSON.stringify(authConfig.cookies, null, 2));
console.log("[auth] - Providers:", authConfig.providers.map((p: any) => p.id || p.name).join(", "));

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);
