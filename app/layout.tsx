import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/components/auth/AuthProvider";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

export const metadata: Metadata = {
  title: "Animatube — AI Video Factory",
  description:
    "Turn any idea into a published YouTube video with AI. Script → Voiceover → Visuals → Upload.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={geist.variable}>
      <body className="min-h-screen bg-[#080808] text-zinc-100 antialiased">
        <AuthProvider>
          {children}
          <Toaster
            theme="dark"
            toastOptions={{
              style: {
                background: "#111111",
                border: "1px solid #1f1f1f",
                color: "#fafafa",
              },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}
