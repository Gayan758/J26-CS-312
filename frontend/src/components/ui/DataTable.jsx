import React, { useState, useEffect, useRef } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

export default function DataTable({
  columns = [],
  data = [],
  keyField = "id",
  onRowClick,
  selectedRowKey = null,
  compact = false,
  emptyState = null,
  sortable = true,
  onSortChange,
  className = ""
}) {
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState("asc"); // "asc" | "desc"
  const tableRef = useRef(null);

  const handleHeaderClick = (col) => {
    if (!sortable || !col.sortable) return;
    let nextDir = "asc";
    if (sortField === col.accessor) {
      nextDir = sortDirection === "asc" ? "desc" : "asc";
    }
    setSortField(col.accessor);
    setSortDirection(nextDir);
    if (onSortChange) onSortChange(col.accessor, nextDir);
  };

  const handleKeyDown = (e) => {
    if (!data.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((prev) => {
        const next = prev < data.length - 1 ? prev + 1 : prev;
        return next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((prev) => {
        const next = prev > 0 ? prev - 1 : 0;
        return next;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < data.length && onRowClick) {
        onRowClick(data[focusedIndex]);
      }
    }
  };

  return (
    <div
      ref={tableRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={`w-full overflow-x-auto border border-border rounded-lg bg-surface focus:outline-none focus-visible:ring-1 focus-visible:ring-primary ${className}`}
    >
      <table className="w-full text-left border-collapse text-xs">
        <thead className="bg-surface-muted border-b border-border text-text-subtle font-medium uppercase tracking-wider text-[11px] select-none">
          <tr>
            {columns.map((col, idx) => {
              const isSorted = sortField === col.accessor;
              return (
                <th
                  key={col.accessor || idx}
                  onClick={() => handleHeaderClick(col)}
                  className={`px-3.5 py-2.5 font-medium ${
                    col.sortable ? "cursor-pointer hover:text-text-primary" : ""
                  } ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"} ${col.headerClassName || ""}`}
                >
                  <div className={`inline-flex items-center gap-1.5 ${col.align === "right" ? "justify-end" : ""}`}>
                    <span>{col.header}</span>
                    {col.sortable && (
                      <span className="text-text-subtle">
                        {isSorted ? (
                          sortDirection === "asc" ? (
                            <ChevronUp className="w-3.5 h-3.5 text-primary" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-primary" />
                          )
                        ) : (
                          <ChevronsUpDown className="w-3 h-3 opacity-40 hover:opacity-100" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle text-text-primary">
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="p-8 text-center">
                {emptyState || (
                  <div className="text-text-subtle text-xs py-4">No records found.</div>
                )}
              </td>
            </tr>
          ) : (
            data.map((row, index) => {
              const rowKey = row[keyField] ?? index;
              const isSelected = selectedRowKey === rowKey;
              const isFocused = focusedIndex === index;

              return (
                <tr
                  key={rowKey}
                  onClick={() => {
                    setFocusedIndex(index);
                    if (onRowClick) onRowClick(row);
                  }}
                  className={`transition-colors cursor-pointer select-none ${
                    compact ? "h-10" : "h-12"
                  } ${
                    isSelected
                      ? "bg-primary-subtle font-medium text-text-primary border-l-2 border-l-primary"
                      : isFocused
                      ? "bg-surface-muted border-l-2 border-l-primary"
                      : "hover:bg-surface-muted"
                  }`}
                >
                  {columns.map((col, cIdx) => (
                    <td
                      key={col.accessor || cIdx}
                      className={`px-3.5 py-2 whitespace-nowrap text-xs ${
                        col.isMono ? "font-mono tabular-nums" : ""
                      } ${
                        col.align === "right"
                          ? "text-right"
                          : col.align === "center"
                          ? "text-center"
                          : "text-left"
                      } ${col.cellClassName || ""}`}
                    >
                      {col.render ? col.render(row, index) : row[col.accessor]}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
