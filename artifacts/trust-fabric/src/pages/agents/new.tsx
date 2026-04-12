import { useRegisterAgent, getListAgentsQueryKey } from "@workspace/api-client-react";
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

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50),
  stellarAddress: z.string().length(56, "Stellar public key must be 56 characters").startsWith("G", "Stellar public key must start with G"),
});

export default function NewAgent() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const registerMutation = useRegisterAgent();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      stellarAddress: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    registerMutation.mutate({ data: values }, {
      onSuccess: (agent) => {
        toast({ title: "Agent Registered", description: `${agent.name} has been successfully registered on the network.` });
        queryClient.invalidateQueries({ queryKey: getListAgentsQueryKey() });
        setLocation(`/agents/${agent.id}`);
      },
      onError: (err) => {
        toast({ 
          title: "Registration Failed", 
          description: err.message || "An error occurred while registering the agent.", 
          variant: "destructive" 
        });
      }
    });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Register Agent</h1>
        <p className="text-muted-foreground">Add a new autonomous agent to the Trust Fabric network.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agent Details</CardTitle>
          <CardDescription>
            Agents need a valid Stellar address to receive trust scores and make payments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agent Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. DiscoveryBot-Alpha" {...field} />
                    </FormControl>
                    <FormDescription>
                      A human-readable identifier for this agent.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="stellarAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stellar Public Key</FormLabel>
                    <FormControl>
                      <Input placeholder="G..." className="font-mono text-sm" {...field} />
                    </FormControl>
                    <FormDescription>
                      The ED25519 public key starting with 'G'.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-4 pt-4 border-t border-border mt-6">
                <Button type="button" variant="outline" onClick={() => setLocation('/agents')}>
                  Cancel
                </Button>
                <Button type="submit" disabled={registerMutation.isPending}>
                  {registerMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Register Agent
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
