import { useState } from "react"
import { useNavigate, useOutletContext } from "react-router-dom"
import { ArrowLeft, Box, Puzzle, Settings, User, Server } from "lucide-react"
import { Button } from "../components/ui/button"
import { SegmentedControl, type SegmentedOption } from "../components/ui/segmented-control"
import { ProvidersTab } from "./ProvidersTab"
import { ProfilesTab } from "./ProfilesTab"
import { ExtensionsTab } from "./ExtensionsTab"
import { RunnersTab } from "./RunnersTab"
import type { AppState } from "./useAppState"

export type TinkariaTab = "providers" | "profiles" | "extensions" | "runners"

const TAB_OPTIONS: SegmentedOption<TinkariaTab>[] = [
  { value: "providers", label: "Providers", icon: Box, tooltip: "Providers" },
  { value: "profiles", label: "Profiles", icon: User, tooltip: "Profiles" },
  { value: "extensions", label: "Extensions", icon: Puzzle, tooltip: "Extensions" },
  { value: "runners", label: "Runners", icon: Server, tooltip: "Runners" },
]

export function normalizeTinkariaTab(value: string | null): TinkariaTab {
  return value === "profiles" || value === "extensions" || value === "runners" ? value : "providers"
}

export function TinkariaSettingsPanel({
  state,
  initialTab = "providers",
}: {
  state: AppState
  initialTab?: TinkariaTab
}) {
  const [activeTab, setActiveTab] = useState<TinkariaTab>(initialTab)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3">
        <SegmentedControl
          value={activeTab}
          onValueChange={setActiveTab}
          options={TAB_OPTIONS}
          size="sm"
          className="w-full md:w-auto"
          optionClassName="flex-1 md:flex-initial justify-center"
          alwaysShowLabels
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeTab === "providers" && <ProvidersTab state={state} />}
        {activeTab === "profiles" && <ProfilesTab state={state} />}
        {activeTab === "extensions" && <ExtensionsTab state={state} />}
        {activeTab === "runners" && <RunnersTab />}
      </div>
    </div>
  )
}

export function TinkariaPage() {
  const state = useOutletContext<AppState>()
  const navigate = useNavigate()

  return (
    <div className="flex-1 flex flex-col min-w-0 relative">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 md:pt-4 md:pb-3">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => navigate("/")}
          className="size-7 border-0 md:hidden"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <Settings className="size-4 text-muted-foreground hidden md:block" />
        <h1 className="text-base font-semibold text-foreground md:text-lg">Tinkaria</h1>
      </div>
      <div className="flex-1 min-h-0 px-4 pb-4 overflow-y-auto">
        <TinkariaSettingsPanel state={state} />
      </div>
    </div>
  )
}
