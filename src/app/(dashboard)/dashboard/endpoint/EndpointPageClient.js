"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import PropTypes from "prop-types";
import { CardSkeleton } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { useTunnelStatus } from "./hooks/useTunnelStatus";
import EndpointUrlsCard from "./components/EndpointUrlsCard";
import TunnelCard from "./components/TunnelCard";
import TailscaleCard from "./components/TailscaleCard";
import ApiKeysCard from "./components/ApiKeysCard";

const emptySubscribe = () => () => {};

export default function EndpointPageClient({ machineId }) {
 const [keys, setKeys] = useState([]);
 const [loading, setLoading] = useState(true);

 // Settings state
 const [requireApiKey, setRequireApiKey] = useState(false);
 const [requireLogin, setRequireLogin] = useState(true);
 const [hasPassword, setHasPassword] = useState(true);
 const [tunnelDashboardAccess, setTunnelDashboardAccess] = useState(false);

 // Tunnel & Tailscale unified hook
 const { tunnel, tailscale } = useTunnelStatus();

 // Clipboard hook
 const { copied, copy } = useCopyToClipboard();

 // Client hydration check
 const isClient = useSyncExternalStore(
 emptySubscribe,
 () => true,
 () => false
 );

 const isRemoteHost =
 isClient && typeof window !== "undefined"
 ? !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)
 : false;

 const baseUrl =
 isClient && typeof window !== "undefined"
 ? `${window.location.origin}/v1`
 : "/v1";

 // Data loaders
 const fetchData = useCallback(async () => {
 try {
 const res = await fetch("/api/keys");
 if (!res.ok) return;
 const data = await res.json();
 setKeys(data.keys || []);
 } catch (error) {
 console.log("Error fetching data:", error);
 } finally {
 setLoading(false);
 }
 }, []);

 const loadSettings = useCallback(async () => {
 try {
 const settingsRes = await fetch("/api/settings");
 if (settingsRes.ok) {
 const data = await settingsRes.json();
 setRequireApiKey(data.requireApiKey || false);
 setRequireLogin(data.requireLogin !== false);
 setHasPassword(data.hasPassword || false);
 setTunnelDashboardAccess(data.tunnelDashboardAccess || false);
 }
 } catch (error) {
 console.log("Error loading settings:", error);
 }
 }, []);

 useEffect(() => {
 let ignore = false;
 const loadInitialData = async () => {
 await Promise.all([fetchData(), loadSettings()]);
 };
 loadInitialData();
 return () => {
 ignore = true;
 };
 }, [fetchData, loadSettings]);

 const handleTunnelDashboardAccess = async (value) => {
 try {
 const res = await fetch("/api/settings", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ tunnelDashboardAccess: value }),
 });
 if (res.ok) setTunnelDashboardAccess(value);
 } catch (error) {
 console.log("Error updating tunnelDashboardAccess:", error);
 }
 };

 const handleRequireApiKey = async (value) => {
 try {
 const res = await fetch("/api/settings", {
 method: "PATCH",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ requireApiKey: value }),
 });
 if (res.ok) setRequireApiKey(value);
 } catch (error) {
 console.log("Error updating requireApiKey:", error);
 }
 };

 if (loading) {
 return (
 <div className="flex flex-col gap-3">
 <CardSkeleton />
 <CardSkeleton />
 <CardSkeleton />
 <CardSkeleton />
 </div>
 );
 }

 return (
 <div className="flex flex-col gap-3" data-machine-id={machineId}>
 {/* 1. Primary Active Endpoint URLs */}
 <EndpointUrlsCard
 baseUrl={baseUrl}
 tunnel={tunnel}
 tailscale={tailscale}
 copied={copied}
 onCopy={copy}
 />

 {/* 2. Cloudflare Tunnel Management (Progressive Disclosure) */}
 <TunnelCard
 tunnel={tunnel}
 requireApiKey={requireApiKey}
 requireLogin={requireLogin}
 hasPassword={hasPassword}
 tunnelDashboardAccess={tunnelDashboardAccess}
 onUpdateDashboardAccess={handleTunnelDashboardAccess}
 copied={copied}
 onCopy={copy}
 />

 {/* 3. Tailscale Funnel Management (Progressive Disclosure) */}
 <TailscaleCard
 tailscale={tailscale}
 requireLogin={requireLogin}
 hasPassword={hasPassword}
 copied={copied}
 onCopy={copy}
 />

 {/* 4. API Keys Management */}
 <ApiKeysCard
 keys={keys}
 requireApiKey={requireApiKey}
 onToggleRequireApiKey={handleRequireApiKey}
 onKeysChange={fetchData}
 copied={copied}
 onCopy={copy}
 isRemoteHost={isRemoteHost}
 />
 </div>
 );
}

EndpointPageClient.propTypes = {
 machineId: PropTypes.string.isRequired,
};
