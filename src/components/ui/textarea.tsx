import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  autoResize?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, autoResize = true, onChange, rows = 1, ...props }, ref) => {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

    const setRefs = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        innerRef.current = node;

        if (typeof ref === "function") {
          ref(node);
          return;
        }

        if (ref) {
          ref.current = node;
        }
      },
      [ref],
    );

    const syncHeight = React.useCallback(() => {
      if (!autoResize) return;

      const node = innerRef.current;
      if (!node) return;

      node.style.height = "auto";
      node.style.height = `${node.scrollHeight}px`;
    }, [autoResize]);

    React.useLayoutEffect(() => {
      syncHeight();
    }, [props.defaultValue, props.value, rows, syncHeight]);

    const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (autoResize) {
        event.currentTarget.style.height = "auto";
        event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
      }

      onChange?.(event);
    };

    return (
      <textarea
        className={cn(
          "flex w-full rounded-[var(--app-control-radius)] border border-input bg-background px-[var(--app-control-padding-x)] py-[var(--app-control-padding-y)] text-base ring-offset-background placeholder:text-muted-foreground transition-[height,border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          autoResize && "resize-none overflow-hidden",
          className,
        )}
        onChange={handleChange}
        ref={setRefs}
        rows={rows}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
