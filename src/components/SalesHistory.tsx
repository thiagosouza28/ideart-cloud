import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Receipt, Eye, Calendar, CreditCard, Banknote, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { PaymentMethod, Company } from '@/types/database';
import SaleReceipt from './SaleReceipt';

interface SaleItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount: number;
  total: number;
}

interface Sale {
  id: string;
  subtotal: number;
  discount: number;
  total: number;
  payment_method: PaymentMethod;
  amount_paid: number;
  change_amount: number;
  created_at: string;
}

interface SalesHistoryProps {
  company: Company | null;
}

const paymentIcons = {
  dinheiro: Banknote,
  cartao: CreditCard,
  pix: Smartphone
};

const paymentLabels = {
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  pix: 'PIX'
};

export default function SalesHistory({ company }: SalesHistoryProps) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReceipt, setShowReceipt] = useState(false);

  useEffect(() => {
    fetchSales();
  }, []);

  const fetchSales = async () => {
    setLoading(true);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { data } = await supabase
      .from('sales')
      .select('*')
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false });
    
    setSales((data as Sale[]) || []);
    setLoading(false);
  };

  const viewSaleDetails = async (sale: Sale) => {
    setSelectedSale(sale);
    const { data } = await supabase
      .from('sale_items')
      .select('*')
      .eq('sale_id', sale.id);
    
    setSaleItems((data as SaleItem[]) || []);
    setShowReceipt(true);
  };

  const formatCurrency = (v: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const totalToday = sales.reduce((acc, s) => acc + Number(s.total), 0);

  return (
    <>
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Vendas de Hoje
            </div>
            <Badge variant="secondary" className="text-sm">
              {formatCurrency(totalToday)}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0">
          <ScrollArea className="h-full max-h-[300px] px-4 pb-4">
            {loading ? (
              <p className="text-center text-muted-foreground py-4">Carregando...</p>
            ) : sales.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">Nenhuma venda hoje</p>
            ) : (
              <div className="space-y-2">
                {sales.map((sale) => {
                  const PaymentIcon = paymentIcons[sale.payment_method];
                  return (
                    <div
                      key={sale.id}
                      className="flex items-center justify-between p-3 bg-muted rounded-lg hover:bg-muted/80 transition-colors cursor-pointer"
                      onClick={() => viewSaleDetails(sale)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10">
                          <PaymentIcon className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">
                            {formatCurrency(Number(sale.total))}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(sale.created_at), "HH:mm", { locale: ptBR })}
                            <span className="mx-1">•</span>
                            {paymentLabels[sale.payment_method]}
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={showReceipt} onOpenChange={setShowReceipt}>
        <DialogContent aria-describedby={undefined} className="max-w-3xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da Venda</DialogTitle>
          </DialogHeader>
          {selectedSale && (
            <SaleReceipt
              saleId={selectedSale.id}
              items={saleItems.map(item => ({
                name: item.product_name,
                quantity: item.quantity,
                unitPrice: Number(item.unit_price)
              }))}
              subtotal={Number(selectedSale.subtotal)}
              discount={Number(selectedSale.discount)}
              total={Number(selectedSale.total)}
              paymentMethod={selectedSale.payment_method}
              amountPaid={Number(selectedSale.amount_paid)}
              change={Number(selectedSale.change_amount)}
              company={company}
              createdAt={new Date(selectedSale.created_at)}
            />
          )}
          <div className="flex justify-end">
            <Button onClick={() => setShowReceipt(false)}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}


