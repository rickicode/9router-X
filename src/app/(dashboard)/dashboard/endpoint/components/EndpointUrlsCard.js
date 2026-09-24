"use client";

import PropTypes from "prop-types";
import { Card } from "@/shared/components";
import EndpointRow from "./EndpointRow";

export default function EndpointUrlsCard({
  baseUrl,
  gatewayUrl,
  copied,
  onCopy,
}) {
  const statusChip = (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs px-2 py-1 rounded-sm font-medium border flex items-center gap-1.5 bg-success/10 text-success border-success/30">
        <span className="relative flex size-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-sm bg-success opacity-75" />
          <span className="relative inline-flex rounded-full size-2 bg-success" />
        </span>
        ACTIVE
      </span>
    </div>
  );

  return (
    <Card
      title="API Endpoints"
      subtitle="OpenAI-compatible base URLs for local and remote clients"
      icon="api"
      action={statusChip}
    >
      <div className="flex flex-col gap-3">
        {gatewayUrl && (
          <EndpointRow
            label="Gateway"
            url={gatewayUrl}
            copyId="gateway_url"
            copied={copied}
            onCopy={onCopy}
            badge
          />
        )}
        <EndpointRow
          label="Direct"
          url={baseUrl}
          copyId="local_url"
          copied={copied}
          onCopy={onCopy}
        />
      </div>
    </Card>
  );
}

EndpointUrlsCard.propTypes = {
  baseUrl: PropTypes.string.isRequired,
  gatewayUrl: PropTypes.string,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
};
