import { useRegisterService, getListServicesQueryKey } from "@workspace/api-client-react";
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
import { Textarea } from "@/components/ui/textarea";

const formSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(10),
  category: z.string().min(2),
  endpoint: z.string().url("Must be a valid URL"),
  priceUsdc: z.coerce.number().positive(),
  ownerAddress: z.string().length(56).startsWith("G"),
});

export default function NewService() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const registerMutation = useRegisterService();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      category: "LLM Inference",
      endpoint: "https://",
      priceUsdc: 0.1,
      ownerAddress: "",
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    registerMutation.mutate({ data: values }, {
      onSuccess: () => {
        toast({ title: "Service Registered" });
        queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });
        setLocation(`/services`);
      },
      onError: (err) => {
        toast({ title: "Failed", description: err.message, variant: "destructive" });
      }
    });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Register Service</h1>
        <p className="text-muted-foreground">List a new x402-protected API on the marketplace.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Service Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Service Name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl><Textarea {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="priceUsdc"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price (USDC)</FormLabel>
                      <FormControl><Input type="number" step="0.001" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="endpoint"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Endpoint URL</FormLabel>
                    <FormControl><Input className="font-mono text-sm" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="ownerAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Owner Stellar Address (Receives Payments)</FormLabel>
                    <FormControl><Input className="font-mono text-sm" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-4 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setLocation('/services')}>Cancel</Button>
                <Button type="submit" disabled={registerMutation.isPending}>
                  {registerMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Register
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
