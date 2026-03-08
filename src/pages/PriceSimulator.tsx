import { useMemo, useState } from 'react';
import { ArrowRight, Calculator, Percent, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { buildPriceSimulation, calculatePriceByMultiplier } from '@/lib/pricing';

const currency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

export default function PriceSimulator() {
  const navigate = useNavigate();
  const [cost, setCost] = useState(0);
  const [expensePercentage, setExpensePercentage] = useState(0);
  const [desiredMargin, setDesiredMargin] = useState(30);
  const [manualMarkup, setManualMarkup] = useState(0);
  const [multiplier, setMultiplier] = useState(2);

  const simulation = useMemo(
    () =>
      buildPriceSimulation({
        cost,
        expensePercentage,
        desiredMarginPercentage: desiredMargin,
        manualMarkup: manualMarkup > 0 ? manualMarkup : null,
      }),
    [cost, desiredMargin, expensePercentage, manualMarkup],
  );

  const multiplierPrice = useMemo(
    () => calculatePriceByMultiplier(cost, multiplier),
    [cost, multiplier],
  );

  return (
    <div className="page-container space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Simulador de Preço</h1>
          <p className="text-muted-foreground">
            Teste cenários de custo, despesas, margem e markup antes de salvar no produto.
          </p>
        </div>
        <Button
          onClick={() =>
            navigate(
              `/produtos/novo?baseCost=${encodeURIComponent(String(cost))}&expensePercentage=${encodeURIComponent(
                String(expensePercentage),
              )}&profitMargin=${encodeURIComponent(String(desiredMargin))}&finalPrice=${encodeURIComponent(
                String(simulation.suggestedPrice),
              )}`,
            )
          }
        >
          Usar no cadastro do produto
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Entradas da simulação
            </CardTitle>
            <CardDescription>
              Informe o custo base, o peso das despesas e a margem desejada.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="simulator-cost">Custo</Label>
              <Input
                id="simulator-cost"
                type="number"
                min="0"
                step="0.01"
                value={cost}
                onChange={(event) => setCost(Number(event.target.value || 0))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="simulator-expense-percentage">Despesas (%)</Label>
              <Input
                id="simulator-expense-percentage"
                type="number"
                min="0"
                step="0.01"
                value={expensePercentage}
                onChange={(event) => setExpensePercentage(Number(event.target.value || 0))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="simulator-margin">Margem desejada (%)</Label>
              <Input
                id="simulator-margin"
                type="number"
                min="0"
                step="0.01"
                value={desiredMargin}
                onChange={(event) => setDesiredMargin(Number(event.target.value || 0))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="simulator-markup">Markup manual opcional</Label>
              <Input
                id="simulator-markup"
                type="number"
                min="0"
                step="0.01"
                value={manualMarkup}
                onChange={(event) => setManualMarkup(Number(event.target.value || 0))}
                placeholder={`Sugerido: ${simulation.markupSuggested.toFixed(2)}`}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="simulator-multiplier">Cenário por multiplicador</Label>
              <Input
                id="simulator-multiplier"
                type="number"
                min="0"
                step="0.01"
                value={multiplier}
                onChange={(event) => setMultiplier(Number(event.target.value || 0))}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Resultado
            </CardTitle>
            <CardDescription>
              O markup sugerido considera despesas percentuais e margem desejada.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border bg-muted/20 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Markup sugerido</p>
                <p className="mt-2 text-2xl font-semibold">{simulation.markupSuggested.toFixed(2)}x</p>
              </div>
              <div className="rounded-lg border bg-muted/20 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Markup aplicado</p>
                <p className="mt-2 text-2xl font-semibold">{simulation.appliedMarkup.toFixed(2)}x</p>
              </div>
              <div className="rounded-lg border bg-muted/20 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Preço sugerido</p>
                <p className="mt-2 text-2xl font-semibold">{currency(simulation.suggestedPrice)}</p>
              </div>
              <div className="rounded-lg border bg-muted/20 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Lucro estimado</p>
                <p className="mt-2 text-2xl font-semibold">{currency(simulation.estimatedProfit)}</p>
              </div>
            </div>

            <div className="rounded-lg border bg-background p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Percent className="h-4 w-4" />
                Margem real
              </div>
              <p className="mt-2 text-xl font-semibold">{simulation.realMargin.toFixed(2)}%</p>
            </div>

            <div className="rounded-lg border border-dashed bg-muted/10 p-4">
              <p className="text-sm font-medium text-foreground">Cenário por multiplicador</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {multiplier.toFixed(2)}x sobre o custo gera {currency(multiplierPrice)}.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
