import { useListPayments } from "@workspace/api-client-react";
import { Link } from "wouter";
import { formatUsdc, truncateHash } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, Database } from "lucide-react";
import { format } from "date-fns";

export default function PaymentsList() {
  const { data, isLoading } = useListPayments({ limit: 100 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Payment Explorer</h1>
        <p className="text-muted-foreground">Global ledger of agent micropayments on Stellar testnet.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Service</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tx Hash</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array(10).fill(0).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  </TableRow>
                ))
              ) : !data?.payments?.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Database className="h-8 w-8 text-muted" />
                      <p>No payments recorded yet.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                data.payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(payment.createdAt), 'MMM dd, HH:mm:ss')}
                    </TableCell>
                    <TableCell>
                      <Link href={`/agents/${payment.agentId}`} className="font-medium hover:underline text-primary">
                        {payment.agentName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{payment.serviceName}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold">
                      {formatUsdc(payment.amountUsdc)}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={
                          payment.status === 'confirmed' ? 'text-green-500 border-green-500/50 bg-green-500/10' : 
                          payment.status === 'pending' ? 'text-yellow-500 border-yellow-500/50 bg-yellow-500/10' :
                          'text-red-500 border-red-500/50 bg-red-500/10'
                        }
                      >
                        {payment.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <a 
                        href={`https://stellar.expert/explorer/${payment.network}/tx/${payment.txHash}`} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="font-mono text-sm text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                      >
                        {truncateHash(payment.txHash)}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
