import { RootProvider } from 'fumadocs-ui/provider/next';
import '../global.css'; // updated relative path
import { Inter } from 'next/font/google';
import { i18nUI } from '@/lib/layout.shared';
import type { Metadata } from 'next';

const inter = Inter({
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NODE_ENV === 'development' ? 'http://localhost:3333' : 'https://docs.foxblaze.trade'),
  title: {
    template: '%s | FoxBlaze',
    default: 'FoxBlaze Docs - High-Performance Hyperliquid Trading Agent',
  },
  description: 'The premier non-custodial automated trading bot and multi-purpose terminal for the Hyperliquid L1.',
  openGraph: {
    title: 'FoxBlaze Docs',
    description: 'The premier non-custodial automated trading bot on Hyperliquid.',
    url: 'https://docs.foxblaze.trade',
    siteName: 'FoxBlaze Documentation',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FoxBlaze Docs',
    description: 'High-performance trading engine for Hyperliquid.',
  }
};

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const lang = (await params).lang;
  return (
    <html lang={lang} className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider i18n={i18nUI.provider(lang)} theme={{ defaultTheme: 'dark' }}>
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
