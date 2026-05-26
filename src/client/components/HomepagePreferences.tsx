import {
  createC3UiIdentityDescriptor,
  getUiIdentityAttributeProps,
} from "../lib/uiIdentityOverlay"
import { cn } from "../lib/utils"
import { useTheme, type ThemePreference } from "../hooks/useTheme"
import { useChatPreferencesStore, type DefaultProviderPreference } from "../stores/chatPreferencesStore"
import { NotificationToggle } from "./NotificationToggle"

const PREFERENCES_UI_DESCRIPTOR = createC3UiIdentityDescriptor({
  id: "home.preferences",
  c3ComponentId: "c3-117",
  c3ComponentLabel: "projects",
})

const THEME_OPTIONS: readonly ThemePreference[] = ["light", "dark", "system"]
const PROVIDER_OPTIONS: readonly DefaultProviderPreference[] = ["last_used", "claude", "codex", "claude-pty"]

const PROVIDER_LABELS: Record<DefaultProviderPreference, string> = {
  last_used: "Last used",
  claude: "Claude",
  codex: "Codex",
  "claude-pty": "Claude (PTY)",
}

function SegmentGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  formatLabel,
}: {
  label: string
  options: readonly T[]
  value: T
  onChange: (value: T) => void
  formatLabel?: (value: T) => string
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="mr-1 text-muted-foreground/60">{label}</span>
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          className={cn(
            "rounded-md px-2 py-0.5 capitalize transition-colors",
            value === option
              ? "bg-muted text-foreground"
              : "hover:bg-muted/50 hover:text-foreground",
          )}
        >
          {formatLabel ? formatLabel(option) : option}
        </button>
      ))}
    </div>
  )
}

export function HomepagePreferences() {
  const { theme, setTheme } = useTheme()
  const defaultProvider = useChatPreferencesStore((state) => state.defaultProvider)
  const setDefaultProvider = useChatPreferencesStore((state) => state.setDefaultProvider)

  return (
    <div
      className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground"
      {...getUiIdentityAttributeProps(PREFERENCES_UI_DESCRIPTOR)}
    >
      <SegmentGroup
        label="Theme"
        options={THEME_OPTIONS}
        value={theme}
        onChange={setTheme}
      />
      <SegmentGroup
        label="Default provider"
        options={PROVIDER_OPTIONS}
        value={defaultProvider}
        onChange={setDefaultProvider}
        formatLabel={(value) => PROVIDER_LABELS[value]}
      />
      <NotificationToggle />
    </div>
  )
}
