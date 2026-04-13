import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function PayPage() {
  const { toast } = useToast();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("0.10");
  const [memo, setMemo] = useState("");
  const [link, setLink] = useState("");

  const generateLink = () => {
    if (!to || !amount) return;
    const base = window.location.origin + "/pay";
    const url = `${base}/${encodeURIComponent(to)}/${encodeURIComponent(amount)}${memo ? `?memo=${encodeURIComponent(memo)}` : ""}`;
    setLink(url);
  };

  const copy = () => {
    navigator.clipboard.writeText(link);
    toast({ title: "Copied to clipboard" });
  };

  const stellarLabUrl = to && amount
    ? `https://laboratory.stellar.org/#txbuilder?params=${encodeURIComponent(JSON.stringify({ to, amount: parseFloat(amount), asset: "USDC" }))}`
    : "";

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pay Links</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generate shareable Stellar payment links for USDC transfers.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate Payment Link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Recipient Address (Stellar)</Label>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="G... (56 chars)"
              className="font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Amount (USDC)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Memo (optional)</Label>
              <Input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="e.g. session-id"
                className="font-mono text-xs"
              />
            </div>
          </div>

          <Button
            className="w-full font-mono text-sm"
            onClick={generateLink}
            disabled={!to || !amount}
          >
            Generate Link
          </Button>
        </CardContent>
      </Card>

      {link && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="text-base">Your Payment Link</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="bg-muted rounded p-3 font-mono text-xs break-all text-foreground/80">
              {link}
            </div>
            <div className="flex gap-2">
              <Button onClick={copy} variant="outline" size="sm" className="font-mono text-xs flex-1">
                Copy Link
              </Button>
              <Button
                onClick={() => window.open(stellarLabUrl, "_blank")}
                variant="outline"
                size="sm"
                className="font-mono text-xs flex-1"
                disabled={!stellarLabUrl}
              >
                Open Stellar Lab
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/40">
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-2">Quick x402 Payment</h3>
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">
            Build and submit a real USDC payment directly on Stellar Testnet, then use the transaction hash as your x402 access token.
          </p>
          <a href="/stellar">
            <Button variant="outline" size="sm" className="font-mono text-xs w-full">
              Open Stellar Lab
            </Button>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
