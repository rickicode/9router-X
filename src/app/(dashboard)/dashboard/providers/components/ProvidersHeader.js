"use client";

import PropTypes from "prop-types";
import { Badge } from "@/shared/components";
import { STATUS_FILTER_OPTIONS } from "../utils";

function ProvidersHeader({ globalSummary, statusFilter, onStatusFilterChange }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-black/[0.04] pb-4 dark:border-white/[0.04]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-muted font-medium mr-1">Network Stats:</span>
        <Badge variant="default" size="sm">
          <span className="font-semibold">{globalSummary.total}</span>
          <span className="ml-1 text-text-muted">Total Accounts</span>
        </Badge>
        <Badge variant="success" size="sm" dot>
          <span className="font-semibold">{globalSummary.connected}</span>
          <span className="ml-1 text-text-muted">Connected</span>
        </Badge>
        {globalSummary.error > 0 && (
          <Badge variant="error" size="sm" dot>
            <span className="font-semibold">{globalSummary.error}</span>
            <span className="ml-1 text-text-muted">Error</span>
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2 self-end sm:self-auto">
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="h-8 rounded-lg border border-black/10 bg-black/[0.02] px-2 text-xs text-text-primary outline-none transition-colors hover:bg-black/5 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/10"
          aria-label="Filter providers by connection status"
        >
          {STATUS_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

ProvidersHeader.propTypes = {
  globalSummary: PropTypes.shape({
    total: PropTypes.number.isRequired,
    connected: PropTypes.number.isRequired,
    error: PropTypes.number.isRequired,
  }).isRequired,
  statusFilter: PropTypes.string.isRequired,
  onStatusFilterChange: PropTypes.func.isRequired,
};

export default ProvidersHeader;
