import { useListAgents, getListAgentsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { formatUsdc, getReputationColor, getReputationBgColor } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Progress } from "@/components/ui/progress";

export default function AgentsList() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useListAgents({ limit: 50 });

  const filteredAgents = data?.agents.filter(a => 
    a.name.toLowerCase().includes(search.toLowerCase()) || 
    a.stellarAddress.toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agent Explorer</h1>
          <p className="text-muted-foreground">Directory of all registered autonomous agents.</p>
        </div>
        <Link href="/agents/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Register Agent
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by name or address..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Reputation</TableHead>
                  <TableHead className="text-right">Volume</TableHead>
                  <TableHead className="text-right">Tx Count</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array(5).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-5 w-12 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredAgents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No agents found matching your search.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAgents.map((agent) => (
                    <TableRow key={agent.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{agent.name}</span>
                          {!agent.isActive && <Badge variant="secondary">Inactive</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="bg-muted px-2 py-1 rounded text-xs">
                          {agent.stellarAddress.slice(0, 8)}...{agent.stellarAddress.slice(-4)}
                        </code>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 w-48">
                          <span className={`font-bold w-8 ${getReputationColor(agent.reputationScore)}`}>
                            {agent.reputationScore}
                          </span>
                          <Progress 
                            value={agent.reputationScore} 
                            className="h-2" 
                            indicatorColor={getReputationColor(agent.reputationScore)}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatUsdc(agent.totalSpentUsdc)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {agent.totalTransactions}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/agents/${agent.id}`}>
                          <Button variant="ghost" size="sm">Details</Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
