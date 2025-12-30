import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { CookieConsent } from "@/components/CookieConsent";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";

import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import ProductForm from "./pages/ProductForm";
import Customers from "./pages/Customers";
import CustomerForm from "./pages/CustomerForm";
import CustomerHistory from "./pages/CustomerHistory";
import Orders from "./pages/Orders";
import OrdersKanban from "./pages/OrdersKanban";
import OrderForm from "./pages/OrderForm";
import OrderDetails from "./pages/OrderDetails";
import Production from "./pages/Production";
import Stock from "./pages/Stock";
import Supplies from "./pages/Supplies";
import Categories from "./pages/Categories";
import Attributes from "./pages/Attributes";
import PDV from "./pages/PDV";
import Settings from "./pages/Settings";
import UserManagement from "./pages/UserManagement";
import Companies from "./pages/Companies";
import CompanyForm from "./pages/CompanyForm";
import PublicCatalog from "./pages/PublicCatalog";
import PublicProductDetails from "./pages/PublicProductDetails";
import PublicOrder from "./pages/PublicOrder";
import Subscription from "./pages/Subscription";
import SubscriptionSuccess from "./pages/SubscriptionSuccess";
import SubscriptionCancel from "./pages/SubscriptionCancel";
import Onboarding from "./pages/Onboarding";
import NotFound from "./pages/NotFound";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import SuperAdminCompanies from "./pages/SuperAdminCompanies";
import SuperAdminPlans from "./pages/SuperAdminPlans";
import Profile from "./pages/Profile";
import Reports from "./pages/Reports";
import BannerManagement from "./pages/BannerManagement";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <CookieConsent />
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/onboarding" element={
              <ProtectedRoute>
                <Onboarding />
              </ProtectedRoute>
            } />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            <Route path="/dashboard" element={
              <ProtectedRoute>
                <AppLayout><Dashboard /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/pdv" element={
              <ProtectedRoute allowedRoles={['admin', 'caixa']}>
                <AppLayout><PDV /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/pedidos" element={
              <ProtectedRoute allowedRoles={['admin', 'atendente', 'caixa']}>
                <AppLayout><Orders /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/pedidos/kanban" element={
              <ProtectedRoute allowedRoles={['admin', 'atendente', 'caixa', 'producao']}>
                <AppLayout><OrdersKanban /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/pedidos/novo" element={
              <ProtectedRoute allowedRoles={['admin', 'atendente', 'caixa']}>
                <AppLayout><OrderForm /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/pedidos/:id" element={
              <ProtectedRoute allowedRoles={['admin', 'atendente', 'caixa', 'producao']}>
                <AppLayout><OrderDetails /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/producao" element={
              <ProtectedRoute allowedRoles={['admin', 'producao']}>
                <AppLayout><Production /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/produtos" element={
              <ProtectedRoute allowedRoles={['admin', 'atendente']}>
                <AppLayout><Products /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/produtos/novo" element={
              <ProtectedRoute allowedRoles={['admin', 'atendente']}>
                <AppLayout><ProductForm /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/produtos/:id" element={
              <ProtectedRoute allowedRoles={['admin', 'atendente']}>
                <AppLayout><ProductForm /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/insumos" element={
              <ProtectedRoute allowedRoles={['admin', 'atendente']}>
                <AppLayout><Supplies /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/categorias" element={
              <ProtectedRoute allowedRoles={['admin', 'atendente']}>
                <AppLayout><Categories /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/atributos" element={
              <ProtectedRoute allowedRoles={['admin', 'atendente']}>
                <AppLayout><Attributes /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/estoque" element={
              <ProtectedRoute allowedRoles={['admin', 'atendente']}>
                <AppLayout><Stock /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/clientes" element={
              <ProtectedRoute allowedRoles={['admin', 'atendente']}>
                <AppLayout><Customers /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/clientes/novo" element={
              <ProtectedRoute allowedRoles={['admin', 'atendente']}>
                <AppLayout><CustomerForm /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/clientes/:id" element={
              <ProtectedRoute allowedRoles={['admin', 'atendente']}>
                <AppLayout><CustomerForm /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/clientes/:id/historico" element={
              <ProtectedRoute allowedRoles={['admin', 'atendente']}>
                <AppLayout><CustomerHistory /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/relatorios" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AppLayout><Reports /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/usuarios" element={
              <ProtectedRoute allowedRoles={['admin', 'super_admin']}>
                <AppLayout><UserManagement /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/banners" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AppLayout><BannerManagement /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/empresas" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AppLayout><Companies /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/empresas/nova" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AppLayout><CompanyForm /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/empresas/:id/editar" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AppLayout><CompanyForm /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/configuracoes" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AppLayout><Settings /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/assinatura" element={
              <ProtectedRoute allowedRoles={['admin', 'atendente', 'caixa', 'producao', 'super_admin']}>
                <AppLayout><Subscription /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/assinatura/sucesso" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <SubscriptionSuccess />
              </ProtectedRoute>
            } />

            <Route path="/assinatura/cancelar" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <SubscriptionCancel />
              </ProtectedRoute>
            } />

            {/* Super Admin Routes */}
            <Route path="/super-admin" element={
              <ProtectedRoute allowedRoles={['super_admin']}>
                <AppLayout><SuperAdminDashboard /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/super-admin/empresas" element={
              <ProtectedRoute allowedRoles={['super_admin']}>
                <AppLayout><SuperAdminCompanies /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/super-admin/planos" element={
              <ProtectedRoute allowedRoles={['super_admin']}>
                <AppLayout><SuperAdminPlans /></AppLayout>
              </ProtectedRoute>
            } />

            {/* Profile Route */}
            <Route path="/perfil" element={
              <ProtectedRoute>
                <AppLayout><Profile /></AppLayout>
              </ProtectedRoute>
            } />
            {/* Public Catalog - No auth required */}
            <Route path="/catalogo/:slug" element={<PublicCatalog />} />
            <Route path="/catalogo/:slug/produto/:productId" element={<PublicProductDetails />} />
            <Route path="/pedido/:token" element={<PublicOrder />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
