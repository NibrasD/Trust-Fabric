import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

type StepType = "http" | "payment" | "onchain";

interface Step {
  id: string;
  name: string;
  type: StepType;
  config: Record<string, unknown>;
  outputAs?: string;
}

export default function NewWorkflow() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);

  const addStep = (type: StepType) => {
    const id = `step_${Date.now()}`;
    const defaults: Record<StepType, Partial<Step>> = {
      http: { name: "HTTP Request", config: { url: "", method: "GET" } },
      payment: { name: "x402 Payment", config: { amountUsdc: 0.1, toAddress: "" } },
      onchain: { name: "Soroban Call", config: { contract: "", method: "" } },
    };
    setSteps([...steps, { id, type, ...defaults[type] } as Step]);
  };

  const removeStep = (id: string) => setSteps(steps.filter((s) => s.id !== id));

  const updateStep = (id: string, patch: Partial<Step>) =>
    setSteps(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const createMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, isPublic, steps }),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/workflows"] });
      toast({ title: "Workflow created" });
      navigate("/workflows");
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Workflow</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Chain API calls, payments, and on-chain actions into a reusable sequence.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Fetch + Summarize + Record"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this workflow does"
              className="font-mono text-sm"
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
            <Label className="text-xs">Public workflow</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Steps ({steps.length})</CardTitle>
            <div className="flex gap-2">
              {(["http", "payment", "onchain"] as StepType[]).map((t) => (
                <Button
                  key={t}
                  variant="outline"
                  size="sm"
                  className="text-xs font-mono"
                  onClick={() => addStep(t)}
                >
                  + {t === "http" ? "HTTP" : t === "payment" ? "Payment" : "On-chain"}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {steps.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              No steps yet. Add HTTP, Payment, or On-chain steps above.
            </p>
          )}
          {steps.map((step, i) => (
            <div key={step.id} className="border border-border/60 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-muted-foreground">
                  {i + 1}.{" "}
                  <span className="text-foreground font-semibold">
                    {step.type === "http" ? "◉" : step.type === "payment" ? "$" : "⬡"}{" "}
                    {step.type.toUpperCase()}
                  </span>
                </span>
                <button
                  onClick={() => removeStep(step.id)}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  remove
                </button>
              </div>
              <Input
                value={step.name}
                onChange={(e) => updateStep(step.id, { name: e.target.value })}
                placeholder="Step name"
                className="font-mono text-xs h-7"
              />
              {step.type === "http" && (
                <div className="grid grid-cols-3 gap-2">
                  <Select
                    value={String(step.config.method ?? "GET")}
                    onValueChange={(v) =>
                      updateStep(step.id, { config: { ...step.config, method: v } })
                    }
                  >
                    <SelectTrigger className="font-mono text-xs h-7">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["GET", "POST", "PUT", "DELETE"].map((m) => (
                        <SelectItem key={m} value={m} className="font-mono text-xs">
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="col-span-2 font-mono text-xs h-7"
                    value={String(step.config.url ?? "")}
                    onChange={(e) =>
                      updateStep(step.id, { config: { ...step.config, url: e.target.value } })
                    }
                    placeholder="https://api.example.com/..."
                  />
                </div>
              )}
              {step.type === "payment" && (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    className="font-mono text-xs h-7"
                    value={String(step.config.amountUsdc ?? "")}
                    onChange={(e) =>
                      updateStep(step.id, {
                        config: { ...step.config, amountUsdc: parseFloat(e.target.value) },
                      })
                    }
                    placeholder="0.10 USDC"
                    type="number"
                    step="0.01"
                  />
                  <Input
                    className="font-mono text-xs h-7"
                    value={String(step.config.toAddress ?? "")}
                    onChange={(e) =>
                      updateStep(step.id, {
                        config: { ...step.config, toAddress: e.target.value },
                      })
                    }
                    placeholder="G... (payTo address)"
                  />
                </div>
              )}
              {step.type === "onchain" && (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    className="font-mono text-xs h-7"
                    value={String(step.config.contract ?? "")}
                    onChange={(e) =>
                      updateStep(step.id, {
                        config: { ...step.config, contract: e.target.value },
                      })
                    }
                    placeholder="C... (contract id)"
                  />
                  <Input
                    className="font-mono text-xs h-7"
                    value={String(step.config.method ?? "")}
                    onChange={(e) =>
                      updateStep(step.id, {
                        config: { ...step.config, method: e.target.value },
                      })
                    }
                    placeholder="method_name"
                  />
                </div>
              )}
              <Input
                className="font-mono text-xs h-7"
                value={step.outputAs ?? ""}
                onChange={(e) => updateStep(step.id, { outputAs: e.target.value || undefined })}
                placeholder="Output variable name (optional)"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Button
        className="w-full font-mono text-sm"
        onClick={() => createMutation.mutate()}
        disabled={createMutation.isPending || !name}
      >
        {createMutation.isPending ? "Creating..." : "Create Workflow"}
      </Button>
    </div>
  );
}
