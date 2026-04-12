import { useListSessions } from "@workspace/api-client-react";
import { Link } from "wouter";
import { formatUsdc } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, KeyRound } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function SessionsList() {
  const { data, isLoading } = useListSessions();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Session Manager</h1>
          <p className="text-muted-foreground">Active, expired, and revoked agent payment sessions.</p>
        </div>
        <Link href="/sessions/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Session
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Spend Limit</TableHead>
                <TableHead>Endpoints</TableHead>
                <TableHead>Expires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  </TableRow>
                ))
              ) : !data?.sessions?.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <KeyRound className="h-8 w-8 text-muted" />
                      <p>No sessions found.</p>
                      <Link href="/sessions/new">
                        <Button variant="link">Create one now</Button>
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                data.sessions.map((session) => {
                  const isExpired = new Date(session.expiresAt) < new Date();
                  const status = session.status === 'active' && isExpired ? 'expired' : session.status;
                  
                  return (
                    <TableRow key={session.id}>
                      <TableCell>
                        <Link href={`/agents/${session.agentId}`} className="font-medium hover:underline text-primary">
                          {session.agentName}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={status === 'active' ? 'default' : 'secondary'}
                          className={status === 'active' ? 'bg-green-500/20 text-green-500 hover:bg-green-500/30' : ''}
                        >
                          {status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <div className="font-mono text-sm">{formatUsdc(session.spentUsdc)} / {formatUsdc(session.maxSpendUsdc)}</div>
                          <div className="h-1.5 w-full bg-muted rounded overflow-hidden">
                            <div 
                              className={`h-full ${session.spentUsdc >= session.maxSpendUsdc ? 'bg-red-500' : 'bg-primary'}`} 
                              style={{ width: `${Math.min(100, (session.spentUsdc / session.maxSpendUsdc) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {session.allowedEndpoints.map(ep => (
                            <Badge key={ep} variant="outline" className="text-xs font-mono">
                              {ep}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {isExpired ? 'Expired' : `in ${formatDistanceToNow(new Date(session.expiresAt))}`}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
