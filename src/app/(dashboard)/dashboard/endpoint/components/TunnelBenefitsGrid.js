"use client";

import PropTypes from "prop-types";
import { TUNNEL_BENEFITS } from "../endpointConstants";

/**
 * Extracted single component for Cloudflare Tunnel benefits.
 * Rendered once to prevent duplicate benefits grids.
 */
export default function TunnelBenefitsGrid({ className = "" }) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${className}`}>
      {TUNNEL_BENEFITS.map((benefit) => (
        <div
          key={benefit.title}
          className="flex flex-col items-center text-center p-3 rounded-lg bg-surface-2/40 border border-border-subtle"
        >
          <span
            className="material-symbols-outlined text-xl text-brand-700 dark:text-brand-400 mb-1"
            aria-hidden="true"
          >
            {benefit.icon}
          </span>
          <p className="text-xs font-semibold">{benefit.title}</p>
          <p className="text-xs text-text-muted mt-0.5">{benefit.desc}</p>
        </div>
      ))}
    </div>
  );
}

TunnelBenefitsGrid.propTypes = {
  className: PropTypes.string,
};
