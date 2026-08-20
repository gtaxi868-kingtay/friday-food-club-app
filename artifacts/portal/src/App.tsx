import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, Redirect } from 'wouter';
import { SessionProvider, useSession } from '@/components/SessionProvider';
import { AppShell } from '@/components/layout/AppShell';

import Login from '@/pages/auth/Login';
import Register from '@/pages/auth/Register';
import StudioDashboard from '@/pages/studio/StudioDashboard';
import NewDrop from '@/pages/studio/NewDrop';
import ScanToken from '@/pages/studio/ScanToken';
import AdminDashboard from '@/pages/admin/AdminDashboard';
import ChefVerification from '@/pages/admin/ChefVerification';
import CurationPanel from '@/pages/admin/CurationPanel';
import SpotsPanel from '@/pages/admin/SpotsPanel';;

const queryClient = new QueryClient();

// Route guard for authenticated users
function ProtectedRoute({ component: Component, allowedRoles }: { component: any, allowedRoles: string[] }) {
  const { user, isLoading } = useSession();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div></div>;
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Redirect to={user.role === 'CHEF' ? '/studio' : user.role === 'ADMIN' ? '/admin' : '/login'} />;
  }

  return (
    <AppShell>
      <Component />
    </AppShell>
  );
}

function Router() {
  const { user, isLoading } = useSession();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div></div>;
  }

  return (
    <Switch>
      <Route path="/">
        {user ? (
          <Redirect to={user.role === 'CHEF' ? '/studio' : user.role === 'ADMIN' ? '/admin' : '/login'} />
        ) : (
          <Redirect to="/login" />
        )}
      </Route>
      
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />

      {/* CHEF Routes */}
      <Route path="/studio">
        <ProtectedRoute component={StudioDashboard} allowedRoles={['CHEF']} />
      </Route>
      <Route path="/studio/new">
        <ProtectedRoute component={NewDrop} allowedRoles={['CHEF']} />
      </Route>
      <Route path="/studio/scan">
        <ProtectedRoute component={ScanToken} allowedRoles={['CHEF']} />
      </Route>

      {/* ADMIN Routes */}
      <Route path="/admin">
        <ProtectedRoute component={AdminDashboard} allowedRoles={['ADMIN']} />
      </Route>
      <Route path="/admin/chefs">
        <ProtectedRoute component={ChefVerification} allowedRoles={['ADMIN']} />
      </Route>
      <Route path="/admin/curation">
        <ProtectedRoute component={CurationPanel} allowedRoles={['ADMIN']} />
      </Route>
      <Route path="/admin/spots">
        <ProtectedRoute component={SpotsPanel} allowedRoles={['ADMIN']} />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <SessionProvider>
            <Router />
          </SessionProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
