import type {
  AgentProvider,
  ClaudeModelOptions,
  CodexModelOptions,
  ClaudeContextWindow,
  ModelOptions,
  ProviderCatalogEntry,
  ProviderModelOption,
  ServiceTier,
} from "../shared/types"
import {
  DEFAULT_CLAUDE_MODEL_OPTIONS,
  DEFAULT_CODEX_MODEL_OPTIONS,
  PROVIDERS,
  normalizeClaudeContextWindow,
  isClaudeReasoningEffort,
  isCodexReasoningEffort,
} from "../shared/types"
import type { RuntimeCapabilities, DiscoveredModel } from "../shared/runtime-types"

const HARD_CODED_CODEX_MODELS: ProviderModelOption[] = [
  { id: "gpt-5.4", label: "GPT-5.4", supportsEffort: false },
  { id: "gpt-5.3-codex", label: "GPT-5.3 Codex", supportsEffort: false },
  { id: "gpt-5.3-codex-spark", label: "GPT-5.3 Codex Spark", supportsEffort: false },
]

export const SERVER_PROVIDERS: ProviderCatalogEntry[] = PROVIDERS.map((provider) =>
  provider.id === "codex"
    ? {
        ...provider,
        defaultModel: "gpt-5.4",
        models: HARD_CODED_CODEX_MODELS,
      }
    : provider
)

export function getServerProviderCatalog(provider: AgentProvider): ProviderCatalogEntry {
  const entry = SERVER_PROVIDERS.find((candidate) => candidate.id === provider)
  if (!entry) {
    throw new Error(`Unknown provider: ${provider}`)
  }
  return entry
}

export function normalizeServerModel(
  provider: AgentProvider,
  model?: string,
  dynamicCatalog?: ProviderCatalogEntry[],
): string {
  const providers = dynamicCatalog ?? SERVER_PROVIDERS
  const entry = providers.find((candidate) => candidate.id === provider)
  if (!entry) return getServerProviderCatalog(provider).defaultModel
  if (model && entry.models.some((candidate) => candidate.id === model)) {
    return model
  }
  return entry.defaultModel
}

export function normalizeClaudeModelOptions(
  model: string,
  modelOptions?: ModelOptions,
  legacyEffort?: string
): ClaudeModelOptions {
  const reasoningEffort = modelOptions?.claude?.reasoningEffort
  return {
    reasoningEffort: isClaudeReasoningEffort(reasoningEffort)
      ? reasoningEffort
      : isClaudeReasoningEffort(legacyEffort)
        ? legacyEffort
        : DEFAULT_CLAUDE_MODEL_OPTIONS.reasoningEffort,
    contextWindow: normalizeClaudeContextWindow(model, modelOptions?.claude?.contextWindow as ClaudeContextWindow | undefined),
  }
}

export function normalizeCodexModelOptions(modelOptions?: ModelOptions, legacyEffort?: string): CodexModelOptions {
  const reasoningEffort = modelOptions?.codex?.reasoningEffort
  return {
    reasoningEffort: isCodexReasoningEffort(reasoningEffort)
      ? reasoningEffort
      : isCodexReasoningEffort(legacyEffort)
        ? legacyEffort
        : DEFAULT_CODEX_MODEL_OPTIONS.reasoningEffort,
    fastMode: typeof modelOptions?.codex?.fastMode === "boolean"
      ? modelOptions.codex.fastMode
      : DEFAULT_CODEX_MODEL_OPTIONS.fastMode,
  }
}

export function codexServiceTierFromModelOptions(modelOptions: CodexModelOptions): ServiceTier | undefined {
  return modelOptions.fastMode ? "fast" : undefined
}

/** SDK returns "default" for the recommended model — map it to the static "opus" alias */
const DISCOVERED_TO_STATIC_ALIAS: Record<string, string> = { default: "opus" }

function enrichModel(
  staticModel: ProviderModelOption,
  discovered: DiscoveredModel,
): ProviderModelOption {
  return {
    ...staticModel,
    label: discovered.displayName || staticModel.label,
    description: discovered.description,
    supportedEffortLevels: discovered.supportedEffortLevels,
  }
}

export function deriveServerProviderCatalog(
  claudeCapabilities?: RuntimeCapabilities | null,
): ProviderCatalogEntry[] {
  if (!claudeCapabilities?.models.length) return SERVER_PROVIDERS

  const staticClaude = SERVER_PROVIDERS.find((p) => p.id === "claude")!

  const discoveredByAlias = new Map<string, DiscoveredModel>()
  for (const m of claudeCapabilities.models) {
    discoveredByAlias.set(DISCOVERED_TO_STATIC_ALIAS[m.value] ?? m.value, m)
  }

  const enrichedModels: ProviderModelOption[] = staticClaude.models.map((staticModel) => {
    const match = discoveredByAlias.get(staticModel.id)
    return match ? enrichModel(staticModel, match) : staticModel
  })

  const staticIds = new Set(staticClaude.models.map((m) => m.id))
  for (const m of claudeCapabilities.models) {
    const alias = DISCOVERED_TO_STATIC_ALIAS[m.value] ?? m.value
    if (!staticIds.has(alias)) {
      enrichedModels.push({
        id: m.value,
        label: m.displayName || m.value,
        description: m.description,
        supportsEffort: m.supportsEffort ?? false,
        supportedEffortLevels: m.supportedEffortLevels,
      })
    }
  }

  const dynamicClaude: ProviderCatalogEntry = {
    ...staticClaude,
    defaultModel: "sonnet",
    models: enrichedModels,
  }

  return SERVER_PROVIDERS.map((p) => (p.id === "claude" ? dynamicClaude : p))
}
