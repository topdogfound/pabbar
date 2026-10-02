import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, JetBrains_Mono, Lora, Playfair_Display, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/toast";
import { themeScript } from "@/lib/theme";

const jetbrainsMono = JetBrains_Mono({subsets:['latin'],variable:'--font-mono',preload:false});

// Only the default font (Inter) preloads; the others are fetched once they are used.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk", preload: false });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", preload: false });
const lora = Lora({ subsets: ["latin"], variable: "--font-lora", preload: false });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Pabbar", template: "%s | Pabbar" },
  description: "Pabbar",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-mono", jetbrainsMono.variable, inter.variable, spaceGrotesk.variable, playfair.variable, lora.variable)}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <Toaster>{children}</Toaster>
      </body>
    </html>
  );
}
