"use client";

import PropTypes from "prop-types";
import dynamic from "next/dynamic";
import { Button } from "@/shared/components";
import { ProviderCard, ApiKeyProviderCard } from "./BaseProviderCard";

const ModelAvailabilityBadge = dynamic(
  () => import("./ModelAvailabilityBadge"),
  { ssr: false, loading: () => null },
);

const APIKEY_INITIAL_VISIBLE = 20;
// ── Section helpers ──────────────────────────────────────────────

function SectionHeader({ title, rightContent }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="text-lg sm:text-xl font-semibold flex items-center gap-2 leading-tight">{title}</h2>
      {rightContent}
    </div>
  );
}

const gridCls = "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4";

// ── ProvidersGrid ────────────────────────────────────────────────

function ProvidersGrid({
  oauthEntries, freeEntries, freeTierEntries, apikeyEntries,
  showAllApikey, onShowAllApikey, isFiltering,
  getProviderStats, dualAuthTypes, testingMode, onBatchTest,
  onToggleProvider, togglePendingId, compatibleProviders, anthropicCompatibleProviders,
  onAddOpenAI, onAddAnthropic,
}) {
  const visibleApikeyEntries = isFiltering || showAllApikey
    ? apikeyEntries
    : apikeyEntries.slice(0, APIKEY_INITIAL_VISIBLE);
  const hiddenApikeyCount = apikeyEntries.length - APIKEY_INITIAL_VISIBLE;

  return (
    <>
      {/* Custom Providers (OpenAI/Anthropic Compatible) */}
      <div className="flex flex-col gap-4">
        <SectionHeader
          title={<>Custom Providers (OpenAI/Anthropic Compatible) </>}
          rightContent={
            <div className="grid grid-cols-1 gap-2 sm:flex sm:w-auto">
              <Button size="sm" icon="add" onClick={onAddAnthropic} className="w-full sm:w-auto">
                Add Anthropic Compatible
              </Button>
              <Button size="sm" variant="secondary" icon="add" onClick={onAddOpenAI} className="w-full !bg-white !text-black hover:!bg-gray-100 sm:w-auto">
                Add OpenAI Compatible
              </Button>
            </div>
          }
        />
        {compatibleProviders.length === 0 && anthropicCompatibleProviders.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-2 border border-dashed border-border rounded-xl text-text-muted text-sm">
            <span className="material-symbols-outlined text-[18px]">extension</span>
            <span>No custom providers — use buttons above to add OpenAI/Anthropic compatible endpoints</span>
          </div>
        ) : (
          <div className={gridCls}>
            {[...compatibleProviders, ...anthropicCompatibleProviders].map((info) => (
              <ApiKeyProviderCard
                key={info.id}
                providerId={info.id}
                provider={info}
                stats={getProviderStats(info.id, "apikey")}
                authType="compatible"
                toggleDisabled={togglePendingId === info.id}
                onToggle={(active) => onToggleProvider(info.id, "apikey", active, info.name)}
              />
            ))}
          </div>
        )}
      </div>

      {/* OAuth Providers */}
      {oauthEntries.length > 0 && (
        <div className="flex flex-col gap-4">
          <SectionHeader
            title="OAuth Providers"
            rightContent={
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <ModelAvailabilityBadge />
                <TestAllButton mode="oauth" testingMode={testingMode} onBatchTest={onBatchTest} />
              </div>
            }
          />
          <div className={gridCls}>
            {oauthEntries.map(([key, info]) => {
              const authTypes = dualAuthTypes(info, key);
              return (
                <ProviderCard
                  key={key}
                  providerId={key}
                  provider={info}
                  stats={getProviderStats(key, authTypes)}
                  authType="oauth"
                  toggleDisabled={togglePendingId === key}
                  onToggle={(active) => onToggleProvider(key, authTypes, active, info.name)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Free Tier Providers */}
      {(freeEntries.length > 0 || freeTierEntries.length > 0) && (
        <div className="flex flex-col gap-4">
          <SectionHeader
            title="Free Tier Providers"
            rightContent={<TestAllButton mode="free" testingMode={testingMode} onBatchTest={onBatchTest} />}
          />
          <div className={gridCls}>
            {freeEntries.map(([key, info]) => {
              const freeAuthTypes = dualAuthTypes(info, key);
              return (
                <ProviderCard
                  key={key}
                  providerId={key}
                  provider={info}
                  stats={getProviderStats(key, freeAuthTypes)}
                  authType="free"
                  toggleDisabled={togglePendingId === key}
                  onToggle={(active) => onToggleProvider(key, freeAuthTypes, active, info.name)}
                />
              );
            })}
            {freeTierEntries.map(([key, info]) => {
              const freeAuthTypes = dualAuthTypes(info, key);
              return (
                <ApiKeyProviderCard
                  key={key}
                  providerId={key}
                  provider={info}
                  stats={getProviderStats(key, freeAuthTypes)}
                  authType={Array.isArray(freeAuthTypes) ? (freeAuthTypes[0] ?? "apikey") : freeAuthTypes}
                  toggleDisabled={togglePendingId === key}
                  onToggle={(active) => onToggleProvider(key, freeAuthTypes, active, info.name)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* API Key Providers */}
      {apikeyEntries.length > 0 && (
        <div className="flex flex-col gap-4">
          <SectionHeader
            title={<>API Key Providers </>}
            rightContent={<TestAllButton mode="apikey" testingMode={testingMode} onBatchTest={onBatchTest} />}
          />
          <div className={gridCls}>
            {visibleApikeyEntries.map(([key, info]) => (
              <ApiKeyProviderCard
                key={key}
                providerId={key}
                provider={info}
                stats={getProviderStats(key, "apikey")}
                authType="apikey"
                toggleDisabled={togglePendingId === key}
                onToggle={(active) => onToggleProvider(key, "apikey", active, info.name)}
              />
            ))}
          </div>
          {!isFiltering && !showAllApikey && hiddenApikeyCount > 0 && (
            <button
              onClick={onShowAllApikey}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/40 px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:border-primary hover:bg-primary/5"
            >
              <span className="material-symbols-outlined text-[16px]">expand_more</span>
              Show all {apikeyEntries.length} providers
            </button>
          )}
        </div>
      )}
    </>
  );
}

function TestAllButton({ mode, testingMode, onBatchTest }) {
  const active = testingMode === mode;
  const labels = { oauth: "Test all OAuth connections", free: "Test all Free connections", apikey: "Test all API Key connections" };
  const label = labels[mode] || `Test all ${mode} connections`;
  return (
    <button
      onClick={() => onBatchTest(mode)}
      disabled={!!testingMode}
      className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors sm:w-auto sm:py-1.5 ${
        active
          ? "bg-primary/20 border-primary/40 text-primary animate-pulse"
          : "bg-bg border-border text-text-muted hover:text-text-main hover:border-primary/40"
      }`}
      title={label}
      aria-label={label}
    >
      <span className={`material-symbols-outlined text-[14px]${active ? " animate-spin" : ""}`}>play_arrow</span>
      {active ? "Testing..." : "Test All"}
    </button>
  );
}

ProvidersGrid.propTypes = {
  oauthEntries: PropTypes.array.isRequired,
  freeEntries: PropTypes.array.isRequired,
  freeTierEntries: PropTypes.array.isRequired,
  apikeyEntries: PropTypes.array.isRequired,
  showAllApikey: PropTypes.bool.isRequired,
  onShowAllApikey: PropTypes.func.isRequired,
  isFiltering: PropTypes.bool.isRequired,
  getProviderStats: PropTypes.func.isRequired,
  dualAuthTypes: PropTypes.func.isRequired,
  testingMode: PropTypes.string,
  onBatchTest: PropTypes.func.isRequired,
  onToggleProvider: PropTypes.func.isRequired,
  togglePendingId: PropTypes.string,
  compatibleProviders: PropTypes.array.isRequired,
  anthropicCompatibleProviders: PropTypes.array.isRequired,
  onAddOpenAI: PropTypes.func.isRequired,
  onAddAnthropic: PropTypes.func.isRequired,
};

export default ProvidersGrid;
