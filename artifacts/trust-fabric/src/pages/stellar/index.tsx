import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Zap,
  Wallet,
  Copy,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  ArrowRight,
  Shield,
  Split,
  Network,
  ListChecks,
  Key,
  Lock,
  Unlock,
  AlertTriangle,
  TrendingDown,
} from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

async function apiGet(path: string) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function apiPost(path: string, body: unknown) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(String(err.message ?? err.error ?? `HTTP ${res.status}`));
  }
  return res.json();
}

export default function StellarLab() {
  const { toast } = useToast();

  // State for account creation flow
  const [createdAccount, setCreatedAccount] = useState<null | {
    publicKey: string;
    secretKey: string;
    balances: { xlm: string; usdc: string };
    usdcTrustlineAdded: boolean;
    warning: string;
  }>(null);

  // State for balance check
  const [balanceAddress, setBalanceAddress] = useState("");
  const [balanceResult, setBalanceResult] = useState<null | { xlm: string; usdc: string }>(null);

  // State for payment build — pre-fill from URL query params (pay links)
  const [buildForm, setBuildForm] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      fromSecretKey: "",
      toAddress: params.get("payTo") ?? "",
      amountUsdc: params.get("amount") ?? "0.10",
      memo: params.get("memo") ?? "",
    };
  });
  const [buildResult, setBuildResult] = useState<null | {
    xdr: string;
    fromAddress: string;
    toAddress: string;
    amountUsdc: number;
    mppSplit: { serviceAmount: string; protocolFee: string; protocolFeeAddress: string };
  }>(null);

  // State for tx submission
  const [xdrToSubmit, setXdrToSubmit] = useState("");
  const [submitResult, setSubmitResult] = useState<null | {
    txHash: string;
    ledger?: number;
    successful: boolean;
    explorerUrl: string;
    sessionUpdate?: { spentUsdc: number; remainingUsdc: number } | null;
  }>(null);

  // Session Key state
  const [sessionForm, setSessionForm] = useState({
    agentId: "",
    maxSpendUsdc: "1.00",
    durationMinutes: "60",
  });
  const [activeSession, setActiveSession] = useState<null | {
    id: string;
    sessionToken: string;
    agentName: string;
    maxSpendUsdc: number;
    spentUsdc: number;
    expiresAt: string;
    status: string;
  }>(null);
  const [sessionTokenInBuilder, setSessionTokenInBuilder] = useState("");


  // Network info
  const { data: networkData, isLoading: networkLoading, refetch: refetchNetwork } = useQuery({
    queryKey: ["stellar-network"],
    queryFn: () => apiGet("/stellar/network"),
    refetchInterval: 30000,
  });

  // Services list for the service picker
  const { data: servicesData } = useQuery({
    queryKey: ["services-list"],
    queryFn: () => apiGet("/services"),
  });

  // Agents list for session creation
  const { data: agentsData } = useQuery({
    queryKey: ["agents-list"],
    queryFn: () => apiGet("/agents"),
  });

  // x402 challenge from the actual service (returns 402, which we display)
  const { data: x402Data, isLoading: x402Loading } = useQuery({
    queryKey: ["x402-challenge"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/services/paid/summarize`);
      return res.json(); // 402 is expected — we want to display the body
    },
    retry: false,
  });

  // Create account mutation
  const createAccountMutation = useMutation({
    mutationFn: () => apiPost("/stellar/account/create", {}),
    onSuccess: (data) => {
      setCreatedAccount(data as typeof createdAccount);
      toast({ title: "Account Created", description: "Stellar Testnet account funded via Friendbot." });
    },
    onError: (err) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  // Check balance mutation
  const checkBalanceMutation = useMutation({
    mutationFn: (address: string) => apiGet(`/stellar/account/${address}/balance`),
    onSuccess: (data: any) => {
      setBalanceResult(data.balances);
    },
    onError: (err) => {
      toast({ title: "Balance check failed", description: err.message, variant: "destructive" });
    },
  });

  // Build payment mutation
  const buildPaymentMutation = useMutation({
    mutationFn: (form: typeof buildForm) =>
      apiPost("/stellar/payment/build", {
        fromSecretKey: form.fromSecretKey,
        toAddress: form.toAddress,
        amountUsdc: parseFloat(form.amountUsdc),
        memo: form.memo || undefined,
        sessionToken: sessionTokenInBuilder || undefined,
      }),
    onSuccess: (data) => {
      setBuildResult(data as typeof buildResult);
      setXdrToSubmit((data as any).xdr);
      const ctx = (data as any).sessionContext;
      if (ctx) {
        toast({ title: "Transaction Built", description: `Session approved — ${ctx.remainingUsdc.toFixed(4)} USDC remaining after this tx.` });
      } else {
        toast({ title: "Transaction Built", description: "MPP split transaction ready for submission." });
      }
    },
    onError: (err) => {
      toast({ title: "Build failed", description: err.message, variant: "destructive" });
    },
  });

  // Submit tx mutation
  const submitMutation = useMutation({
    mutationFn: (xdr: string) =>
      apiPost("/stellar/payment/submit", {
        xdr,
        sessionToken: sessionTokenInBuilder || undefined,
        amountUsdc: buildResult?.amountUsdc ?? undefined,
      }),
    onSuccess: (data) => {
      setSubmitResult(data as typeof submitResult);
      if ((data as any).sessionUpdate) {
        const su = (data as any).sessionUpdate;
        setActiveSession((prev) =>
          prev ? { ...prev, spentUsdc: su.spentUsdc } : prev
        );
        toast({ title: "Transaction Submitted", description: `Budget deducted — ${su.remainingUsdc.toFixed(4)} USDC remaining in session.` });
      } else {
        toast({ title: "Transaction Submitted", description: "Payment confirmed on Stellar Testnet." });
      }
    },
    onError: (err) => {
      toast({ title: "Submission failed", description: err.message, variant: "destructive" });
    },
  });

  // Create session mutation
  const createSessionMutation = useMutation({
    mutationFn: (form: typeof sessionForm) =>
      apiPost("/sessions", {
        agentId: form.agentId,
        maxSpendUsdc: parseFloat(form.maxSpendUsdc),
        durationMinutes: parseInt(form.durationMinutes),
        allowedEndpoints: ["/api/services/paid/summarize"],
      }),
    onSuccess: (data: any) => {
      setActiveSession(data);
      setSessionTokenInBuilder(data.sessionToken);
      toast({ title: "Session Created", description: `Token pre-loaded in builder — budget: ${data.maxSpendUsdc} USDC.` });
    },
    onError: (err) => {
      toast({ title: "Session creation failed", description: err.message, variant: "destructive" });
    },
  });

  // Revoke session mutation
  const revokeSessionMutation = useMutation({
    mutationFn: (sessionId: string) => apiPost(`/sessions/${sessionId}/revoke`, {}),
    onSuccess: () => {
      setActiveSession(null);
      setSessionTokenInBuilder("");
      toast({ title: "Session Revoked", description: "The session has been closed." });
    },
    onError: (err) => {
      toast({ title: "Revoke failed", description: err.message, variant: "destructive" });
    },
  });


  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
    toast({ title: "Copied", description: "Copied to clipboard." });
  }

  const networkInfo = networkData as any;
  const x402Spec = x402Data as any;
  const x402Accept = x402Spec?.accepts?.[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Stellar Lab</h1>
        <p className="text-muted-foreground">
          Real Stellar Testnet integration — account creation, MPP payments, and x402 verification.
        </p>
      </div>

      {/* Network Status */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Network className="h-4 w-4 text-primary" /> Network
            </CardTitle>
          </CardHeader>
          <CardContent>
            {networkLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${networkInfo?.horizonConnected ? "bg-green-500" : "bg-yellow-500"}`} />
                  <span className="font-medium">Stellar Testnet</span>
                </div>
                <p className="text-muted-foreground text-xs">
                  {networkInfo?.horizonConnected ? "Horizon connected" : "Horizon unreachable (testnet)"}
                </p>
                <Button variant="ghost" size="sm" className="h-6 p-1 text-xs text-muted-foreground" onClick={() => refetchNetwork()}>
                  <RefreshCw className="h-3 w-3 mr-1" /> Refresh
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> Payment Asset
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <Badge variant="outline" className="font-mono">{networkInfo?.assetName ?? "—"}</Badge>
            <p className="text-xs text-muted-foreground mt-1">
              {networkInfo?.assetName === "XLM" ? "Native XLM (no trustline needed)" : "USDC (trustline required)"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Split className="h-4 w-4 text-primary" /> MPP Split
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-green-500">90%</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">service provider</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-blue-400">10%</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">protocol fee</span>
            </div>
            {networkInfo && !networkInfo.protocolFeeAddressValid && (
              <p className="text-[10px] text-yellow-500 mt-1">
                Fee address not configured — 100% to service
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* x402 Challenge Inspector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Live x402 Payment Challenge
          </CardTitle>
          <CardDescription>
            The actual HTTP 402 response from the AI Summarizer service endpoint — this is what an agent receives before paying.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {x402Loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : x402Spec ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">HTTP Status</Label>
                  <Badge variant="destructive">402 Payment Required</Badge>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">x402 Version</Label>
                  <Badge variant="outline">v{x402Spec.x402Version}</Badge>
                </div>
              </div>
              {x402Accept && (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Amount Required</Label>
                    <p className="font-mono text-sm font-bold text-primary">
                      {x402Accept.maxAmountRequired} {x402Accept.asset}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Pay To</Label>
                    <p className="font-mono text-xs break-all">{x402Accept.payTo}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Network</Label>
                    <Badge variant="secondary">{x402Accept.network}</Badge>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">MPP Protocol Fee</Label>
                    <p className="text-xs text-muted-foreground">
                      {(x402Accept.extra?.protocolFeeFraction ?? 0.1) * 100}% to{" "}
                      <span className="font-mono">{x402Accept.extra?.protocolFeeAddress?.slice(0, 12)}...</span>
                    </p>
                  </div>
                </div>
              )}
              <pre className="text-[10px] bg-muted p-3 rounded-md overflow-x-auto font-mono text-primary/70">
                {JSON.stringify(x402Spec, null, 2)}
              </pre>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Could not load x402 challenge.</p>
          )}
        </CardContent>
      </Card>

      {/* Session Key Manager */}
      <Card className={activeSession ? "border-primary/40" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            Session Key
            {activeSession && (
              <Badge variant="outline" className="ml-auto text-green-400 border-green-700">
                Active
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Authorize a scoped spending session for an agent. Payments without a session token bypass budget enforcement — create one to lock down the builder.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!activeSession ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Agent</Label>
                  <Select
                    value={sessionForm.agentId}
                    onValueChange={(v) => setSessionForm(f => ({ ...f, agentId: v }))}
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue placeholder="Select agent..." />
                    </SelectTrigger>
                    <SelectContent>
                      {((agentsData as any)?.agents ?? []).map((a: any) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Max Spend (USDC)</Label>
                  <Input
                    type="number"
                    step="0.10"
                    min="0.01"
                    value={sessionForm.maxSpendUsdc}
                    onChange={(e) => setSessionForm(f => ({ ...f, maxSpendUsdc: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Duration (minutes)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="1440"
                    value={sessionForm.durationMinutes}
                    onChange={(e) => setSessionForm(f => ({ ...f, durationMinutes: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-900/10 border border-yellow-700/20 text-xs text-yellow-600">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>Without an active session, the payment builder allows unlimited transactions. Create a session to enforce spend limits.</span>
              </div>
              <Button
                className="w-full"
                onClick={() => createSessionMutation.mutate(sessionForm)}
                disabled={createSessionMutation.isPending || !sessionForm.agentId}
              >
                {createSessionMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating Session...</>
                ) : (
                  <><Lock className="mr-2 h-4 w-4" /> Create Session & Lock Builder</>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Active session details */}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Agent</Label>
                  <p className="text-sm font-medium">{activeSession.agentName}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Expires</Label>
                  <p className="text-sm font-mono">{new Date(activeSession.expiresAt).toLocaleTimeString()}</p>
                </div>
              </div>

              {/* Budget bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <Label className="text-muted-foreground">Budget Used</Label>
                  <span className="font-mono">
                    {activeSession.spentUsdc.toFixed(4)} / {activeSession.maxSpendUsdc} USDC
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-500"
                    style={{ width: `${Math.min(100, (activeSession.spentUsdc / activeSession.maxSpendUsdc) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {(activeSession.maxSpendUsdc - activeSession.spentUsdc).toFixed(4)} USDC remaining
                </p>
              </div>

              {/* Session token */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Session Token (active in builder)</Label>
                <div className="flex items-center gap-2">
                  <p className="font-mono text-[10px] break-all flex-1 bg-muted rounded px-2 py-1">
                    {activeSession.sessionToken}
                  </p>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => copyToClipboard(activeSession.sessionToken)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-[10px] text-green-500 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Token is pre-loaded in the payment builder below
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setSessionTokenInBuilder(activeSession.sessionToken)}
                >
                  <Unlock className="mr-1.5 h-3.5 w-3.5" /> Re-link to Builder
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1"
                  onClick={() => revokeSessionMutation.mutate(activeSession.id)}
                  disabled={revokeSessionMutation.isPending}
                >
                  {revokeSessionMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <XCircle className="mr-1.5 h-3.5 w-3.5" />}
                  Revoke Session
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Create Testnet Account */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              Create Testnet Account
            </CardTitle>
            <CardDescription>
              Generate a real Stellar keypair and fund it via Friendbot with 10,000 XLM.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              className="w-full"
              onClick={() => createAccountMutation.mutate()}
              disabled={createAccountMutation.isPending}
            >
              {createAccountMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating Account...</>
              ) : (
                <><Wallet className="mr-2 h-4 w-4" /> Create & Fund via Friendbot</>
              )}
            </Button>

            {createdAccount && (
              <div className="space-y-3 pt-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Public Key</Label>
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-xs break-all flex-1">{createdAccount.publicKey}</p>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => copyToClipboard(createdAccount.publicKey)}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-red-400">Secret Key (shown once)</Label>
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-xs break-all flex-1 text-red-300">{createdAccount.secretKey}</p>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => copyToClipboard(createdAccount.secretKey)}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-muted rounded p-2">
                    <span className="text-muted-foreground">XLM</span>
                    <p className="font-mono font-bold">{createdAccount.balances.xlm}</p>
                  </div>
                  <div className={`rounded p-2 ${(createdAccount as any).usdcSeeded ? "bg-green-900/20 border border-green-800/30" : "bg-muted"}`}>
                    <span className="text-muted-foreground">USDC</span>
                    <p className="font-mono font-bold text-green-400">{createdAccount.balances.usdc || "0"}</p>
                    {(createdAccount as any).usdcSeeded && (
                      <p className="text-[9px] text-green-500 mt-0.5">10 USDC seeded from faucet</p>
                    )}
                  </div>
                </div>
                <a
                  href={`https://stellar.expert/explorer/testnet/account/${createdAccount.publicKey}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  View on Stellar Expert <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Check Balance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Check Account Balance
            </CardTitle>
            <CardDescription>
              Look up XLM and USDC balances for any Stellar Testnet address.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Stellar Address</Label>
              <Input
                placeholder="G... (56 characters)"
                value={balanceAddress}
                onChange={(e) => setBalanceAddress(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => checkBalanceMutation.mutate(balanceAddress)}
              disabled={checkBalanceMutation.isPending || balanceAddress.length < 40}
            >
              {checkBalanceMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking...</>
              ) : (
                "Check Balance"
              )}
            </Button>

            {balanceResult && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-muted rounded p-2">
                  <span className="text-muted-foreground">XLM</span>
                  <p className="font-mono font-bold">{balanceResult.xlm}</p>
                </div>
                <div className="bg-muted rounded p-2">
                  <span className="text-muted-foreground">USDC</span>
                  <p className="font-mono font-bold">{balanceResult.usdc || "0 (no trustline)"}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Build MPP Payment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Split className="h-5 w-5 text-primary" />
            Build MPP Payment Transaction
          </CardTitle>
          <CardDescription>
            Construct an unsigned Stellar transaction that atomically splits the payment: 90% to the service, 10% protocol fee.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Quick-fill from registered service */}
          {(servicesData as any)?.services?.length > 0 && (
            <div className="space-y-2 pb-2 border-b border-border">
              <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ListChecks className="h-3.5 w-3.5" />
                Quick Fill from Registered Service
              </Label>
              <Select
                onValueChange={(val) => {
                  const svc = (servicesData as any).services.find((s: any) => s.id === val);
                  if (!svc) return;
                  const payTo = (x402Spec as any)?.accepts?.[0]?.payTo ?? "";
                  setBuildForm(f => ({
                    ...f,
                    toAddress: payTo,
                    amountUsdc: String(svc.priceUsdc),
                    memo: `stf-${svc.id}`.slice(0, 28),
                  }));
                }}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Select a service to auto-fill address & amount" />
                </SelectTrigger>
                <SelectContent>
                  {(servicesData as any).services.map((svc: any) => (
                    <SelectItem key={svc.id} value={svc.id}>
                      <span className="font-medium">{svc.name}</span>
                      <span className="ml-2 text-muted-foreground font-mono">{svc.priceUsdc} USDC</span>
                      <span className="ml-2 text-xs text-muted-foreground/60">[{svc.category}]</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Fills the service payment address from the live x402 challenge and the price from the registry.
              </p>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>From (Secret Key)</Label>
              <Input
                type="password"
                placeholder="S... (your secret key)"
                value={buildForm.fromSecretKey}
                onChange={(e) => setBuildForm(f => ({ ...f, fromSecretKey: e.target.value }))}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label>To (Service Address)</Label>
              <Input
                placeholder="G... (service provider Stellar address)"
                value={buildForm.toAddress}
                onChange={(e) => setBuildForm(f => ({ ...f, toAddress: e.target.value }))}
                className="font-mono text-xs"
              />
              {buildForm.toAddress && (
                <a
                  href={`https://stellar.expert/explorer/testnet/account/${buildForm.toAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                >
                  View on Stellar Expert <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
            </div>
            <div className="space-y-2">
              <Label>Amount (USDC)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={buildForm.amountUsdc}
                onChange={(e) => setBuildForm(f => ({ ...f, amountUsdc: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Memo (optional, max 28 chars)</Label>
              <Input
                placeholder="trustfabric-payment"
                value={buildForm.memo}
                onChange={(e) => setBuildForm(f => ({ ...f, memo: e.target.value.slice(0, 28) }))}
              />
            </div>
          </div>

          {/* Session status indicator */}
          {sessionTokenInBuilder ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-green-900/10 border border-green-700/20 text-xs text-green-500">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              <span>Session active — budget enforcement on. Tx will be rejected if it exceeds the session limit.</span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-5 px-2 text-[10px] text-muted-foreground hover:text-red-400"
                onClick={() => setSessionTokenInBuilder("")}
              >
                Remove
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-xs text-muted-foreground">
              <Unlock className="h-3.5 w-3.5 shrink-0" />
              <span>No session — payment will bypass budget enforcement. Create a session above to enable limits.</span>
            </div>
          )}

          <Button
            className="w-full"
            onClick={() => buildPaymentMutation.mutate(buildForm)}
            disabled={buildPaymentMutation.isPending || !buildForm.fromSecretKey || !buildForm.toAddress}
          >
            {buildPaymentMutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Building Transaction...</>
            ) : (
              "Build MPP Transaction"
            )}
          </Button>

          {buildResult && (
            <div className="space-y-3 pt-2">
              <Separator />
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-muted rounded p-2 col-span-1">
                  <span className="text-muted-foreground">Total</span>
                  <p className="font-mono font-bold">{buildResult.amountUsdc} USDC</p>
                </div>
                <div className="bg-green-900/20 border border-green-800/30 rounded p-2">
                  <span className="text-muted-foreground">Service (90%)</span>
                  <p className="font-mono font-bold text-green-400">{buildResult.mppSplit.serviceAmount} USDC</p>
                </div>
                <div className="bg-blue-900/20 border border-blue-800/30 rounded p-2">
                  <span className="text-muted-foreground">Protocol (10%)</span>
                  <p className="font-mono font-bold text-blue-400">{buildResult.mppSplit.protocolFee} USDC</p>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Signed XDR (ready to submit)</Label>
                <div className="flex items-start gap-2">
                  <pre className="text-[9px] bg-muted p-2 rounded flex-1 overflow-x-auto font-mono break-all whitespace-pre-wrap">
                    {buildResult.xdr}
                  </pre>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 mt-1" onClick={() => copyToClipboard(buildResult.xdr)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submit Transaction */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5 text-primary" />
            Submit to Stellar Testnet
          </CardTitle>
          <CardDescription>Submit a signed XDR transaction to Horizon.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Signed XDR</Label>
            <textarea
              className="w-full min-h-[100px] rounded-md border bg-muted px-3 py-2 text-[10px] font-mono resize-y"
              placeholder="AAAAAgAAAAB..."
              value={xdrToSubmit}
              onChange={(e) => setXdrToSubmit(e.target.value)}
            />
          </div>
          <Button
            className="w-full"
            onClick={() => submitMutation.mutate(xdrToSubmit)}
            disabled={submitMutation.isPending || !xdrToSubmit}
          >
            {submitMutation.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
            ) : (
              "Submit Transaction"
            )}
          </Button>
          {submitResult && (
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                {submitResult.successful ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                <span className="text-sm font-medium">
                  {submitResult.successful ? "Transaction confirmed" : "Transaction failed"}
                </span>
              </div>
              {submitResult.txHash && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Tx Hash</Label>
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-xs break-all flex-1">{submitResult.txHash}</p>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => copyToClipboard(submitResult.txHash)}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <a
                    href={submitResult.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    View on Stellar Expert <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
              {submitResult.sessionUpdate && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-900/10 border border-blue-700/20 text-xs text-blue-400">
                  <TrendingDown className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    Session budget deducted — {submitResult.sessionUpdate.spentUsdc.toFixed(4)} USDC spent,{" "}
                    {submitResult.sessionUpdate.remainingUsdc.toFixed(4)} USDC remaining
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* x402 Integration Guide */}
      <Card className="bg-sidebar border-sidebar-border">
        <CardHeader>
          <CardTitle className="text-sm">x402 Integration: Full Payment Flow</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-5 text-xs">
            {[
              { n: 1, label: "Discovery", desc: "Agent calls GET /services/paid/summarize" },
              { n: 2, label: "402 Challenge", desc: "Server returns 402 with payment spec (payTo, amount, asset)" },
              { n: 3, label: "MPP Payment", desc: "Agent builds & submits Stellar tx (90% service + 10% fee)" },
              { n: 4, label: "X-PAYMENT", desc: "Agent re-sends POST with X-PAYMENT: <txHash>" },
              { n: 5, label: "Access", desc: "Horizon verifies payment, service executes and responds 200" },
            ].map((step) => (
              <div key={step.n} className="flex flex-col items-center text-center gap-2">
                <div className="h-8 w-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center font-bold text-primary">
                  {step.n}
                </div>
                <span className="font-semibold">{step.label}</span>
                <span className="text-muted-foreground leading-relaxed">{step.desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
