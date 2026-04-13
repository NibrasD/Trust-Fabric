import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Copy, ExternalLink, Link2, Zap } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function PayPage() {
  const { toast } = useToast();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("0.10");
  const [memo, setMemo] = useState("");
  const [link, setLink] = useState("");

  const generateLink = () => {
    if (!to || !amount) return;
    const params = new URLSearchParams({ payTo: to, amount, ...(memo ? { memo } : {}) });
    const url = `${window.location.origin}${BASE}/stellar?${params.toString()}`;
    setLink(url);
  };

  const copy = () => {
    navigator.clipboard.writeText(link);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pay Links</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generate shareable Stellar payment links. The recipient opens the link and the payment form is pre-filled.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4 text-primary" />
            Generate Payment Link
          </CardTitle>
          <CardDescription>
            Anyone who opens this link will land on Stellar Lab with the recipient address and amount already filled in.
          </CardDescription>
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
            className="w-full"
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
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4 text-yellow-400" />
              Payment Link Ready
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="bg-muted rounded p-3 font-mono text-xs break-all text-foreground/80 leading-relaxed">
              {link}
            </div>
            <p className="text-xs text-muted-foreground">
              When opened, this link will launch Stellar Lab with the recipient address and amount pre-filled. The sender just adds their secret key and submits.
            </p>
            <div className="flex gap-2">
              <Button onClick={copy} variant="outline" size="sm" className="flex-1 text-xs gap-1.5">
                <Copy className="h-3 w-3" /> Copy Link
              </Button>
              <Button
                onClick={() => window.open(link, "_blank")}
                variant="outline"
                size="sm"
                className="flex-1 text-xs gap-1.5"
              >
                <ExternalLink className="h-3 w-3" /> Preview
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/50 bg-sidebar">
        <CardContent className="p-4 space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            How it works
            <Badge variant="outline" className="text-[10px] font-mono">x402</Badge>
          </h3>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside leading-relaxed">
            <li>Enter the service provider's Stellar address and price</li>
            <li>Share the generated link with the paying agent or user</li>
            <li>They open the link → Stellar Lab opens pre-filled</li>
            <li>They enter their secret key, sign, and submit the transaction</li>
            <li>Use the resulting Tx Hash as the x402 payment token</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
