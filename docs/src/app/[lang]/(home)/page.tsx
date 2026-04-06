import Link from 'next/link';
import { Rocket, TrendingUp, Shield, Cpu } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="flex flex-col flex-1 pb-16">
      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center text-center px-4 py-24 bg-gradient-to-b from-fd-muted/30 to-transparent">
        <div className="flex items-center gap-3 mb-6">
          <img src="/logo_foxblaze.svg" alt="FoxBlaze Logo" className="w-16 h-16 rounded-full" />
        </div>
        <h1 className="text-4xl md:text-6xl font-bold mb-6 tracking-tight">
          FoxBlaze Data Hub
        </h1>
        <p className="text-xl text-fd-muted-foreground max-w-2xl mb-10 leading-relaxed font-medium">
          The premier non-custodial automated trading bot for Hyperliquid. Query blockchain data, execute gasless trades, and automate your strategies with ease.
        </p>
        <div className="flex items-center gap-4">
          <Link 
            href="/docs/getting-started" 
            className="px-6 py-3 bg-fd-primary text-primary-foreground font-semibold rounded-full hover:opacity-90 transition-opacity"
          >
            Start building
          </Link>
          <Link 
            href="/docs" 
            className="px-6 py-3 bg-fd-card border border-fd-border font-semibold rounded-full hover:bg-fd-accent transition-colors"
          >
            Read the docs
          </Link>
        </div>
      </section>

      {/* Main Grid */}
      <section className="container mx-auto px-4 lg:px-8 max-w-5xl mt-12">
        <h2 className="text-2xl font-bold mb-8">What You Can Do</h2>
        <div className="grid md:grid-cols-2 gap-6">
          
          <Link href="/docs/getting-started" className="group p-8 rounded-2xl border border-fd-border bg-fd-card hover:border-fd-primary/50 transition-colors">
            <div className="bg-fd-background rounded-xl w-12 h-12 flex items-center justify-center mb-6 border border-fd-border group-hover:border-fd-primary/50 text-fd-primary">
              <Rocket className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-3">Quick Start</h3>
            <p className="text-fd-muted-foreground leading-relaxed">
              Create your non-custodial wallet and make your first gasless USDC deposit on the Hyperliquid L1.
            </p>
          </Link>

          <Link href="/docs/trading" className="group p-8 rounded-2xl border border-fd-border bg-fd-card hover:border-fd-primary/50 transition-colors">
            <div className="bg-fd-background rounded-xl w-12 h-12 flex items-center justify-center mb-6 border border-fd-border group-hover:border-fd-primary/50 text-fd-primary">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-3">Perpetual Trading</h3>
            <p className="text-fd-muted-foreground leading-relaxed">
              Learn how to execute market and limit orders directly from Telegram with high-speed execution.
            </p>
          </Link>

          <Link href="/docs/trading/risk-management" className="group p-8 rounded-2xl border border-fd-border bg-fd-card hover:border-fd-primary/50 transition-colors">
            <div className="bg-fd-background rounded-xl w-12 h-12 flex items-center justify-center mb-6 border border-fd-border group-hover:border-fd-primary/50 text-fd-primary">
              <Shield className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-3">Risk Management</h3>
            <p className="text-fd-muted-foreground leading-relaxed">
              Protect your portfolio with automated Take Profit, Stop Loss, and trailing stops via FoxBlaze RiskService.
            </p>
          </Link>

          <Link href="/docs/architecture" className="group p-8 rounded-2xl border border-fd-border bg-fd-card hover:border-fd-primary/50 transition-colors">
            <div className="bg-fd-background rounded-xl w-12 h-12 flex items-center justify-center mb-6 border border-fd-border group-hover:border-fd-primary/50 text-fd-primary">
              <Cpu className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-3">Architecture Reference</h3>
            <p className="text-fd-muted-foreground leading-relaxed">
              Deep dive into our robust NestJS/Prisma backend and BullMQ processing pipeline.
            </p>
          </Link>

        </div>
      </section>
    </main>
  );
}
