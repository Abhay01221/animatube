import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/Providers";
import { auth } from "@/lib/auth";

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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  
  return (
    <html lang="en" className={geist.variable}>
      <body className="min-h-screen bg-[#080808] text-zinc-100 antialiased">
        <Providers session={session}>
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
        </Providers>
      </body>
    </html>
  );
}
