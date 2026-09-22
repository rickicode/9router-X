"use client";

import { Card, Button } from "@/shared/components";
import { getModelKind } from "@/shared/constants/models";
import { getProviderCustomModelRows } from "@/shared/utils/providerCustomModels";
import { isFreeModel, sortModelsByFree } from "@/shared/utils/modelHelpers";
import { translate } from "@/i18n/runtime";
import CompatibleModelsSection from "./CompatibleModelsSection";
import ModelRow from "./ModelRow";

export default function ModelsSection(d) {
 const {
 providerId, providerStorageAlias, providerDisplayAlias, providerThinkingLevels, thinkingMode,
 models, kiloFreeModels, customModels, disabledModelIds, modelAliases, connections, copied,
 modelTestResults, testingModelIds, isFreeNoAuth, handleThinkingModeChange, handleDisableAll,
 handleEnableAll, handleDisableModel, handleEnableModel, handleAddCustomModel, handleDeleteCustomModel,
 handleSetAlias, handleDeleteAlias, handleTestModel, handleImportQoderModels, handleImportLiveModels,
 handleImportClineModels, showAddCustomModel, setShowAddCustomModel, importingQoderModels,
 importingClineModels, importingLiveModels, suggestedModels, getCaps, copy, resolveThinkingSuffix,
 isCompatible, isAnthropicCompatible, setConfirmState,
 } = d;

 const renderModelsSection = () => {
 if (isCompatible) {
 return (
 <CompatibleModelsSection
 providerStorageAlias={providerStorageAlias}
 providerDisplayAlias={providerDisplayAlias}
 modelAliases={modelAliases}
 customModels={customModels}
 copied={copied}
 onCopy={copy}
 onSetAlias={handleSetAlias}
 onDeleteAlias={handleDeleteAlias}
 onAddCustomModel={(modelId) => handleAddCustomModel(modelId, "llm", providerStorageAlias)}
 onDeleteCustomModel={(modelId) => handleDeleteCustomModel(modelId, "llm", providerStorageAlias)}
 connections={connections}
 isAnthropic={isAnthropicCompatible}
 />
 );
 }
 const allModels = [
 ...models,
 ...kiloFreeModels.filter((fm) => !models.some((m) => m.id === fm.id)),
 ].filter((m) => { const k = getModelKind(m); return !k || k === "llm"; });
 const disabledSet = new Set(disabledModelIds);
 const activeModels = allModels.filter((m) => !disabledSet.has(m.id));
 const hidePaidOnClineFree = providerId === "cline-free";
 const displayModels = sortModelsByFree(
 activeModels.filter((m) => !hidePaidOnClineFree || isFreeModel(m, providerId)),
 [],
 providerId
 );
 const disabledDisplayModels = allModels.filter((m) => disabledSet.has(m.id));
 const customModelRows = getProviderCustomModelRows({
 customModels,
 modelAliases,
 providerAlias: providerStorageAlias,
 builtInModels: models,
 type: "llm",
 });

 return (
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
 {customModelRows.map((model) => (
 <ModelRow
 key={`${model.source}-${model.fullModel}`}
 model={{ id: model.id, name: model.name }}
 fullModel={`${providerDisplayAlias}/${model.id}`}
 alias={model.alias}
 copied={copied}
 onCopy={copy}
 onSetAlias={() => {}}
 onDeleteAlias={() => {
 if (model.source === "custom") {
 handleDeleteCustomModel(model.id, "llm", providerStorageAlias);
 } else {
 handleDeleteAlias(model.alias);
 }
 }}
 testStatus={modelTestResults[model.id]}
 onTest={connections.length > 0 || isFreeNoAuth ? () => handleTestModel(model.id) : undefined}
 isTesting={testingModelIds.has(model.id)}
 isCustom
 isFree={false}
 caps={getCaps(`${providerId}/${model.id}`)}
 thinkingSuffix={resolveThinkingSuffix(model.id)}
 />
 ))}
 {displayModels.map((model) => {
 const fullModel = `${providerStorageAlias}/${model.id}`;
 const oldFormatModel = `${providerId}/${model.id}`;
 const existingAlias = Object.entries(modelAliases).find(
 ([, m]) => m === fullModel || m === oldFormatModel
 )?.[0];
 return (
 <ModelRow
 key={model.id}
 model={model}
 fullModel={`${providerDisplayAlias}/${model.id}`}
 alias={existingAlias}
 copied={copied}
 onCopy={copy}
 onSetAlias={(alias) => handleSetAlias(model.id, alias, providerStorageAlias)}
 onDeleteAlias={() => handleDeleteAlias(existingAlias)}
 testStatus={modelTestResults[model.id]}
 onTest={connections.length > 0 || isFreeNoAuth ? () => handleTestModel(model.id) : undefined}
 isTesting={testingModelIds.has(model.id)}
 isFree={isFreeModel(model, providerId) || model.id.toLowerCase().includes("free") || model.name?.toLowerCase().includes("free")}
 onDisable={() => handleDisableModel(model.id)}
 caps={getCaps(`${providerId}/${model.id}`)}
 thinkingSuffix={resolveThinkingSuffix(model.id)}
 />
 );
 })}
 <button
 onClick={() => setShowAddCustomModel(true)}
      className="flex w-full items-center justify-center gap-1.5 rounded-sm border border-dashed border-primary/30 px-3 py-2.5 text-xs text-primary hover:border-primary hover:bg-primary/10 sm:w-auto transition-colors"
 >
 <span className="material-symbols-outlined text-sm">add</span>
 Add Model
 </button>

 {providerId === "qoder" && connections.some((conn) => conn.isActive !== false) && (
 <button
 onClick={handleImportQoderModels}
 disabled={importingQoderModels}
        className="flex w-full items-center justify-center gap-1.5 rounded-sm border border-dashed border-primary/30 px-3 py-2.5 text-xs text-primary hover:border-primary hover:bg-primary/10 sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
 >
 <span className="material-symbols-outlined text-sm" style={importingQoderModels ? { animation: "spin 1s linear infinite" } : undefined}>
 {importingQoderModels ? "progress_activity" : "download"}
 </span>
 {importingQoderModels ? translate("Fetching...") : translate("Fetch Qoder Models")}
 </button>
 )}

 {(providerId === "cline" || providerId === "clinepass") && connections.some((conn) => conn.isActive !== false) && (
 <button
 onClick={handleImportClineModels}
 disabled={importingClineModels}
        className="flex w-full items-center justify-center gap-1.5 rounded-sm border border-dashed border-primary/30 px-3 py-2.5 text-xs text-primary hover:border-primary hover:bg-primary/10 sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
 >
 <span className="material-symbols-outlined text-sm" style={importingClineModels ? { animation: "spin 1s linear infinite" } : undefined}>
 {importingClineModels ? "progress_activity" : "download"}
 </span>
 {importingClineModels ? translate("Fetching...") : translate("Import from /models")}
 </button>
 )}

 {(providerId === "orcarouter" || providerId === "tokenharbor" || providerId === "openrouter" || providerId === "together" || providerId === "groq" || providerId === "deepinfra" || providerId === "fireworks" || providerId === "novita" || providerId === "mistral" || providerId === "perplexity" || providerId === "xai" || providerId === "hyperbolic" || providerId === "sambanova" || providerId === "cerebras" || providerId === "siliconflow" || providerId === "deepseek" || providerId === "minimax" || providerId === "moonshot" || providerId === "gemini-cli") && connections.some((conn) => conn.isActive !== false) && (
 <button
 onClick={handleImportLiveModels}
 disabled={importingLiveModels}
        className="flex w-full items-center justify-center gap-1.5 rounded-sm border border-dashed border-primary/30 px-3 py-2.5 text-xs text-primary hover:border-primary hover:bg-primary/10 sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
 >
 <span className="material-symbols-outlined text-sm" style={importingLiveModels ? { animation: "spin 1s linear infinite" } : undefined}>
 {importingLiveModels ? "progress_activity" : "download"}
 </span>
 {importingLiveModels ? translate("Fetching...") : translate("Import from /models")}
 </button>
 )}

 {suggestedModels.length > 0 && (() => {
 const addedFullModels = new Set([
 ...Object.values(modelAliases),
 ...customModelRows.map((model) => model.fullModel),
 ]);
 const hardcodedIds = new Set(models.map((m) => m.id));
 const notAdded = suggestedModels.filter(
 (m) => !addedFullModels.has(`${providerStorageAlias}/${m.id}`) && !hardcodedIds.has(m.id)
 );
 if (notAdded.length === 0) return null;
 return (
 <div className="w-full mt-2">
 <p className="text-xs text-text-muted mb-2">Suggested free models (≥200k context):</p>
 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
 {notAdded.map((m) => (
 <button
 key={m.id}
 onClick={async () => {
 await handleAddCustomModel(m.id, "llm", providerStorageAlias);
 }}
 className="flex items-center gap-1 px-2.5 py-1.5 rounded-sm border border-border text-xs text-text-muted hover:text-primary hover:border-primary/30 hover:bg-primary/10 transition-colors"
 title={`${m.name} · ${(m.contextLength / 1000).toFixed(0)}k ctx`}
 >
 <span className="material-symbols-outlined text-[18px]">add</span>
 {m.id.split("/").pop()}
 </button>
 ))}
 </div>
 </div>
 );
 })()}

 {disabledDisplayModels.length > 0 && (
 <div className="w-full mt-2">
 <p className="text-xs text-text-muted mb-2">Disabled models ({disabledDisplayModels.length}):</p>
 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
 {disabledDisplayModels.map((m) => (
 <button
 key={m.id}
 onClick={() => handleEnableModel(m.id)}
 className="flex items-center gap-1 px-2.5 py-1.5 rounded-sm border border-dashed border-border text-xs text-text-muted hover:text-primary hover:border-primary/30 hover:bg-primary/10 transition-colors"
 title="Restore model"
 >
 <span className="material-symbols-outlined text-[18px]">add</span>
 {m.id}
 </button>
 ))}
 </div>
 </div>
 )}
 </div>
 );
 };

 const allIds = isCompatible ? [] : [
 ...models,
 ...kiloFreeModels.filter((fm) => !models.some((m) => m.id === fm.id)),
 ].filter((m) => { const k = getModelKind(m); return !k || k === "llm"; }).map((m) => m.id);
 const activeIds = allIds.filter((id) => !disabledModelIds.includes(id));

 return (
 <Card>
 <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
 <div className="flex items-center gap-3">
 <h2 className="text-sm font-semibold">Available Models</h2>
 {providerThinkingLevels && (
 <select
 value={thinkingMode}
 onChange={(e) => handleThinkingModeChange(e.target.value)}
 title="Appends (level) suffix to copied model names"
 className="rounded-sm border border-border bg-surface px-2 py-1 text-xs focus:border-primary focus:outline-none"
 >
 {providerThinkingLevels.map((opt) => (
 <option key={opt} value={opt}>{`Thinking: ${opt.charAt(0).toUpperCase() + opt.slice(1)}`}</option>
 ))}
 </select>
 )}
 </div>
 {!isCompatible && (() => {
 return (
 <div className="flex gap-2">
 {disabledModelIds.length > 0 && (
 <Button size="sm" variant="secondary" icon="restart_alt" onClick={handleEnableAll}>
 Active All
 </Button>
 )}
 {activeIds.length > 0 && (
 <Button size="sm" variant="secondary" icon="block" onClick={() => handleDisableAll(activeIds)}>
 Disable All
 </Button>
 )}
 </div>
 );
 })()}
 </div>
 {!!d.modelsTestError && (
 <p className="text-xs text-danger mb-3 break-words">{d.modelsTestError}</p>
 )}
 {renderModelsSection()}
 </Card>
 );
}
