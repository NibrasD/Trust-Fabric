import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface Workflow {
  id: number;
  name: string;
  description?: string;
  isPublic: boolean;
  steps: Array<{ id: string; name: string; type: string }>;
  createdAt: string;
}

export default function WorkflowsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: workflows = [], isLoading } = useQuery<Workflow[]>({
    queryKey: ["/api/workflows"],
    queryFn: () => fetch("/api/workflows").then((r) => r.json()),
  });

  const executeMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/workflows/${id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: {} }),
      });
      return r.json();
    },
    onSuccess: (data) => {
      toast({ title: `Workflow executed`, description: `Status: ${data.status} · ${data.durationMs}ms` });
      qc.invalidateQueries({ queryKey: ["/api/workflows"] });
    },
    onError: (e: Error) => {
      toast({ title: "Execution failed", description: e.message, variant: "destructive" });
    },
  });

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
          <Button size="sm" className="font-mono text-xs">+ New Workflow</Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : workflows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm space-y-3">
            <p>No workflows yet.</p>
            <Link href="/workflows/new">
              <Button variant="outline" size="sm" className="font-mono text-xs">
                Create your first workflow
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {workflows.map((wf) => (
            <Card key={wf.id} className="border-border/60 hover:border-primary/40 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-sm font-semibold">{wf.name}</CardTitle>
                  <div className="flex gap-1">
                    <Badge variant={wf.isPublic ? "default" : "secondary"} className="text-xs font-mono">
                      {wf.isPublic ? "public" : "private"}
                    </Badge>
                    <Badge variant="outline" className="text-xs font-mono">
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
                    <span
                      key={step.id}
                      className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded"
                    >
                      {step.type === "http" ? "◉" : step.type === "payment" ? "$" : "⬡"} {step.name}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs font-mono"
                    onClick={() => executeMutation.mutate(wf.id)}
                    disabled={executeMutation.isPending}
                  >
                    {executeMutation.isPending ? "Running..." : "Execute"}
                  </Button>
                  <Link href={`/workflows/${wf.id}`}>
                    <Button variant="ghost" size="sm" className="text-xs font-mono">
                      Details
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
