import React from 'react';
import { Box, ChevronDown, Minus, Plus, Trash2 } from 'lucide-react';
import { OrderItemForm, ProductAttributeGroup } from '@/pages/OrderForm';
import { ensurePublicStorageUrl } from '@/lib/storage';
import { formatAreaM2, isAreaUnit, M2_ATTRIBUTE_KEYS } from '@/lib/measurements';
import { getProductSaleUnitLabel } from '@/lib/productSaleUnit';

interface EditableOrderItemProps {
  item: OrderItemForm;
  saving: boolean;
  productAttributeGroups: ProductAttributeGroup[];
  tierRangeLabel: string | null;
  onQuantityChange: (productId: string, value: number) => void;
  onM2SubQuantityChange: (productId: string, key: string, value: string) => void;
  onAttributeChange: (productId: string, attributeName: string, value: string) => void;
  onRemove: (productId: string) => void;
  calculateItemTotal: (item: OrderItemForm) => number;
  formatCurrency: (value: number) => string;
}

export const EditableOrderItem: React.FC<EditableOrderItemProps> = ({
  item,
  saving,
  productAttributeGroups,
  tierRangeLabel,
  onQuantityChange,
  onM2SubQuantityChange,
  onAttributeChange,
  onRemove,
  calculateItemTotal,
  formatCurrency,
}) => {
  const isManual = Boolean(item.isManual || item.product.id.startsWith('manual:'));
  const thumbUrl = ensurePublicStorageUrl('product-images', item.product.image_url);
  const unitLabel = getProductSaleUnitLabel(item.product.unit_type, { capitalize: true });

  return (
    <div className={`order-item-card ${isManual ? 'is-manual' : ''}`}>
      <div className="order-item-summary">
        <div className="order-item-thumb">
          {thumbUrl ? <img src={thumbUrl} alt={item.product.name} loading="lazy" /> : <Box className="h-4 w-4" />}
        </div>

        <div className="order-product-details">
          <div className="order-product-title-row">
            <strong>{item.product.name}</strong>
            {isManual ? <span className="order-item-badge order-item-badge-manual">Item avulso</span> : null}
          </div>
          <span className="order-item-subtitle">
            {isManual
              ? 'Item livre informado manualmente'
              : `SKU: ${item.product.sku || '-'} · ${unitLabel}`}
          </span>
          {tierRangeLabel && !isManual ? (
            <div className="order-item-badges">
              <span className="order-item-badge">Faixas: {tierRangeLabel}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="order-item-field">
        <label>Preco</label>
        <div className="price-display">{formatCurrency(item.unit_price)}</div>
      </div>

      <div className="order-item-field">
        <label>Qtd</label>
        {isAreaUnit(item.product.unit) ? (
          <div className="m2-input-group">
            <input
              type="text"
              inputMode="decimal"
              placeholder="Larg. (cm)"
              value={item.attributes[M2_ATTRIBUTE_KEYS.widthCm] ?? ''}
              onChange={(event) =>
                onM2SubQuantityChange(item.product.id, M2_ATTRIBUTE_KEYS.widthCm, event.target.value)
              }
              disabled={saving}
            />
            <span>x</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Alt. (cm)"
              value={item.attributes[M2_ATTRIBUTE_KEYS.heightCm] ?? ''}
              onChange={(event) =>
                onM2SubQuantityChange(item.product.id, M2_ATTRIBUTE_KEYS.heightCm, event.target.value)
              }
              disabled={saving}
            />
            <div className="m2-result">{formatAreaM2(item.quantity || 0)} m2</div>
          </div>
        ) : (
          <div className="order-qty-control">
            <button
              type="button"
              onClick={() => onQuantityChange(item.product.id, -1)}
              disabled={saving || item.quantity <= 1}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <input
              type="number"
              min={1}
              value={item.quantity}
              onChange={(event) => onQuantityChange(item.product.id, parseInt(event.target.value, 10) || 1)}
            />
            <button type="button" onClick={() => onQuantityChange(item.product.id, 1)} disabled={saving}>
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="order-item-field">
        <label>Total</label>
        <div className="price-display">{formatCurrency(calculateItemTotal(item))}</div>
      </div>

      <button
        type="button"
        className="order-delete-btn"
        onClick={() => onRemove(item.product.id)}
        disabled={saving}
        aria-label={`Remover ${item.product.name}`}
      >
        <Trash2 className="h-4 w-4" />
      </button>

      {productAttributeGroups.length > 0 && (
        <div className="order-item-attributes">
          {productAttributeGroups.map((group) => (
            <div key={group.attributeId} className="attribute-group">
              <label>{group.attributeName}</label>
              <div className="order-select-wrap">
                <select
                  value={item.attributes?.[group.attributeName] || group.options[0]?.value || ''}
                  onChange={(event) => onAttributeChange(item.product.id, group.attributeName, event.target.value)}
                  className="order-input order-select"
                >
                  {group.options.map((option) => (
                    <option key={option.id} value={option.value}>
                      {option.value}
                      {option.priceModifier > 0 ? ` (+${formatCurrency(option.priceModifier)})` : ''}
                      {option.priceModifier < 0 ? ` (-${formatCurrency(Math.abs(option.priceModifier))})` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="order-select-icon" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
