import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import LoginPage from "./pages/LoginPage";
import ConsolePage from "./pages/ConsolePage";
import FileManagerPage from "./pages/FileManagerPage";
import PluginsPage from "./pages/PluginsPage";
import UsersPage from "./pages/UsersPage";
import ServerStatusPage from "./pages/ServerStatusPage";
import SettingsPage from "./pages/SettingsPage";
import BackupsPage from "./pages/BackupsPage";
import LogsPage from "./pages/LogsPage";
import PlayersLivePage from "./pages/PlayersLivePage";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
});

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { authenticated, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!authenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<RequireAuth><ConsolePage /></RequireAuth>} />
            <Route path="/files" element={<RequireAuth><FileManagerPage /></RequireAuth>} />
            <Route path="/plugins" element={<RequireAuth><PluginsPage /></RequireAuth>} />
            <Route path="/users" element={<RequireAuth><UsersPage /></RequireAuth>} />
            <Route path="/players" element={<RequireAuth><PlayersLivePage /></RequireAuth>} />
            <Route path="/backups" element={<RequireAuth><BackupsPage /></RequireAuth>} />
            <Route path="/logs" element={<RequireAuth><LogsPage /></RequireAuth>} />
            <Route path="/status" element={<RequireAuth><ServerStatusPage /></RequireAuth>} />
            <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
