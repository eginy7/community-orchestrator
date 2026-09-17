import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import { Direction } from "radix-ui";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
});

export const metadata: Metadata = {
  title: "Community Orchestrator",
  description: "מה הקהילה שלך צריכה השבוע",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <Direction.Provider dir="rtl">
          <TooltipProvider delayDuration={200}>
            {children}
            <Toaster position="bottom-center" richColors />
          </TooltipProvider>
        </Direction.Provider>
      </body>
    </html>
  );
}
