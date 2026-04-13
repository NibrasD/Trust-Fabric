import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Play, ChevronDown, ChevronUp, Plus, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

interface Step {
  id: string;
  name: string;
  type: string;
}

interface Workflow {
  id: number;
  name: string;
  description?: string;
  isPublic: boolean;
  steps: Step[];
  createdAt: string;
}

interface StepResult {
  status?: number;
  data?: unknown;
  type?: string;
  note?: string;
  amountUsdc?: number;
  toAddress?: string;
  contract?: string;
  method?: string;
}

interface ExecutionResult {
  executionId: number;
  status: "completed" | "failed";
  durationMs: number;
  stepResults: Record<string, StepResult>;
  output: Record<string, unknown>;
  error?: string;
  message?: string;
}

export default function WorkflowsPage() {
  const { toast } = useToast();
  const [expandedResults, setExpandedResults] = useState<Record<number, ExecutionResult | null>>({});
  const [expandedOpen, setExpandedOpen] = useState<Record<number, boolean>>({});
  const [runningId, setRunningId] = useState<number | null>(null);

  const { data: workflows = [], isLoading } = useQuery<Workflow[]>({
    queryKey: ["workflows"],
    queryFn: () => fetch(`${API_BASE}/workflows`).then((r) => r.json()),
  });

  const execute = async (wf: Workflow) => {
    setRunningId(wf.id);
    setExpandedOpen((p) => ({ ...p, [wf.id]: true }));
    setExpandedResults((p) => ({ ...p, [wf.id]: null }));
    try {
      const r = await fetch(`${API_BASE}/workflows/${wf.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: {} }),
      });
      const data = await r.json();
      if (!r.ok) {
        const errMsg = data?.message ?? data?.error ?? `Server error ${r.status}`;
        setExpandedResults((p) => ({
          ...p,
          [wf.id]: { executionId: 0, status: "failed", durationMs: 0, stepResults: {}, output: {}, error: errMsg },
        }));
        toast({ title: "Workflow failed", description: errMsg, variant: "destructive" });
        return;
      }
      const result: ExecutionResult = data;
      setExpandedResults((p) => ({ ...p, [wf.id]: result }));
      if (result.status === "completed") {
        toast({ title: `Workflow completed`, description: `${result.durationMs}ms — ${Object.keys(result.stepResults ?? {}).length} steps` });
      } else {
        toast({ title: "Workflow failed", description: result.error ?? result.message, variant: "destructive" });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setExpandedResults((p) => ({ ...p, [wf.id]: { executionId: 0, status: "failed", durationMs: 0, stepResults: {}, output: {}, error: msg } }));
      toast({ title: "Execution error", description: msg, variant: "destructive" });
    } finally {
      setRunningId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Workflows</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Multi-step automated sequences — chain API calls and on-chain actions.
          </p>
        </div>
        <Link href="/workflows/new">
          <Button size="sm" className="gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" /> New Workflow
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading workflows...
        </div>
      ) : workflows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm space-y-3">
            <p>No workflows yet.</p>
            <Link href="/workflows/new">
              <Button variant="outline" size="sm" className="text-xs">
                Create your first workflow
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {workflows.map((wf) => {
            const result = expandedResults[wf.id];
            const isOpen = expandedOpen[wf.id];
            const isRunning = runningId === wf.id;

            return (
              <Card key={wf.id} className="border-border/60 hover:border-primary/30 transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-sm font-semibold">{wf.name}</CardTitle>
                    <div className="flex gap-1">
                      <Badge variant={wf.isPublic ? "default" : "secondary"} className="text-[10px] font-mono">
                        {wf.isPublic ? "public" : "private"}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {wf.steps?.length ?? 0} steps
                      </Badge>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {wf.description && (
                    <p className="text-xs text-muted-foreground">{wf.description}</p>
                  )}

                  <div className="flex flex-wrap gap-1">
                    {wf.steps?.map((step) => (
                      <span key={step.id} className="inline-flex items-center gap-1 text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">
                        <span className={step.type === "http" ? "text-blue-400" : step.type === "payment" ? "text-yellow-400" : "text-purple-400"}>●</span>
                        {step.name}
                      </span>
                    ))}
                  </div>

                  <Button
                    size="sm"
                    className="w-full gap-2 text-xs"
                    onClick={() => execute(wf)}
                    disabled={isRunning}
                  >
                    {isRunning ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Running...</>
                    ) : (
                      <><Play className="h-3.5 w-3.5" /> Execute</>
                    )}
                  </Button>

                  {/* Execution Results */}
                  {(result !== undefined && result !== null) && (
                    <div className="border border-border/50 rounded-md overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono bg-muted/50 hover:bg-muted transition-colors"
                        onClick={() => setExpandedOpen((p) => ({ ...p, [wf.id]: !isOpen }))}
                      >
                        <span className="flex items-center gap-2">
                          {result.status === "completed" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-red-500" />
                          )}
                          {result.status === "completed" ? "Completed" : "Failed"}
                          {result.durationMs > 0 && (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Clock className="h-3 w-3" />{result.durationMs}ms
                            </span>
                          )}
                        </span>
                        {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>

                      {isOpen && (
                        <div className="divide-y divide-border/40">
                          {result.error && (
                            <div className="px-3 py-2 text-xs text-red-400 font-mono bg-red-950/20">
                              Error: {result.error}
                            </div>
                          )}
                          {Object.entries(result.stepResults ?? {}).map(([stepId, sr], i) => {
                            const stepDef = wf.steps?.find((s) => s.id === stepId);
                            return (
                              <div key={stepId} className="px-3 py-2 space-y-1 bg-background/60">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-mono font-semibold text-muted-foreground">
                                    Step {i + 1} — {stepDef?.name ?? stepId}
                                  </span>
                                  {sr.status != null && (
                                    <Badge
                                      variant={sr.status >= 200 && sr.status < 300 ? "default" : "destructive"}
                                      className="text-[10px] font-mono h-4"
                                    >
                                      {sr.status}
                                    </Badge>
                                  )}
                                  {sr.type && (
                                    <span className="text-[10px] font-mono text-muted-foreground">{sr.type}</span>
                                  )}
                                </div>
                                {sr.data != null && (
                                  <pre className="text-[10px] font-mono bg-muted rounded p-2 overflow-auto max-h-32 leading-relaxed text-foreground/80">
                                    {typeof sr.data === "string" ? sr.data : JSON.stringify(sr.data, null, 2)}
                                  </pre>
                                )}
                                {sr.note && (
                                  <p className="text-[10px] text-muted-foreground italic">{sr.note}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Running placeholder */}
                  {isRunning && result === null && (
                    <div className="border border-border/50 rounded-md px-3 py-3 flex items-center gap-2 text-xs text-muted-foreground font-mono bg-muted/30">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Executing {wf.steps?.length} steps...
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
