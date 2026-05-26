import { memo, useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import type { SidebarChatRow } from "../../../../shared/types"
import { AnimatedShinyText } from "../../ui/animated-shiny-text"
import { Input } from "../../ui/input"
import { formatSidebarAgeLabel } from "../../../lib/formatters"
import { createUiIdentityDescriptor, getUiIdentityAttributeProps } from "../../../lib/uiIdentityOverlay"
import { cn, normalizeChatId } from "../../../lib/utils"
import { PROVIDER_ICONS } from "../ChatPreferenceControls"
import { ChatRowMenu } from "./Menus"
import { useEventCallback } from "../../../hooks/useEventCallback"

const loadingStatuses = new Set(["starting", "running"])
const CHAT_ROW_UI_ID = "sidebar.chat-row"
const CHAT_ROW_DESCRIPTOR = createUiIdentityDescriptor({
  id: CHAT_ROW_UI_ID,
  c3ComponentId: "c3-113",
  c3ComponentLabel: "sidebar",
})
const PROVIDER_LABELS = {
  claude: "Claude",
  codex: "Codex",
  "claude-pty": "Claude (PTY)",
} as const

interface Props {
  chat: SidebarChatRow
  activeChatId: string | null
  nowMs: number
  onSelectChat: (chatId: string) => void
  onForkChat?: (chatId: string) => void
  onMergeWithChat?: (chatId: string) => void
  onDeleteChat: (chatId: string) => void
  onRenameChat: (chatId: string, title: string) => void
}

export function areChatRowPropsEqual(previous: Props, next: Props): boolean {
  const previousNormalizedChatId = normalizeChatId(previous.chat.chatId)
  const nextNormalizedChatId = normalizeChatId(next.chat.chatId)
  const previousActive = previous.activeChatId === previousNormalizedChatId
  const nextActive = next.activeChatId === nextNormalizedChatId

  return previous.nowMs === next.nowMs
    && previousActive === nextActive
    && previous.chat._id === next.chat._id
    && previous.chat._creationTime === next.chat._creationTime
    && previous.chat.chatId === next.chat.chatId
    && previous.chat.title === next.chat.title
    && previous.chat.status === next.chat.status
    && previous.chat.unread === next.chat.unread
    && previous.chat.localPath === next.chat.localPath
    && previous.chat.provider === next.chat.provider
    && previous.chat.model === next.chat.model
    && previous.chat.lastMessageAt === next.chat.lastMessageAt
    && previous.chat.hasAutomation === next.chat.hasAutomation
}

function ChatRowInner({
  chat,
  activeChatId,
  nowMs,
  onSelectChat,
  onForkChat,
  onMergeWithChat,
  onDeleteChat,
  onRenameChat,
}: Props) {
  const normalizedChatId = normalizeChatId(chat.chatId)
  const isActive = activeChatId === normalizedChatId
  const ageLabel = formatSidebarAgeLabel(chat.lastMessageAt, nowMs)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(chat.title)
  const inputRef = useRef<HTMLInputElement>(null)
  const ProviderIcon = chat.provider ? PROVIDER_ICONS[chat.provider] : null
  const providerLabel = chat.provider ? PROVIDER_LABELS[chat.provider] : null
  const modelLabel = typeof chat.model === "string" && chat.model.trim() ? chat.model.trim() : null
  const handleSelectChat = useEventCallback(() => {
    if (!isEditing) onSelectChat(chat.chatId)
  })
  const handleDelete = useEventCallback(() => {
    onDeleteChat(chat.chatId)
  })
  const handleRename = useEventCallback((title: string) => {
    onRenameChat(chat.chatId, title)
  })
  const handleFork = useEventCallback(() => {
    onForkChat?.(chat.chatId)
  })
  const handleMergeWith = useEventCallback(() => {
    onMergeWithChat?.(chat.chatId)
  })

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isEditing])

  function commitRename() {
    const trimmed = editValue.trim()
    setIsEditing(false)
    if (trimmed && trimmed !== chat.title) {
      handleRename(trimmed)
    } else {
      setEditValue(chat.title)
    }
  }

  function startEditing() {
    setEditValue(chat.title)
    setIsEditing(true)
  }

  return (
    <ChatRowMenu
      onFork={handleFork}
      onMergeWith={handleMergeWith}
      onRename={startEditing}
      onDelete={handleDelete}
    >
      <div
        data-chat-id={normalizedChatId}
        {...getUiIdentityAttributeProps(CHAT_ROW_DESCRIPTOR)}
        className={cn(
          "group flex min-h-8 items-center gap-2 pl-2.5 pr-0.5 py-0.5 rounded-lg cursor-pointer border hover:bg-muted/20 active:scale-[0.985] transition-all",
          isActive
            ? "bg-primary/[0.07] hover:bg-primary/[0.1] border-primary/20 dark:bg-primary/[0.12] dark:hover:bg-primary/[0.16] dark:border-primary/15"
            : "border-border/0 hover:border-border dark:hover:border-slate-400/10"
        )}
        onClick={handleSelectChat}
      >
        {loadingStatuses.has(chat.status) ? (
          <Loader2 className="size-3.5 flex-shrink-0 animate-spin text-muted-foreground" />
        ) : chat.status === "waiting_for_user" ? (
          <div className="relative ">
            <div className=" rounded-full z-0 size-3.5 flex items-center justify-center ">
              <div className="absolute rounded-full z-0 size-2.5 bg-blue-400/80 animate-ping" />
              <div className=" rounded-full z-0 size-2.5 bg-blue-400 ring-2 ring-muted/20 dark:ring-muted/50" />
            </div>
          </div>
        ) : chat.status === "awaiting_agents" ? (
          <div className="relative ">
            <div className=" rounded-full z-0 size-3.5 flex items-center justify-center ">
              <div className="absolute rounded-full z-0 size-2.5 bg-blue-500/80 animate-ping" />
              <div className=" rounded-full z-0 size-2.5 bg-blue-500 ring-2 ring-muted/20 dark:ring-muted/50" />
            </div>
          </div>
        ) : chat.unread ? (
          <div className="relative">
            <div className="rounded-full z-0 size-3.5 flex items-center justify-center">
              <div className="absolute rounded-full z-0 size-2.5 bg-emerald-400/80 animate-ping" />
              <div className="rounded-full z-0 size-2.5 bg-emerald-400 ring-2 ring-muted/20 dark:ring-muted/50" />
            </div>
          </div>
        ) : null}
        {isEditing ? (
          <Input
            ref={inputRef}
            size="sm"
            className="flex-1 translate-y-[-0.5px]"
            value={editValue}
            onChange={(event) => setEditValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                commitRename()
              } else if (event.key === "Escape") {
                event.preventDefault()
                setEditValue(chat.title)
                setIsEditing(false)
              }
            }}
            onBlur={commitRename}
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <span
            className={cn(
              "text-sm truncate flex-1 translate-y-[-0.5px]",
              isActive && "font-medium",
            )}
            onDoubleClick={(event) => {
              event.stopPropagation()
              startEditing()
            }}
          >
            {chat.status !== "idle" && chat.status !== "waiting_for_user" && chat.status !== "awaiting_agents" ? (
              <AnimatedShinyText
                animate={chat.status === "running"}
                shimmerWidth={Math.max(20, chat.title.length * 3)}
              >
                {chat.title}
              </AnimatedShinyText>
            ) : (
              chat.title
            )}
          </span>
        )}
        <div className="mr-[2px] flex shrink-0 items-center gap-0.5">
          {modelLabel ? (
            <span
              className={cn(
                "max-w-24 truncate rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground/70 transition-colors",
                isActive
                  ? "bg-primary/[0.08] text-foreground/70 dark:bg-primary/[0.14]"
                  : "bg-muted/60 group-hover:bg-muted group-hover:text-muted-foreground"
              )}
              title={modelLabel}
              aria-label={modelLabel}
            >
              {modelLabel}
            </span>
          ) : null}
          {ProviderIcon && providerLabel ? (
            <span
              className={cn(
                "flex h-7 w-4 items-center justify-center text-muted-foreground/55 transition-colors",
                isActive ? "text-foreground/60" : "group-hover:text-muted-foreground/80",
              )}
              title={providerLabel}
              aria-label={providerLabel}
            >
              <ProviderIcon className="h-2.5 w-2.5" />
            </span>
          ) : null}
          {ageLabel ? (
            <span className="hidden md:flex h-7 items-center justify-end pr-1 text-[11px] text-muted-foreground opacity-50">
              {ageLabel}
            </span>
          ) : null}
        </div>
      </div>
    </ChatRowMenu>
  )
}

export const ChatRow = memo(ChatRowInner, areChatRowPropsEqual)
