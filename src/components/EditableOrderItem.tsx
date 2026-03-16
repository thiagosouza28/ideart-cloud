import React from 'react';
import { Trash2, ChevronDown, Minus, Plus } from 'lucide-react';
import { OrderItemForm, ProductAttributeGroup } from '@/pages/OrderForm';
import { isAreaUnit, M2_ATTRIBUTE_KEYS, formatAreaM2, getProductSaleUnitPriceSuffix } from '@/lib/measurements';

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

export const EditableOrderItem: React.FC<EditableOrderItemProps> = ({ item, saving, productAttributeGroups, tierRangeLabel, onQuantityChange, onM2SubQuantityChange, onAttributeChange, onRemove, calculateItemTotal, formatCurrency }) => {
  return (
    <div className="order-item-card">
      <div className="order-item-card-main">
        <div className="order-product-details">
          <strong>{item.product.name}</strong>
          <span>{item.product.sku || 'Sem SKU'}</span>
        </div>
        <div className="order-item-fields">
          <div className="order-item-field">
            <label>Qtd</label>
            {isAreaUnit(item.product.unit) ? (
              <div className="m2-input-group">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Larg. (cm)"
                  value={item.attributes[M2_ATTRIBUTE_KEYS.widthCm] ?? ''}
                  onChange={(e) => onM2SubQuantityChange(item.product.id, M2_ATTRIBUTE_KEYS.widthCm, e.target.value)}
                  disabled={saving}
                />
                <span>x</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Alt. (cm)"
                  value={item.attributes[M2_ATTRIBUTE_KEYS.heightCm] ?? ''}
                  onChange={(e) => onM2SubQuantityChange(item.product.id, M2_ATTRIBUTE_KEYS.heightCm, e.target.value)}
                  disabled={saving}
                />
                <div className="m2-result">{formatAreaM2(item.quantity || 0)} m²</div>
              </div>
            ) : (
              <div className="order-qty-control">
                <button type="button" onClick={() => onQuantityChange(item.product.id, -1)} disabled={saving || item.quantity <= 1}>
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => onQuantityChange(item.product.id, parseInt(e.target.value) || 1)}
                />
                <button type="button" onClick={() => onQuantityChange(item.product.id, 1)} disabled={saving}>
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
          <div className="order-item-field">
            <label>Preço Unit.</label>
            <div className="price-display">{formatCurrency(item.unit_price)}</div>
          </div>
          <div className="order-item-field">
            <label>Total</label>
            <div className="price-display">{formatCurrency(calculateItemTotal(item))}</div>
          </div>
        </div>
        <button type="button" className="order-delete-btn" onClick={() => onRemove(item.product.id)} disabled={saving}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {tierRangeLabel && <div className="tier-range-label">Faixas: {tierRangeLabel}</div>}
      {productAttributeGroups.length > 0 && (
        <div className="order-item-attributes">
          {productAttributeGroups.map((group) => (
            <div key={group.attributeId} className="attribute-group">
              <label>{group.attributeName}</label>
              <div className="order-select-wrap">
                <select
                  value={item.attributes?.[group.attributeName] || group.options[0]?.value || ''}
                  onChange={(e) => onAttributeChange(item.product.id, group.attributeName, e.target.value)}
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