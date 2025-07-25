import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "HelixDB Dashboard",
    description: "HelixDB",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className="dark" style={{
            minHeight: '100%',
            background: `
        radial-gradient(ellipse 80% 50% at 50% -20%, oklch(0.25 0.01 0 / 0.2), transparent),
        radial-gradient(ellipse 80% 50% at 50% 120%, oklch(0.22 0.01 0 / 0.15), transparent),
        linear-gradient(135deg, oklch(0.16 0.005 0), oklch(0.12 0.005 0))
      `,
            backgroundAttachment: 'fixed',
            backgroundColor: 'oklch(0.12 0.002 0)'
        }}>
            <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased dark`}
                style={{ background: 'transparent', minHeight: '100vh' }}
            >
                {children}
            </body>
        </html>
    );
}
