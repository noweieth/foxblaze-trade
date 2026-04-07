import Link from 'fumadocs-core/link';
import { Rocket, Star, Shield, Cpu } from 'lucide-react';

export default async function HomePage(props: {
  params: Promise<{ lang: string }>;
}) {
  const params = await props.params;
  const lang = params.lang;

  return (
    <main className="flex flex-col flex-1 pb-16">
      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center text-center px-4 py-24 bg-gradient-to-b from-fd-muted/30 to-transparent">
        <div className="flex items-center gap-3 mb-6">
          <img src="/logo.png" alt="FoxBlaze Logo" className="w-20 h-20 object-contain" />
        </div>
        <h1 className="text-4xl md:text-6xl font-bold mb-6 tracking-tight">
          FoxBlaze Trading Bot
        </h1>
        <p className="text-xl text-fd-muted-foreground max-w-2xl mb-10 leading-relaxed font-medium">
          A high-performance trading & order management bot powered by Hyperliquid liquidity, executed through a minimalist Telegram interface. Access advanced trading tools and exclusive signals backed by data from high-winrate traders.
        </p>
        <div className="flex items-center gap-4">
          <Link 
            href="/docs/getting-started" 
            className="px-6 py-3 bg-fd-primary text-primary-foreground font-semibold rounded-full hover:opacity-90 transition-opacity"
          >
            Start Trading
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
            <h3 className="text-xl font-bold mb-3">Telegram Execution</h3>
            <p className="text-fd-muted-foreground leading-relaxed">
              Execute market and limit orders instantly through a minimalist, lightning-fast Telegram interface without managing private keys.
            </p>
          </Link>

          <Link href="/docs/trading" className="group p-8 rounded-2xl border border-fd-border bg-fd-card hover:border-fd-primary/50 transition-colors">
            <div className="bg-fd-background rounded-xl w-12 h-12 flex items-center justify-center mb-6 border border-fd-border group-hover:border-fd-primary/50 text-fd-primary">
              <Shield className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-3">Advanced Management</h3>
            <p className="text-fd-muted-foreground leading-relaxed">
              Manage complex positions seamlessly with automated Take Profit, Stop Loss, and robust risk management tools inside Discord or Telegram.
            </p>
          </Link>

          <Link href="/docs/premium" className="group p-8 rounded-2xl border border-fd-border bg-fd-card hover:border-fd-primary/50 transition-colors" style={{ background: 'linear-gradient(135deg, rgba(94,205,172,0.08) 0%, transparent 60%)' }}>
            <div className="bg-fd-background rounded-xl w-12 h-12 flex items-center justify-center mb-6 border border-fd-border group-hover:border-fd-primary/50 text-fd-primary">
              <Star className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-3">⭐ Premium</h3>
            <p className="text-fd-muted-foreground leading-relaxed">
              VIP signals from top traders, auto-copy execution, and higher trading limits — completely free.
            </p>
          </Link>

          <Link href="/docs/wallet" className="group p-8 rounded-2xl border border-fd-border bg-fd-card hover:border-fd-primary/50 transition-colors">
            <div className="bg-fd-background rounded-xl w-12 h-12 flex items-center justify-center mb-6 border border-fd-border group-hover:border-fd-primary/50 text-fd-primary">
              <Cpu className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-3">Non-Custodial Wallet</h3>
            <p className="text-fd-muted-foreground leading-relaxed">
              Your funds stay in your control. Trade with zero gas fees on Hyperliquid while keeping full ownership of your wallet.
            </p>
          </Link>

        </div>
      </section>
    </main>
  );
}
