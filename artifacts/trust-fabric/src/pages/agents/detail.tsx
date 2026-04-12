import { useGetAgent, useGetAgentActivity, getGetAgentQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { formatUsdc, getReputationColor, truncateHash } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ExternalLink, Activity, Star, Calendar } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";

export default function AgentDetail() {
  const params = useParams();
  const id = params.id as string;
  
  const { data: agent, isLoading: isLoadingAgent } = useGetAgent(id, { query: { enabled: !!id, queryKey: getGetAgentQueryKey(id) } });
  const { data: activity, isLoading: isLoadingActivity } = useGetAgentActivity(id, { limit: 20 }, { query: { enabled: !!id } });

  if (isLoadingAgent) {
    return <div className="p-8"><Skeleton className="h-64 w-full" /></div>;
  }

  if (!agent) {
    return <div className="p-8 text-center text-muted-foreground">Agent not found</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/agents">
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{agent.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <code className="text-sm bg-muted px-2 py-1 rounded font-mono text-muted-foreground">
              {agent.stellarAddress}
            </code>
            {agent.isActive ? (
              <Badge variant="default" className="bg-green-500/20 text-green-500 hover:bg-green-500/30">Active</Badge>
            ) : (
              <Badge variant="secondary">Inactive</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Reputation Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-4xl font-bold ${getReputationColor(agent.reputationScore)}`}>
              {agent.reputationScore}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Out of 100</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Rating</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold flex items-center gap-2">
              {agent.avgRating.toFixed(1)} <Star className="h-6 w-6 text-yellow-500 fill-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Spent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{formatUsdc(agent.totalSpentUsdc)}</div>
            <p className="text-xs text-muted-foreground mt-1">{agent.totalTransactions} transactions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Registered</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{format(new Date(agent.createdAt), 'MMM dd, yyyy')}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Payments</CardTitle>
            <CardDescription>On-chain transactions made by this agent</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingActivity ? (
              <div className="space-y-4">
                {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : activity?.payments?.length ? (
              <div className="space-y-4">
                {activity.payments.map((payment) => (
                  <div key={payment.id} className="flex flex-col gap-2 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">{payment.serviceName}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(payment.createdAt), 'MMM dd HH:mm')}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-bold">{formatUsdc(payment.amountUsdc)}</div>
                        <Badge variant="outline" className={payment.status === 'confirmed' ? 'text-green-500 border-green-500/50' : 'text-yellow-500 border-yellow-500/50'}>
                          {payment.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-xs bg-black/40 p-2 rounded flex items-center justify-between">
                      <span className="font-mono text-muted-foreground">{truncateHash(payment.txHash)}</span>
                      <a href={`https://stellar.expert/explorer/${payment.network}/tx/${payment.txHash}`} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1">
                        Explorer <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">No recent payments</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Ratings</CardTitle>
            <CardDescription>Feedback received for services used</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingActivity ? (
              <div className="space-y-4">
                {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : activity?.ratings?.length ? (
              <div className="space-y-4">
                {activity.ratings.map((rating) => (
                  <div key={rating.id} className="flex flex-col gap-2 p-4 rounded-lg border bg-card">
                    <div className="flex justify-between items-start">
                      <div className="font-medium">{rating.serviceName}</div>
                      <div className="flex text-yellow-500">
                        {Array(5).fill(0).map((_, i) => (
                          <Star key={i} className={`h-4 w-4 ${i < rating.stars ? 'fill-current' : 'text-muted stroke-muted-foreground'}`} />
                        ))}
                      </div>
                    </div>
                    {rating.comment && (
                      <p className="text-sm italic text-muted-foreground border-l-2 pl-2 my-1">"{rating.comment}"</p>
                    )}
                    {rating.reputationDelta !== undefined && (
                      <div className="text-xs font-medium flex items-center gap-1">
                        Reputation impact: 
                        <span className={rating.reputationDelta >= 0 ? "text-green-500" : "text-red-500"}>
                          {rating.reputationDelta > 0 ? '+' : ''}{rating.reputationDelta}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">No recent ratings</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
