import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value: number;
  onChange: (value: number) => void;
  showPrefix?: boolean;
}

/**
 * Formats a number to Brazilian currency format (e.g., 1.234,56)
 */
const formatToBRL = (value: number): string => {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

/**
 * Parses a Brazilian currency string to a number
 */
const parseBRLToNumber = (value: string): number => {
  // Remove everything except digits
  const digits = value.replace(/\D/g, "");
  
  if (!digits) return 0;
  
  // Convert to number (cents) and divide by 100
  return parseInt(digits, 10) / 100;
};

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ className, value, onChange, showPrefix = true, ...props }, ref) => {
    const [displayValue, setDisplayValue] = React.useState<string>(() => 
      formatToBRL(value || 0)
    );

    // Update display when value prop changes externally
    React.useEffect(() => {
      const formatted = formatToBRL(value || 0);
      if (formatted !== displayValue) {
        setDisplayValue(formatted);
      }
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = e.target.value;
      const numericValue = parseBRLToNumber(rawValue);
      
      // Format the value
      const formatted = formatToBRL(numericValue);
      setDisplayValue(formatted);
      
      // Call onChange with the numeric value
      onChange(numericValue);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      // Select all text on focus for easy replacement
      e.target.select();
      props.onFocus?.(e);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Allow: backspace, delete, tab, escape, enter, decimal keys
      const allowedKeys = [
        "Backspace",
        "Delete",
        "Tab",
        "Escape",
        "Enter",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ];

      if (
        allowedKeys.includes(e.key) ||
        // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
        (e.ctrlKey && ["a", "c", "v", "x"].includes(e.key.toLowerCase())) ||
        // Allow digits
        /^\d$/.test(e.key)
      ) {
        return;
      }

      // Prevent all other keys
      e.preventDefault();
    };

    return (
      <div className="relative">
        {showPrefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
            R$
          </span>
        )}
        <Input
          {...props}
          ref={ref}
          type="text"
          inputMode="numeric"
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          className={cn(
            showPrefix && "pl-9",
            "text-right",
            className
          )}
        />
      </div>
    );
  }
);

CurrencyInput.displayName = "CurrencyInput";

export { CurrencyInput, formatToBRL, parseBRLToNumber };
