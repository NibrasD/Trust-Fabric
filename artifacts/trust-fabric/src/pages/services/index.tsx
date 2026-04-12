import { useListServices, getListServicesQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { formatUsdc, getReputationColor } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, ServerCog, Star, Activity } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export default function ServicesList() {
  const { data, isLoading } = useListServices({ limit: 50 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Service Marketplace</h1>
          <p className="text-muted-foreground">x402-protected APIs available for agent consumption.</p>
        </div>
        <Link href="/services/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Register Service
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1,2,3,4,5,6].map(i => (
            <Card key={i} className="flex flex-col">
              <CardHeader><Skeleton className="h-6 w-3/4" /></CardHeader>
              <CardContent className="flex-1 space-y-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !data?.services?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-12 text-muted-foreground">
            <ServerCog className="h-12 w-12 mb-4 text-muted" />
            <p className="text-lg font-medium">No services available</p>
            <p className="text-sm">Be the first to register an x402 protected service.</p>
            <Link href="/services/new" className="mt-4">
              <Button>Register Service</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.services.map((service) => (
            <Card key={service.id} className="flex flex-col hover:border-primary/50 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{service.name}</CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline">{service.category}</Badge>
                      {!service.isActive && <Badge variant="secondary">Inactive</Badge>}
                    </div>
                  </div>
                  <div className="font-mono font-bold text-lg text-primary">
                    {formatUsdc(service.priceUsdc)}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col justify-between pt-2">
                <div>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                    {service.description}
                  </p>
                  <code className="text-xs bg-muted px-2 py-1 rounded block w-full truncate">
                    {service.endpoint}
                  </code>
                </div>
                
                <div className="mt-6 pt-4 border-t grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Reputation</p>
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${getReputationColor(service.reputationScore)}`}>
                        {service.reputationScore}
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Rating</p>
                    <div className="flex items-center gap-1 font-bold">
                      {service.avgRating.toFixed(1)} <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                      <span className="text-xs font-normal text-muted-foreground">({service.totalCalls})</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
