import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ResQ: Your AI that doesn't wait for you to panic",
  description:
    "ResQ is an autonomous AI productivity companion that proactively helps you plan, prioritize, and complete tasks before deadlines slip. Built for Vibe2Ship.",
  keywords: [
    "AI productivity",
    "deadline manager",
    "AI assistant",
    "task automation",
    "Google AI",
    "Vibe2Ship",
  ],
  authors: [{ name: "Harish" }],
  openGraph: {
    title: "ResQ: Your AI that doesn't wait for you to panic",
    description:
      "An agentic AI that watches your deadlines and does the work for you. Built for Vibe2Ship hackathon.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <AuthProvider>
          <TooltipProvider delay={150}>
            {children}
            <Toaster richColors position="top-right" />
          </TooltipProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
