import { useSubmitRating, useListAgents, useListServices } from "@workspace/api-client-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Star, Receipt, CheckCircle2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

const formSchema = z.object({
  agentId: z.string().min(1, "Agent required"),
  serviceId: z.string().min(1, "Service required"),
  paymentId: z.string().min(1, "Payment ID required"),
  stars: z.number().min(1).max(5),
  comment: z.string().optional(),
});

export default function SubmitRating() {
  const { toast } = useToast();
  const { data: agentsData } = useListAgents({ limit: 100 });
  const { data: servicesData } = useListServices({ limit: 100 });
  const submitRating = useSubmitRating();
  const [hoveredStar, setHoveredStar] = useState(0);

  const { data: paymentsData } = useQuery({
    queryKey: ["recent-payments-for-rating"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/payments?limit=20&status=confirmed`);
      if (!res.ok) throw new Error("Failed to fetch payments");
      return res.json();
    },
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      agentId: "",
      serviceId: "",
      paymentId: "",
      stars: 5,
      comment: "",
    },
  });

  function fillFromPayment(payment: any) {
    form.setValue("agentId", String(payment.agentId));
    form.setValue("serviceId", String(payment.serviceId));
    form.setValue("paymentId", payment.id);
    toast({ title: "Auto-filled", description: `Loaded payment from ${payment.agentName} → ${payment.serviceName}` });
  }

  function onSubmit(values: z.infer<typeof formSchema>) {
    submitRating.mutate({ data: values }, {
      onSuccess: (rating) => {
        toast({
          title: "Rating Submitted",
          description: `Reputation updated. Change: ${rating.reputationDelta > 0 ? '+' : ''}${rating.reputationDelta}`
        });
        form.reset();
      },
      onError: (err) => {
        toast({ title: "Failed", description: err.message, variant: "destructive" });
      }
    });
  }

  const recentPayments = (paymentsData as any)?.payments ?? [];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Post-Transaction Rating</h1>
        <p className="text-muted-foreground">Rate a service to influence its on-chain reputation score.</p>
      </div>

      {/* Recent payments picker */}
      {recentPayments.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              Pick a Confirmed Payment
            </CardTitle>
            <CardDescription>
              Select from your recent confirmed payments to auto-fill the rating form with verified data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {recentPayments.map((p: any) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => fillFromPayment(p)}
                  className="w-full text-left rounded-md border border-border bg-muted/30 hover:bg-muted/60 transition-colors px-3 py-2.5 text-xs group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{p.agentName}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-medium text-primary">{p.serviceName}</span>
                      </div>
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <span className="font-mono">{p.amountUsdc} USDC</span>
                        <span className="font-mono text-[10px]">#{p.id}</span>
                        <span>{new Date(p.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-[10px] text-green-500 border-green-500/30">
                        <CheckCircle2 className="h-2.5 w-2.5 mr-1" />
                        confirmed
                      </Badge>
                      <span className="text-[10px] text-muted-foreground group-hover:text-primary transition-colors">
                        Use this →
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Submit Feedback</CardTitle>
          <CardDescription>
            Ratings directly impact the service provider's on-chain reputation via Soroban smart contract.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="agentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Agent (Rater)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select agent" />
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

                <FormField
                  control={form.control}
                  name="serviceId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Service (Rated)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select service" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {servicesData?.services.map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="paymentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment ID (Proof of usage)</FormLabel>
                    <FormControl>
                      <Input placeholder="Select a payment above, or type the payment ID" className="font-mono text-sm" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              <FormField
                control={form.control}
                name="stars"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rating</FormLabel>
                    <FormControl>
                      <div className="flex gap-2" onMouseLeave={() => setHoveredStar(0)}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`h-8 w-8 cursor-pointer transition-colors ${
                              (hoveredStar || field.value) >= star
                                ? "fill-yellow-500 text-yellow-500"
                                : "text-muted stroke-muted-foreground hover:text-yellow-500/50 hover:stroke-yellow-500/50"
                            }`}
                            onMouseEnter={() => setHoveredStar(star)}
                            onClick={() => field.onChange(star)}
                          />
                        ))}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="comment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Comment (Optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="How did the service perform?" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={submitRating.isPending}>
                {submitRating.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Rating
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
