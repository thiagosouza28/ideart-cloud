import * as React from "react";

import { cn } from "@/lib/utils";

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => {
    const tableRef = React.useRef<HTMLTableElement | null>(null);

    const setTableRef = React.useCallback(
      (node: HTMLTableElement | null) => {
        tableRef.current = node;

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

    const syncMobileLabels = React.useCallback(() => {
      const table = tableRef.current;
      if (!table) return;

      const headerCells = Array.from(table.querySelectorAll("thead tr:first-child th"));
      if (headerCells.length === 0) return;

      const headers = headerCells.map((cell) => cell.textContent?.replace(/\s+/g, " ").trim() ?? "");
      const rows = Array.from(table.querySelectorAll("tbody tr"));

      rows.forEach((row) => {
        let columnIndex = 0;

        Array.from(row.cells).forEach((cell) => {
          const span = Math.max(cell.colSpan || 1, 1);

          if (cell.tagName.toLowerCase() !== "td") {
            columnIndex += span;
            return;
          }

          const tableCell = cell as HTMLTableCellElement;
          if (tableCell.dataset.labelExplicit === "true") {
            columnIndex += span;
            return;
          }

          const headerLabel = headers[columnIndex] ?? "";
          if (headerLabel) {
            tableCell.setAttribute("data-label", headerLabel);
          } else {
            tableCell.removeAttribute("data-label");
          }

          columnIndex += span;
        });
      });
    }, []);

    React.useEffect(() => {
      syncMobileLabels();

      const table = tableRef.current;
      if (!table) return;

      const observer = new MutationObserver(syncMobileLabels);
      observer.observe(table, { childList: true, subtree: true, characterData: true });
      return () => observer.disconnect();
    }, [syncMobileLabels]);

    return (
      <div className="relative w-full overflow-x-auto">
        <table ref={setTableRef} className={cn("table-stack w-full caption-bottom text-sm", className)} {...props} />
      </div>
    );
  },
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />,
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
  ),
);
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot ref={ref} className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)} {...props} />
  ),
);
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn("border-b transition-colors data-[state=selected]:bg-muted hover:bg-muted/50", className)}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => {
    const dataLabel =
      (props as { "data-label"?: string })["data-label"] ??
      (props as { "aria-label"?: string })["aria-label"];
    const hasExplicitDataLabel = dataLabel !== undefined && dataLabel !== null;

    return (
      <td
        ref={ref}
        data-label={dataLabel}
        data-label-explicit={hasExplicitDataLabel ? "true" : undefined}
        className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)}
        {...props}
      />
    );
  },
);
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
  ),
);
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
