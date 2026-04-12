import { useCreateSession, useListAgents, getListSessionsQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const formSchema = z.object({
  agentId: z.string().min(1, "Please select an agent"),
  maxSpendUsdc: z.coerce.number().positive("Amount must be greater than 0"),
  durationMinutes: z.coerce.number().int().positive("Duration must be a positive number"),
  allowedEndpoints: z.string().refine(val => val.split(',').length > 0, "Provide at least one endpoint"),
});

export default function NewSession() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMutation = useCreateSession();
  const { data: agentsData } = useListAgents({ limit: 100 });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      agentId: "",
      maxSpendUsdc: 10,
      durationMinutes: 60,
      allowedEndpoints: "api/v1/summarize",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    const payload = {
      ...values,
      allowedEndpoints: values.allowedEndpoints.split(',').map(s => s.trim()).filter(Boolean)
    };

    createMutation.mutate({ data: payload }, {
      onSuccess: () => {
        toast({ title: "Session Created", description: `Authorized session with spend limit established.` });
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        setLocation(`/sessions`);
      },
      onError: (err) => {
        toast({ 
          title: "Failed to create session", 
          description: err.message || "An error occurred.", 
          variant: "destructive" 
        });
      }
    });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Session</h1>
        <p className="text-muted-foreground">Authorize an agent to spend USDC with specific endpoints.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Session Parameters</CardTitle>
          <CardDescription>
            These parameters will be enforced by the network when the agent attempts to access x402 services.
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
                    <FormLabel>Agent</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select an agent" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {agentsData?.agents.map(a => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="maxSpendUsdc"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Spend (USDC)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="durationMinutes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Duration (Minutes)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="allowedEndpoints"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Allowed Endpoints</FormLabel>
                    <FormControl>
                      <Textarea placeholder="api/v1/summarize, api/v1/generate" className="font-mono text-sm" {...field} />
                    </FormControl>
                    <FormDescription>
                      Comma-separated list of allowed API paths.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-4 pt-4 border-t border-border mt-6">
                <Button type="button" variant="outline" onClick={() => setLocation('/sessions')}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Session
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
