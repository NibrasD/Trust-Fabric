import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const tools = [
  { name: "summarize_text", description: "AI text summarizer gated by 0.10 USDC x402 payment", price: "0.10 USDC" },
  { name: "call_proxy", description: "Call any registered API proxy with automatic x402 payment", price: "variable" },
  { name: "execute_workflow", description: "Run a multi-step workflow with API calls and on-chain actions", price: "variable" },
  { name: "list_services", description: "List all x402-gated services registered on Trust Fabric", price: "free" },
  { name: "list_proxies", description: "List all published API proxies in the marketplace", price: "free" },
  { name: "list_workflows", description: "List all public workflows available for execution", price: "free" },
  { name: "register_agent", description: "Register a new agent on Trust Fabric with Stellar address", price: "free" },
  { name: "get_agent_reputation", description: "Fetch on-chain reputation score for any Stellar address", price: "free" },
  { name: "create_session", description: "Create a scoped session key with spend cap and time limit", price: "free" },
  { name: "verify_payment", description: "Verify a Stellar x402 payment transaction on Horizon", price: "free" },
];

const MCP_SERVER_URL = typeof window !== "undefined"
  ? `${window.location.origin.replace(/^http/, "wss")}/api/mcp`
  : "wss://your-deployment.replit.app/api/mcp";

const MCP_ORIGIN = typeof window !== "undefined" ? window.location.origin : "https://your-app.replit.app";

const claudeConfig = `{
  "mcpServers": {
    "trust-fabric": {
      "url": "${MCP_ORIGIN}/api/mcp",
      "headers": {
        "Authorization": "Bearer S... (your Stellar secret key)"
      }
    }
  }
}`;

export default function McpPage() {
  const { toast } = useToast();
  const url = typeof window !== "undefined" ? window.location.origin : "";

  const copyConfig = () => {
    navigator.clipboard.writeText(claudeConfig);
    toast({ title: "Config copied to clipboard" });
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(`${url}/api/mcp`);
    toast({ title: "MCP URL copied" });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">MCP Integration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect Claude, Cursor, or any MCP-capable agent to Trust Fabric.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4">
            <div className="text-xs font-mono text-muted-foreground mb-1">MCP Endpoint</div>
            <div className="font-mono text-xs text-foreground/90 break-all">{url}/api/mcp</div>
            <Button variant="outline" size="sm" className="mt-3 w-full text-xs font-mono" onClick={copyUrl}>
              Copy URL
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-mono text-muted-foreground mb-1">Protocol</div>
            <div className="font-mono text-sm font-semibold">MCP 2024-11-05</div>
            <div className="text-xs text-muted-foreground mt-1">Streamable HTTP transport</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-mono text-muted-foreground mb-1">Tools Available</div>
            <div className="font-mono text-sm font-semibold">{tools.length} tools</div>
            <div className="text-xs text-muted-foreground mt-1">Payment-gated + free</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Available MCP Tools</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border/40">
            {tools.map((t) => (
              <div key={t.name} className="py-3 flex items-start justify-between gap-4">
                <div>
                  <div className="font-mono text-xs font-semibold text-foreground">{t.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>
                </div>
                <Badge
                  variant={t.price === "free" ? "secondary" : "default"}
                  className="text-xs font-mono shrink-0"
                >
                  {t.price}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Claude Desktop Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Add this to your <span className="font-mono">claude_desktop_config.json</span> to connect Claude directly to Trust Fabric.
          </p>
          <div className="bg-muted rounded-lg p-4 font-mono text-xs text-foreground/80 whitespace-pre overflow-x-auto">
            {claudeConfig}
          </div>
          <Button variant="outline" size="sm" className="font-mono text-xs" onClick={copyConfig}>
            Copy Config
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How Payment Works via MCP</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs text-muted-foreground leading-relaxed">
          <div className="flex gap-3 items-start">
            <span className="font-mono text-primary font-bold shrink-0">01</span>
            <span>Agent calls a payment-gated tool (e.g. <span className="font-mono text-foreground">summarize_text</span>)</span>
          </div>
          <div className="flex gap-3 items-start">
            <span className="font-mono text-primary font-bold shrink-0">02</span>
            <span>MCP server receives the tool call and checks for <span className="font-mono text-foreground">STELLAR_SECRET</span> in env</span>
          </div>
          <div className="flex gap-3 items-start">
            <span className="font-mono text-primary font-bold shrink-0">03</span>
            <span>Server auto-builds and submits a Stellar USDC payment to the service address</span>
          </div>
          <div className="flex gap-3 items-start">
            <span className="font-mono text-primary font-bold shrink-0">04</span>
            <span>Transaction hash is used as the <span className="font-mono text-foreground">X-Payment</span> header for the API call</span>
          </div>
          <div className="flex gap-3 items-start">
            <span className="font-mono text-primary font-bold shrink-0">05</span>
            <span>Result is returned to the agent. Transaction is recorded on Soroban reputation contract.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
