import { useGetAgentsSummary, useGetPaymentVolume, useGetServiceCategoryCounts } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Users, CreditCard, ArrowUpRight } from "lucide-react";
import { formatUsdc } from "@/lib/utils";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from "recharts";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetAgentsSummary();
  const { data: volumeData, isLoading: isLoadingVolume } = useGetPaymentVolume({ days: 30 });
  const { data: categories, isLoading: isLoadingCategories } = useGetServiceCategoryCounts();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">System Status</h1>
        <p className="text-muted-foreground">Overview of the Stellar Agent Trust Fabric network.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Agents</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{summary?.totalAgents || 0}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {summary?.activeAgents || 0} currently active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Volume (USDC)</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold">{formatUsdc(summary?.totalPaymentVolume || 0)}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Across {summary?.totalTransactions || 0} transactions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Network Reputation</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{summary?.avgReputationScore?.toFixed(1) || 0} / 100</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Weighted by transaction volume
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Agent</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? (
              <Skeleton className="h-8 w-24" />
            ) : summary?.topAgent ? (
              <>
                <div className="text-xl font-bold truncate">{summary.topAgent.name}</div>
                <p className="text-xs text-muted-foreground mt-1 truncate font-mono">
                  {summary.topAgent.stellarAddress.slice(0, 8)}...
                </p>
              </>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">--</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-7">
        <Card className="md:col-span-5">
          <CardHeader>
            <CardTitle>Payment Volume (30d)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {isLoadingVolume ? (
              <div className="flex h-full items-center justify-center">
                <Skeleton className="h-full w-full" />
              </div>
            ) : volumeData?.dailyVolume?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={volumeData.dailyVolume}>
                  <defs>
                    <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(val) => format(new Date(val), 'MMM dd')}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => `$${val}`}
                  />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                    labelFormatter={(val) => format(new Date(val), 'MMM dd, yyyy')}
                    formatter={(val: number) => [formatUsdc(val), 'Volume']}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="totalAmount" 
                    stroke="hsl(var(--primary))" 
                    fillOpacity={1} 
                    fill="url(#colorVolume)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                No volume data available
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Services by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingCategories ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : categories?.categories?.length ? (
              <div className="space-y-4">
                {categories.categories.map((cat) => (
                  <div key={cat.category} className="flex items-center justify-between">
                    <span className="font-medium">{cat.category}</span>
                    <span className="bg-muted px-2 py-1 rounded-md text-xs font-mono">
                      {cat.count}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                No categories found
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
