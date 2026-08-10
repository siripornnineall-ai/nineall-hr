import type { Metadata, Viewport } from "next";
import { Noto_Sans, Noto_Sans_Thai, Noto_Sans_Lao, Noto_Sans_Myanmar } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

const notoSans = Noto_Sans({ variable: "--font-noto-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const notoThai = Noto_Sans_Thai({ variable: "--font-noto-thai", subsets: ["thai", "latin"], weight: ["400", "500", "600", "700"] });
const notoLao = Noto_Sans_Lao({ variable: "--font-noto-lao", subsets: ["lao"], weight: ["400", "500", "600", "700"] });
const notoMyanmar = Noto_Sans_Myanmar({ variable: "--font-noto-myanmar", subsets: ["myanmar"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "Nineall HR — พนักงาน",
  description: "แอปพนักงาน บริษัท ไนน์ ออล กรุ๊ป จำกัด",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png" }],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Nineall HR",
  },
};

export const viewport: Viewport = {
  themeColor: "#003942",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" />
      </head>
      <body className={`${notoSans.variable} ${notoThai.variable} ${notoLao.variable} ${notoMyanmar.variable} antialiased`}>
        <ServiceWorkerRegister />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
