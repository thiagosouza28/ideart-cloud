import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { CompanyThemeProvider } from "@/contexts/CompanyThemeContext";
import { CookieConsent } from "@/components/CookieConsent";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { ThemeProvider } from "next-themes";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { SUPER_ADMIN_HOME_PATH } from "@/lib/access-control";

const Auth = lazy(() => import("./pages/Auth"));
const ChangePassword = lazy(() => import("./pages/ChangePassword"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Products = lazy(() => import("./pages/Products"));
const ProductForm = lazy(() => import("./pages/ProductForm"));
const PriceSimulator = lazy(() => import("./pages/PriceSimulator"));
const ProductLabels = lazy(() => import("./pages/ProductLabels"));
const Customers = lazy(() => import("./pages/Customers"));
const CustomerForm = lazy(() => import("./pages/CustomerForm"));
const CustomerHistory = lazy(() => import("./pages/CustomerHistory"));
const CustomerBirthdays = lazy(() => import("./pages/CustomerBirthdays"));
const Orders = lazy(() => import("./pages/Orders"));
const OrdersKanban = lazy(() => import("./pages/OrdersKanban"));
const OrderForm = lazy(() => import("./pages/OrderForm"));
const OrderDetails = lazy(() => import("./pages/OrderDetails"));
const Production = lazy(() => import("./pages/Production"));
const Stock = lazy(() => import("./pages/Stock"));
const Supplies = lazy(() => import("./pages/Supplies"));
const Categories = lazy(() => import("./pages/Categories"));
const Attributes = lazy(() => import("./pages/Attributes"));
const GraphPOSPDV = lazy(() => import("./pages/GraphPOSPDV"));
const GraphPOSPagamento = lazy(() => import("./pages/GraphPOSPagamento"));
const GraphPOSConfirmacao = lazy(() => import("./pages/GraphPOSConfirmacao"));
const Settings = lazy(() => import("./pages/Settings"));
const PaymentSettings = lazy(() => import("./pages/PaymentSettings"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const PublicCatalog = lazy(() => import("./pages/PublicCatalog"));
const PublicStoreExplorer = lazy(() => import("./pages/PublicStoreExplorer"));
const PublicProductDetails = lazy(() => import("./pages/PublicProductDetails"));
const PublicCart = lazy(() => import("./pages/PublicCart"));
const PublicCustomerLogin = lazy(() => import("./pages/PublicCustomerLogin"));
const PublicCustomerChangePassword = lazy(() => import("./pages/PublicCustomerChangePassword"));
const PublicCustomerOrders = lazy(() => import("./pages/PublicCustomerOrders"));
const PublicCustomerProfile = lazy(() => import("./pages/PublicCustomerProfile"));
const PublicCustomerOrderDetails = lazy(() => import("./pages/PublicCustomerOrderDetails"));
const PublicOrder = lazy(() => import("./pages/PublicOrder"));
const SystemStorageFile = lazy(() => import("./pages/SystemStorageFile"));
const Subscription = lazy(() => import("./pages/Subscription"));
const SubscriptionSuccess = lazy(() => import("./pages/SubscriptionSuccess"));
const SubscriptionCancel = lazy(() => import("./pages/SubscriptionCancel"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const NotFound = lazy(() => import("./pages/NotFound"));
const SuperAdminCompanies = lazy(() => import("./pages/SuperAdminCompanies"));
const SuperAdminPlans = lazy(() => import("./pages/SuperAdminPlans"));
const SuperAdminDashboard = lazy(() => import("./pages/SuperAdminDashboard"));
const SuperAdminImpersonate = lazy(() => import("./pages/SuperAdminImpersonate"));
const Profile = lazy(() => import("./pages/Profile"));
const Reports = lazy(() => import("./pages/Reports"));
const CashFlow = lazy(() => import("./pages/CashFlow"));
const Expenses = lazy(() => import("./pages/Expenses"));
const Receipts = lazy(() => import("./pages/Receipts"));
const BannerManagement = lazy(() => import("./pages/BannerManagement"));
const CatalogManager = lazy(() => import("./pages/CatalogManager"));
const Landing = lazy(() => import("./pages/Landing"));
const Contact = lazy(() => import("./pages/Contact"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Compliance = lazy(() => import("./pages/Compliance"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

const PageFallback = () => (
  <div className="page-container flex items-center justify-center min-h-[400px]">
    <span className="text-sm text-muted-foreground">Carregando...</span>
  </div>
);

const withSuspense = (element: JSX.Element) => (
  <Suspense fallback={<PageFallback />}>{element}</Suspense>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <TooltipProvider>
        <ConfirmProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthProvider>
              <CompanyThemeProvider>
                <CookieConsent />
                <Routes>
              <Route path="/auth" element={withSuspense(<Auth />)} />
              <Route path="/alterar-senha" element={withSuspense(<ChangePassword />)} />
              <Route path="/recuperar-senha" element={withSuspense(<ForgotPassword />)} />
              <Route
                path="/onboarding"
                element={(
                  <ProtectedRoute>
                    {withSuspense(<Onboarding />)}
                  </ProtectedRoute>
                )}
              />
              <Route path="/" element={withSuspense(<Landing />)} />
              <Route path="/contato" element={withSuspense(<Contact />)} />
              <Route path="/suporte" element={withSuspense(<Contact />)} />
              <Route path="/termos" element={withSuspense(<Terms />)} />
              <Route path="/privacidade" element={withSuspense(<Privacy />)} />
              <Route path="/compliance" element={withSuspense(<Compliance />)} />

              <Route
                path="/dashboard"
                element={(
                  <ProtectedRoute moduleKey="dashboard">
                    <AppLayout>{withSuspense(<Dashboard />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/pdv"
                element={(
                  <ProtectedRoute allowedRoles={["admin", "caixa"]} moduleKey="pdv">
                    <AppLayout>{withSuspense(<GraphPOSPDV />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/pagamento"
                element={(
                  <ProtectedRoute allowedRoles={["admin", "caixa"]} moduleKey="pdv">
                    <AppLayout>{withSuspense(<GraphPOSPagamento />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/confirmacao"
                element={(
                  <ProtectedRoute allowedRoles={["admin", "caixa"]} moduleKey="pdv">
                    <AppLayout>{withSuspense(<GraphPOSConfirmacao />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/pedidos"
                element={(
                  <ProtectedRoute allowedRoles={["admin", "atendente", "caixa"]} moduleKey="pedidos">
                    <AppLayout>{withSuspense(<Orders />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/pedidos/kanban"
                element={(
                  <ProtectedRoute allowedRoles={["admin", "atendente", "caixa", "producao"]} moduleKey="kanban_pedidos">
                    <AppLayout>{withSuspense(<OrdersKanban />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/pedidos/novo"
                element={(
                  <ProtectedRoute allowedRoles={["admin", "atendente", "caixa"]} moduleKey="pedidos">
                    <AppLayout>{withSuspense(<OrderForm />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/pedidos/:id"
                element={(
                  <ProtectedRoute allowedRoles={["admin", "atendente", "caixa", "producao"]} moduleKey="pedidos">
                    <AppLayout>{withSuspense(<OrderDetails />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/producao"
                element={(
                  <ProtectedRoute allowedRoles={["admin", "producao"]} moduleKey="producao">
                    <AppLayout>{withSuspense(<Production />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/produtos"
                element={(
                  <ProtectedRoute allowedRoles={["admin", "atendente"]} moduleKey="produtos">
                    <AppLayout>{withSuspense(<Products />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/produtos/etiquetas"
                element={(
                  <ProtectedRoute allowedRoles={["admin", "atendente"]} moduleKey="etiquetas">
                    <AppLayout>{withSuspense(<ProductLabels />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/produtos/novo"
                element={(
                  <ProtectedRoute allowedRoles={["admin", "atendente"]} moduleKey="produtos">
                    <AppLayout>{withSuspense(<ProductForm />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/produtos/:id"
                element={(
                  <ProtectedRoute allowedRoles={["admin", "atendente"]} moduleKey="produtos">
                    <AppLayout>{withSuspense(<ProductForm />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/produtos/simulador-preco"
                element={(
                  <ProtectedRoute allowedRoles={["admin", "atendente"]} moduleKey="produtos">
                    <AppLayout>{withSuspense(<PriceSimulator />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/catalogo-admin"
                element={<Navigate to="/catalogo/configuracoes" replace />}
              />

              <Route
                path="/catalogo/configuracoes"
                element={(
                  <ProtectedRoute allowedRoles={["admin"]} moduleKey="catalogo">
                    <AppLayout>{withSuspense(<CatalogManager />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/insumos"
                element={(
                  <ProtectedRoute allowedRoles={["admin", "atendente"]} moduleKey="insumos">
                    <AppLayout>{withSuspense(<Supplies />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/categorias"
                element={(
                  <ProtectedRoute allowedRoles={["admin", "atendente"]} moduleKey="categorias">
                    <AppLayout>{withSuspense(<Categories />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/atributos"
                element={(
                  <ProtectedRoute allowedRoles={["admin", "atendente"]} moduleKey="atributos">
                    <AppLayout>{withSuspense(<Attributes />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/estoque"
                element={(
                  <ProtectedRoute allowedRoles={["admin", "atendente"]} moduleKey="estoque">
                    <AppLayout>{withSuspense(<Stock />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/clientes"
                element={(
                  <ProtectedRoute allowedRoles={["admin", "atendente"]} moduleKey="clientes">
                    <AppLayout>{withSuspense(<Customers />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/clientes/aniversariantes"
                element={(
                  <ProtectedRoute allowedRoles={["admin", "atendente"]} moduleKey="aniversariantes">
                    <AppLayout>{withSuspense(<CustomerBirthdays />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/clientes/novo"
                element={(
                  <ProtectedRoute allowedRoles={["admin", "atendente"]} moduleKey="clientes">
                    <AppLayout>{withSuspense(<CustomerForm />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/clientes/:id"
                element={(
                  <ProtectedRoute allowedRoles={["admin", "atendente"]} moduleKey="clientes">
                    <AppLayout>{withSuspense(<CustomerForm />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/clientes/:id/historico"
                element={(
                  <ProtectedRoute allowedRoles={["admin", "atendente"]} moduleKey="clientes">
                    <AppLayout>{withSuspense(<CustomerHistory />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/relatorios"
                element={(
                  <ProtectedRoute allowedRoles={["admin", "financeiro", "atendente", "producao"]} moduleKey="relatorios">
                    <AppLayout>{withSuspense(<Reports />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/financeiro/fluxo-caixa"
                element={(
                  <ProtectedRoute allowedRoles={["admin", "financeiro", "atendente", "producao"]} moduleKey="fluxo_caixa">
                    <AppLayout>{withSuspense(<CashFlow />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/financeiro/despesas"
                element={(
                  <ProtectedRoute allowedRoles={["admin", "financeiro"]} moduleKey="fluxo_caixa">
                    <AppLayout>{withSuspense(<Expenses />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/financeiro/relatorios"
                element={(
                  <ProtectedRoute allowedRoles={["admin", "financeiro", "atendente", "producao"]} moduleKey="relatorios">
                    <AppLayout>{withSuspense(<Reports />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/comprovantes"
                element={(
                  <ProtectedRoute allowedRoles={["admin", "atendente", "caixa"]} moduleKey="comprovantes">
                    <AppLayout>{withSuspense(<Receipts />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/usuarios"
                element={(
                  <ProtectedRoute allowedRoles={["admin", "super_admin"]} moduleKey="usuarios">
                    <AppLayout>{withSuspense(<UserManagement />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/banners"
                element={(
                  <ProtectedRoute allowedRoles={["admin"]} moduleKey="banners">
                    <AppLayout>{withSuspense(<BannerManagement />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/empresas"
                element={(
                  <ProtectedRoute allowedRoles={["admin"]} moduleKey="configuracoes">
                    <Navigate to="/configuracoes/empresa" replace />
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/empresas/nova"
                element={(
                  <ProtectedRoute allowedRoles={["admin"]} moduleKey="configuracoes">
                    <Navigate to="/configuracoes/empresa" replace />
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/empresas/:id/editar"
                element={(
                  <ProtectedRoute allowedRoles={["admin"]} moduleKey="configuracoes">
                    <Navigate to="/configuracoes/empresa" replace />
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/configuracoes"
                element={<Navigate to="/configuracoes/empresa" replace />}
              />

              <Route
                path="/configuracoes/empresa"
                element={(
                  <ProtectedRoute allowedRoles={["admin"]} moduleKey="configuracoes">
                    <AppLayout>{withSuspense(<Settings />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/configuracoes/tema"
                element={(
                  <ProtectedRoute allowedRoles={["admin"]} moduleKey="configuracoes">
                    <AppLayout>{withSuspense(<Settings />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/configuracoes/pagamentos"
                element={(
                  <ProtectedRoute allowedRoles={["admin"]} moduleKey="pagamentos_pix">
                    <AppLayout>{withSuspense(<PaymentSettings />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/configuracoes/pagamentos/pix"
                element={(
                  <ProtectedRoute allowedRoles={["admin"]} moduleKey="pagamentos_pix">
                    <AppLayout>{withSuspense(<PaymentSettings />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/assinatura"
                element={(
                  <ProtectedRoute moduleKey="assinatura">
                    {withSuspense(<Subscription />)}
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/assinatura/sucesso"
                element={(
                  <ProtectedRoute allowedRoles={["admin"]} moduleKey="assinatura">
                    {withSuspense(<SubscriptionSuccess />)}
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/assinatura/cancelar"
                element={(
                  <ProtectedRoute allowedRoles={["admin"]} moduleKey="assinatura">
                    {withSuspense(<SubscriptionCancel />)}
                  </ProtectedRoute>
                )}
              />

              {/* Super Admin Routes */}
              <Route
                path="/super-admin"
                element={(
                  <ProtectedRoute allowedRoles={["super_admin"]}>
                    <AppLayout>{withSuspense(<SuperAdminDashboard />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/super-admin/empresas"
                element={(
                  <ProtectedRoute allowedRoles={["super_admin"]}>
                    <AppLayout>{withSuspense(<SuperAdminCompanies />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/super-admin/planos"
                element={(
                  <ProtectedRoute allowedRoles={["super_admin"]}>
                    <AppLayout>{withSuspense(<SuperAdminPlans />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/super-admin/entrar-como-cliente"
                element={(
                  <ProtectedRoute allowedRoles={["super_admin"]}>
                    <AppLayout>{withSuspense(<SuperAdminImpersonate />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              <Route
                path="/admin/entrar-como-cliente"
                element={(
                  <ProtectedRoute allowedRoles={["super_admin"]}>
                    <AppLayout>{withSuspense(<SuperAdminImpersonate />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              {/* Profile Route */}
              <Route
                path="/perfil"
                element={(
                  <ProtectedRoute>
                    <AppLayout>{withSuspense(<Profile />)}</AppLayout>
                  </ProtectedRoute>
                )}
              />

              {/* Public Catalog - No auth required */}
              <Route path="/catalogo" element={withSuspense(<PublicStoreExplorer />)} />
              <Route path="/catalogo/:slug" element={withSuspense(<PublicCatalog />)} />
              <Route path="/loja/:companyId" element={withSuspense(<PublicCatalog />)} />
              <Route path="/catalogo/:slug/produto/:productSlug" element={withSuspense(<PublicProductDetails />)} />
              <Route path="/catalogo/produto/:productSlug" element={withSuspense(<PublicProductDetails />)} />
              <Route path="/catalogo/:slug/carrinho" element={withSuspense(<PublicCart />)} />
              <Route path="/catalogo/carrinho/:companyId" element={withSuspense(<PublicCart />)} />
              <Route path="/minha-conta/login" element={withSuspense(<PublicCustomerLogin />)} />
              <Route path="/minha-conta/alterar-senha" element={withSuspense(<PublicCustomerChangePassword />)} />
              <Route path="/minha-conta/perfil" element={withSuspense(<PublicCustomerProfile />)} />
              <Route path="/minha-conta/pedidos" element={withSuspense(<PublicCustomerOrders />)} />
              <Route path="/minha-conta/pedidos/:orderId" element={withSuspense(<PublicCustomerOrderDetails />)} />
              <Route path="/pedido/:token" element={withSuspense(<PublicOrder />)} />
              <Route path="/arquivo" element={withSuspense(<SystemStorageFile />)} />

              <Route path="*" element={withSuspense(<NotFound />)} />
                </Routes>
              </CompanyThemeProvider>
            </AuthProvider>
          </BrowserRouter>
        </ConfirmProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
