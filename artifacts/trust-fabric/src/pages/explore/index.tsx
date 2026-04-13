import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState } from "react";

interface Proxy {
  id: number;
  name: string;
  description?: string;
  targetUrl: string;
  httpMethod: string;
  amountUsdc: string;
  totalCalls: number;
  isActive: boolean;
}

interface Service {
  id: number;
  name: string;
  description?: string;
  endpoint: string;
  priceUsdc: string;
  totalCalls: number;
  category?: string;
}

export default function ExplorePage() {
  const [search, setSearch] = useState("");

  const { data: proxies = [], isLoading: loadingProxies } = useQuery<Proxy[]>({
    queryKey: ["/api/proxies"],
    queryFn: () => fetch("/api/proxies").then((r) => r.json()),
  });

  const { data: services = [], isLoading: loadingServices } = useQuery<Service[]>({
    queryKey: ["/api/services"],
    queryFn: () => fetch("/api/services").then((r) => r.json()).then((d) => Array.isArray(d) ? d : (d.services ?? [])),
  });

  const filtered = [
    ...services.map((s) => ({
      id: `svc-${s.id}`,
      name: s.name,
      description: s.description,
      method: "POST",
      price: s.priceUsdc,
      calls: s.totalCalls,
      type: "service",
      endpoint: s.endpoint,
    })),
    ...proxies.map((p) => ({
      id: `proxy-${p.id}`,
      name: p.name,
      description: p.description,
      method: p.httpMethod,
      price: p.amountUsdc,
      calls: p.totalCalls,
      type: "proxy",
      endpoint: p.targetUrl,
    })),
  ].filter(
    (item) =>
      !search ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Explore APIs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse x402-gated endpoints. Pay per call in USDC on Stellar.
          </p>
        </div>
        <Link href="/proxies/new">
          <Button size="sm" className="font-mono text-xs">+ Publish API</Button>
        </Link>
      </div>

      <div className="flex gap-3">
        <Input
          placeholder="Search APIs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm font-mono text-sm"
        />
      </div>

      {loadingProxies || loadingServices ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            <p>No APIs found.</p>
            <Link href="/proxies/new">
              <Button variant="outline" size="sm" className="mt-4 font-mono text-xs">
                Publish the first API
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <Card
              key={item.id}
              className="border-border/60 hover:border-primary/40 transition-colors"
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-semibold leading-snug">
                    {item.name}
                  </CardTitle>
                  <div className="flex gap-1 shrink-0">
                    <Badge
                      variant={item.type === "service" ? "default" : "secondary"}
                      className="text-xs font-mono"
                    >
                      {item.type === "service" ? "native" : "proxy"}
                    </Badge>
                    <Badge variant="outline" className="text-xs font-mono">
                      {item.method}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {item.description && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>
                )}
                <div className="font-mono text-xs text-muted-foreground truncate">
                  {item.endpoint}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-sm font-bold text-primary font-mono">
                    {item.price} USDC
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {item.calls} calls
                  </span>
                </div>
                <div className="pt-1">
                  {item.type === "service" ? (
                    <Link href="/stellar">
                      <Button variant="outline" size="sm" className="w-full text-xs font-mono">
                        Try via Stellar Lab
                      </Button>
                    </Link>
                  ) : (
                    <Link href={`/proxies/${item.id.toString().replace("proxy-", "")}`}>
                      <Button variant="outline" size="sm" className="w-full text-xs font-mono">
                        View Details
                      </Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
