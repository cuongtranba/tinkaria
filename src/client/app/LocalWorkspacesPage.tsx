import { useState } from "react"
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom"
import { CreateWorkspaceModal } from "../components/CreateWorkspaceModal"
import { LocalDev, type HomeTab } from "../components/LocalDev"
import { normalizeTinkariaTab, TinkariaSettingsPanel } from "./SettingsPage"
import type { AppState } from "./useAppState"

function normalizeHomeTab(value: string | null): HomeTab {
  return value === "workspaces" || value === "settings" ? value : "projects"
}

export function LocalProjectsPage() {
  const state = useOutletContext<AppState>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false)
  const activeTab = normalizeHomeTab(searchParams.get("tab"))
  const settingsTab = normalizeTinkariaTab(searchParams.get("settingsTab") ?? searchParams.get("tab"))

  function handleActiveTabChange(nextTab: HomeTab) {
    setSearchParams(nextTab === "projects" ? {} : { tab: nextTab })
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 relative">
      <LocalDev
        connectionStatus={state.connectionStatus}
        ready={state.localProjectsReady}
        snapshot={state.localProjects}
        startingLocalPath={state.startingLocalPath}
        commandError={state.commandError}
        onOpenProject={state.handleOpenLocalProject}
        onCreateProject={state.handleCreateProject}
        independentWorkspaces={state.sidebarData.independentWorkspaces}
        onCreateWorkspace={() => setCreateWorkspaceOpen(true)}
        onOpenWorkspace={(wsId) => navigate(`/workspace/${wsId}`)}
        onRenameWorkspace={(wsId, name) => void state.handleRenameWorkspace(wsId, name)}
        onTogglePinWorkspace={(wsId, pinned) => void state.handleTogglePinWorkspace(wsId, pinned)}
        onReorderWorkspaces={(ids) => void state.handleReorderWorkspaces(ids)}
        onDeleteWorkspace={(wsId) => void state.handleDeleteWorkspace(wsId)}
        projectGroups={state.sidebarData.workspaceGroups}
        onOpenProjectPage={(groupKey) => navigate(`/project/${groupKey}`)}
        activeTab={activeTab}
        onActiveTabChange={handleActiveTabChange}
        settingsPanel={<TinkariaSettingsPanel state={state} initialTab={settingsTab} />}
      />
      <CreateWorkspaceModal
        open={createWorkspaceOpen}
        onOpenChange={setCreateWorkspaceOpen}
        onConfirm={(name) => {
          void state.handleCreateWorkspace(name)
        }}
      />
    </div>
  )
}
