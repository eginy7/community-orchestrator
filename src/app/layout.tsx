import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import { Direction } from "radix-ui";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LocaleProvider } from "@/lib/i18n/client";
import { dirOf, getLocale, getT } from "@/lib/i18n/server";
import "./globals.css";

// Heebo covers Hebrew and Latin, so one font serves both UI languages.
const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = getT(await getLocale());
  return { title: t("meta.title"), description: t("meta.description") };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const dir = dirOf(locale);
  return (
    <html lang={locale} dir={dir} className={`${heebo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <LocaleProvider locale={locale}>
          <Direction.Provider dir={dir}>
            <TooltipProvider delayDuration={200}>
              {children}
              <Toaster position="bottom-center" richColors />
            </TooltipProvider>
          </Direction.Provider>
        </LocaleProvider>
      </body>
    </html>
  );
}
