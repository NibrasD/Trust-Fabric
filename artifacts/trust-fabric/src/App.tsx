import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Layout from "@/components/layout";

// Core pages
import LandingPage from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import AgentsList from "@/pages/agents/index";
import AgentDetail from "@/pages/agents/detail";
import NewAgent from "@/pages/agents/new";
import SessionsList from "@/pages/sessions/index";
import NewSession from "@/pages/sessions/new";
import ServicesList from "@/pages/services/index";
import NewService from "@/pages/services/new";
import PaymentsList from "@/pages/payments/index";
import DemoLab from "@/pages/demo/index";
import StellarLab from "@/pages/stellar/index";
import SubmitRating from "@/pages/rate/index";

// New pages
import ExplorePage from "@/pages/explore/index";
import NewProxy from "@/pages/proxies/new";
import WorkflowsPage from "@/pages/workflows/index";
import NewWorkflow from "@/pages/workflows/new";
import PayPage from "@/pages/pay/index";
import McpPage from "@/pages/mcp/index";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/home" component={LandingPage} />
      <Route>
        <Layout>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/agents" component={AgentsList} />
            <Route path="/agents/new" component={NewAgent} />
            <Route path="/agents/:id" component={AgentDetail} />
            <Route path="/sessions" component={SessionsList} />
            <Route path="/sessions/new" component={NewSession} />
            <Route path="/services" component={ServicesList} />
            <Route path="/services/new" component={NewService} />
            <Route path="/payments" component={PaymentsList} />
            <Route path="/demo" component={DemoLab} />
            <Route path="/stellar" component={StellarLab} />
            <Route path="/rate" component={SubmitRating} />
            <Route path="/explore" component={ExplorePage} />
            <Route path="/proxies/new" component={NewProxy} />
            <Route path="/workflows" component={WorkflowsPage} />
            <Route path="/workflows/new" component={NewWorkflow} />
            <Route path="/pay" component={PayPage} />
            <Route path="/mcp" component={McpPage} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;