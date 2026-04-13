import { useRunDemoAgent, useListAgents, useListServices } from "@workspace/api-client-react";
import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Play, CheckCircle2, CircleDashed, Clock, XCircle, Star, ArrowRight, Activity } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

function truncateHash(hash: string, chars = 12): string {
  if (!hash || hash.length <= chars * 2) return hash;
  return `${hash.slice(0, chars)}...${hash.slice(-6)}`;
}

const formSchema = z.object({
  agentId: z.string().min(1, "Please select an agent"),
  serviceId: z.string().min(1, "Please select a service"),
  textToSummarize: z.string().min(10, "Provide at least 10 characters to summarize"),
});

export default function DemoLab() {
  const { toast } = useToast();
  const { data: agentsData } = useListAgents({ limit: 100 });
  const { data: servicesData } = useListServices({ limit: 100 });
  const runDemoMutation = useRunDemoAgent();
  const [demoResult, setDemoResult] = useState<any | null>(null);
  const [demoError, setDemoError] = useState<{ error: string; steps: any[] } | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      agentId: "",
      serviceId: "",
      textToSummarize: "Stellar is an open-source, decentralized protocol for digital currency to fiat money low-cost transfers which allows cross-border transactions between any pair of currencies. The Stellar protocol is supported by a non-profit organization, the Stellar Development Foundation.",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    setDemoResult(null);
    setDemoError(null);
    runDemoMutation.mutate({ data: values }, {
      onSuccess: (result) => {
        setDemoResult(result);
        toast({ title: "Demo Complete", description: "Agent successfully negotiated, paid, and rated the service." });
      },
      onError: async (err: any) => {
        // Try to extract partial steps from the error response body
        try {
          const body = err?.response ? await err.response.json() : null;
          if (body?.steps) {
            setDemoError({ error: body.error ?? err.message, steps: body.steps });
            return;
          }
        } catch {
          // fall through to generic toast
        }
        setDemoError({ error: err.message, steps: [] });
        toast({ title: "Demo Failed", description: err.message, variant: "destructive" });
      }
    });
  }

  const StepIcon = ({ status }: { status: string }) => {
    if (status === 'success') return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    if (status === 'failed' || status === 'error') return <XCircle className="h-5 w-5 text-red-500" />;
    if (status === 'skipped') return <CircleDashed className="h-5 w-5 text-muted-foreground" />;
    return <Clock className="h-5 w-5 text-yellow-500 animate-pulse" />;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Demo Lab</h1>
        <p className="text-muted-foreground">Simulate an autonomous agent purchasing an API service via x402.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Simulation Parameters</CardTitle>
            <CardDescription>
              Select an agent and a service. The agent will hit a 402 Payment Required, create a session, pay, and execute.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="agentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Agent (Buyer)</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select an agent" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {agentsData?.agents.map(a => (
                            <SelectItem key={a.id} value={a.id}>{a.name} ({a.reputationScore})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="serviceId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Service (Seller)</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a service" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {servicesData?.services.map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name} (${s.priceUsdc})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="textToSummarize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payload</FormLabel>
                      <FormControl>
                        <Textarea rows={5} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={runDemoMutation.isPending}>
                  {runDemoMutation.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running Simulation...</>
                  ) : (
                    <><Play className="mr-2 h-4 w-4" /> Run Agent</>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card className="bg-sidebar border-sidebar-border shadow-inner">
          <CardHeader>
            <CardTitle>Execution Log</CardTitle>
            <CardDescription>Live output of the agent's decision making process.</CardDescription>
          </CardHeader>
          <CardContent>
            {runDemoMutation.isPending ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground space-y-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
                  <Activity className="h-12 w-12 text-primary animate-pulse relative z-10" />
                </div>
                <p className="font-mono text-sm animate-pulse">Negotiating on-chain payment...</p>
              </div>
            ) : demoError ? (
              <div className="space-y-6">
                {demoError.steps.length > 0 && (
                  <div className="space-y-4 relative before:absolute before:inset-0 before:ml-2.5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                    {demoError.steps.map((step: any, i: number) => (
                      <div key={i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                        <div className="flex items-center justify-center w-6 h-6 rounded-full border-2 border-background bg-card shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                          <StepIcon status={step.status} />
                        </div>
                        <div className={`w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] bg-card border p-3 rounded-md shadow-sm ${step.status === 'error' ? 'border-red-500/40 bg-red-500/5' : ''}`}>
                          <h4 className="font-semibold text-sm mb-1">{step.step.replace(/_/g, ' ').toUpperCase()}</h4>
                          <p className={`text-xs ${step.status === 'error' ? 'text-red-400' : 'text-muted-foreground'}`}>{step.message}</p>
                          {step.data && Object.keys(step.data).length > 0 && (
                            <pre className="mt-2 text-[10px] bg-muted p-2 rounded overflow-x-auto text-primary/80 font-mono">
                              {JSON.stringify(step.data, null, 2)}
                            </pre>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="pt-4 border-t border-red-500/20">
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-sm">
                    <h4 className="font-bold mb-1 flex items-center gap-2 text-red-400">
                      <XCircle className="h-4 w-4" /> Access Denied
                    </h4>
                    <p className="text-muted-foreground">{demoError.error}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Go to <span className="font-mono text-primary">/sessions</span> and create an active session for this agent to allow it to run.
                    </p>
                  </div>
                </div>
              </div>
            ) : demoResult ? (
              <div className="space-y-6">
                <div className="space-y-4 relative before:absolute before:inset-0 before:ml-2.5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                  {demoResult.steps.map((step: any, i: number) => (
                    <div key={i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className="flex items-center justify-center w-6 h-6 rounded-full border-2 border-background bg-card shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                        <StepIcon status={step.status} />
                      </div>
                      <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] bg-card border p-3 rounded-md shadow-sm">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-semibold text-sm">{step.step.replace(/_/g, ' ').toUpperCase()}</h4>
                        </div>
                        <p className="text-xs text-muted-foreground">{step.message}</p>
                        {step.data && Object.keys(step.data).length > 0 && (
                          <pre className="mt-2 text-[10px] bg-muted p-2 rounded overflow-x-auto text-primary/80 font-mono">
                            {JSON.stringify(step.data, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-border/50">
                  <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 text-sm">
                    <h4 className="font-bold mb-2 flex items-center gap-2">
                      <Star className="h-4 w-4 text-primary" /> Result Summary
                    </h4>
                    <p>{demoResult.summary}</p>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      {demoResult.stellarExplorerUrl ? (
                        <a
                          href={demoResult.stellarExplorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-xs border border-border rounded px-2 py-0.5 text-primary hover:bg-primary/10 transition-colors"
                          title={demoResult.txHash}
                        >
                          {truncateHash(demoResult.txHash)}
                          <ArrowRight className="h-3 w-3" />
                        </a>
                      ) : (
                        <Badge variant="outline" className="font-mono">{demoResult.txHash ? truncateHash(demoResult.txHash) : 'No Tx'}</Badge>
                      )}
                      <Badge className="bg-primary text-primary-foreground">Reputation: {demoResult.finalReputationScore}</Badge>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <p className="font-mono text-sm">Awaiting execution command...</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
