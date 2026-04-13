import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: "⬡",
    title: "x402 Micropayments",
    description:
      "Every API call is gated by a real Stellar on-chain payment. No subscriptions. No keys. Just pay-per-use USDC flows.",
  },
  {
    icon: "🔑",
    title: "Scoped Session Keys",
    description:
      "Agents never touch your primary wallet. Sessions define exact spend caps, time limits, and revocation — enforced by Soroban contracts.",
  },
  {
    icon: "★",
    title: "On-chain Reputation",
    description:
      "Every transaction builds a verifiable trust score on Soroban. Agents prove track records without revealing identity.",
  },
  {
    icon: "◈",
    title: "API Proxy Marketplace",
    description:
      "Wrap any HTTP API with x402 payment requirements. List it publicly so agents can discover and pay for it automatically.",
  },
  {
    icon: "⟳",
    title: "Workflow Engine",
    description:
      "Chain API calls and on-chain actions into reusable multi-step workflows. Agents execute complex sequences in a single call.",
  },
  {
    icon: "⬡",
    title: "MCP Server",
    description:
      "Every service is exposed as an MCP tool. Claude, Cursor, and any AI agent can discover and invoke Stellar-gated APIs natively.",
  },
];

const steps = [
  { n: "01", title: "Create an Agent", body: "Register your Stellar address. Build an on-chain reputation from your first payment." },
  { n: "02", title: "Browse or Publish APIs", body: "Explore the marketplace of x402-gated endpoints. Wrap your own APIs and earn USDC per call." },
  { n: "03", title: "Pay with x402", body: "Each request triggers an HTTP 402 challenge. Your agent pays in USDC, splits 90/10 for protocol fees." },
  { n: "04", title: "Build Trust On-chain", body: "Every transaction and rating lands on Soroban. Your score grows with each verified interaction." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/50 sticky top-0 z-50 bg-background/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 font-mono font-semibold text-sm tracking-tight">
            <span className="text-primary">+</span> Trust Fabric
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/explore" className="hover:text-foreground transition-colors">Explore</Link>
            <Link href="/workflows" className="hover:text-foreground transition-colors">Workflows</Link>
            <Link href="/mcp" className="hover:text-foreground transition-colors">MCP</Link>
            <Link href="/docs" className="hover:text-foreground transition-colors">Docs</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="text-xs">Dashboard</Button>
            </Link>
            <Link href="/agents/new">
              <Button size="sm" className="text-xs">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 py-24 text-center">
        <Badge variant="secondary" className="mb-6 font-mono text-xs">
          Stellar Testnet · Soroban Smart Contracts · x402 Protocol
        </Badge>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-none">
          Agents with limits.<br />
          <span className="text-primary">On Stellar.</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
          Trust Fabric is an agent-native x402 execution fabric that enables AI agents to safely interact with paid APIs and on-chain workflows — using scoped permissions enforced by Soroban smart contracts.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/agents/new">
            <Button size="lg" className="font-mono text-sm px-8">Register Agent</Button>
          </Link>
          <Link href="/explore">
            <Button size="lg" variant="outline" className="font-mono text-sm px-8">Explore APIs</Button>
          </Link>
        </div>
        <p className="mt-6 text-xs text-muted-foreground font-mono">
          Stellar Testnet · USDC payments · No custody
        </p>
      </section>

      <section className="border-y border-border/50 py-8 bg-muted/20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { v: "0.10 USDC", l: "Per API Call" },
              { v: "90/10", l: "MPP Split" },
              { v: "3 Contracts", l: "On Soroban" },
              { v: "< 5s", l: "Settlement" },
            ].map((s) => (
              <div key={s.l}>
                <div className="text-2xl font-bold font-mono text-primary">{s.v}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold tracking-tight mb-3">The Broken Model</h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm leading-relaxed">
            Today's agents either can't act at all, or they require full wallet access — creating unacceptable risk. Trust Fabric fixes this.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-6">
              <div className="text-sm font-mono font-semibold text-destructive mb-3">Today (Broken)</div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-start gap-2"><span className="text-destructive mt-0.5">✗</span> Agent holds full private key</div>
                <div className="flex items-start gap-2"><span className="text-destructive mt-0.5">✗</span> Unlimited permissions, high blast radius</div>
                <div className="flex items-start gap-2"><span className="text-destructive mt-0.5">✗</span> No verifiable track record</div>
                <div className="flex items-start gap-2"><span className="text-destructive mt-0.5">✗</span> All-or-nothing trust model</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-6">
              <div className="text-sm font-mono font-semibold text-primary mb-3">Trust Fabric (Fixed)</div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-start gap-2"><span className="text-primary mt-0.5">✓</span> Scoped session key — least privilege</div>
                <div className="flex items-start gap-2"><span className="text-primary mt-0.5">✓</span> Spend caps + time limits enforced on-chain</div>
                <div className="flex items-start gap-2"><span className="text-primary mt-0.5">✓</span> Verifiable Soroban reputation score</div>
                <div className="flex items-start gap-2"><span className="text-primary mt-0.5">✓</span> x402 pay-per-use, no custody</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="bg-muted/20 border-y border-border/50 py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold tracking-tight mb-3">Core Primitives</h2>
            <p className="text-muted-foreground text-sm max-w-xl mx-auto">
              Everything an agent needs to operate safely at economic scale on Stellar.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f) => (
              <Card key={f.title} className="border-border/60 hover:border-primary/40 transition-colors">
                <CardContent className="p-5">
                  <div className="text-2xl mb-3 font-mono">{f.icon}</div>
                  <div className="font-semibold text-sm mb-2">{f.title}</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{f.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold tracking-tight mb-3">How It Works</h2>
          <p className="text-muted-foreground text-sm max-w-xl mx-auto">
            From agent registration to on-chain reputation — in four steps.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s) => (
            <div key={s.n} className="relative">
              <div className="font-mono text-4xl font-bold text-primary/20 mb-3">{s.n}</div>
              <div className="font-semibold text-sm mb-2">{s.title}</div>
              <p className="text-xs text-muted-foreground leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-muted/20 border-y border-border/50 py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold tracking-tight mb-3">MCP-Native Integration</h2>
            <p className="text-muted-foreground text-sm max-w-xl mx-auto">
              Every service on Trust Fabric is automatically exposed as an MCP tool. Connect Claude, Cursor, or any MCP-capable agent in minutes.
            </p>
          </div>
          <Card className="border-border/60 max-w-2xl mx-auto">
            <CardContent className="p-6 font-mono text-xs text-muted-foreground">
              <div className="text-primary mb-2"># Claude Desktop config</div>
              <pre className="whitespace-pre-wrap text-foreground/80">{`{
  "mcpServers": {
    "trust-fabric": {
      "command": "npx",
      "args": ["-y", "@stellartrust/mcp-server"],
      "env": {
        "TRUST_FABRIC_URL": "https://your-deployment.replit.app",
        "AGENT_SECRET": "S..."
      }
    }
  }
}`}</pre>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-24 text-center">
        <h2 className="text-3xl font-bold tracking-tight mb-4">Start in minutes on Stellar Testnet</h2>
        <p className="text-muted-foreground text-sm max-w-xl mx-auto mb-8">
          No wallet required to explore. Create a testnet account, get 10 USDC automatically, and make your first x402 payment.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/stellar">
            <Button size="lg" className="font-mono text-sm px-8">Stellar Lab</Button>
          </Link>
          <Link href="/demo">
            <Button size="lg" variant="outline" className="font-mono text-sm px-8">Demo Lab</Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-border/50 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="font-mono">Trust Fabric · Stellar Agents x402 Hackathon</div>
          <div className="flex gap-4">
            <Link href="/dashboard" className="hover:text-foreground">Dashboard</Link>
            <Link href="/explore" className="hover:text-foreground">Explore</Link>
            <Link href="/mcp" className="hover:text-foreground">MCP</Link>
            <Link href="/stellar" className="hover:text-foreground">Stellar Lab</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
