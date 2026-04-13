import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface ProxyForm {
  name: string;
  description: string;
  targetUrl: string;
  httpMethod: string;
  amountUsdc: string;
}

export default function NewProxy() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [form, setForm] = useState<ProxyForm>({
    name: "",
    description: "",
    targetUrl: "",
    httpMethod: "POST",
    amountUsdc: "0.10",
  });

  const createMutation = useMutation({
    mutationFn: async (data: ProxyForm) => {
      const r = await fetch("/api/proxies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/proxies"] });
      toast({ title: "API proxy published" });
      navigate("/explore");
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Publish API Proxy</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Wrap any HTTP endpoint with x402 payment gating on Stellar.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Proxy Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Weather API"
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Real-time weather data"
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Target URL</Label>
            <Input
              value={form.targetUrl}
              onChange={(e) => setForm({ ...form, targetUrl: e.target.value })}
              placeholder="https://api.example.com/endpoint"
              className="font-mono text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">HTTP Method</Label>
              <Select
                value={form.httpMethod}
                onValueChange={(v) => setForm({ ...form, httpMethod: v })}
              >
                <SelectTrigger className="font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                    <SelectItem key={m} value={m} className="font-mono text-sm">
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Price (USDC per call)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={form.amountUsdc}
                onChange={(e) => setForm({ ...form, amountUsdc: e.target.value })}
                className="font-mono text-sm"
              />
            </div>
          </div>

          <div className="pt-2">
            <Button
              className="w-full font-mono text-sm"
              onClick={() => createMutation.mutate(form)}
              disabled={createMutation.isPending || !form.name || !form.targetUrl}
            >
              {createMutation.isPending ? "Publishing..." : "Publish API Proxy"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/40">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="text-foreground font-mono">How it works:</span> When an agent calls this proxy, Trust Fabric verifies a real USDC payment on Stellar first. Then it forwards the request to your target URL and returns the response. Agents pay per call — no subscriptions.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
