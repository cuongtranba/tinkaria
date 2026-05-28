import React, { lazy, Suspense, type RefObject } from "react"
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual"
import type { AskUserQuestionItem } from "../components/messages/types"
import type { AskUserQuestionAnswerMap, HydratedTranscriptMessage, TranscriptRenderUnit } from "../../shared/types"
import { useMessageHeights } from "../lib/useMessageHeights"
import type { RenderItem } from "../lib/messageHeights"
import { RawJsonMessage } from "../components/messages/RawJsonMessage"
import { SystemMessage } from "../components/messages/SystemMessage"
import { AccountInfoMessage } from "../components/messages/AccountInfoMessage"
const TextMessage = lazy(() => import("../components/messages/TextMessage").then(m => ({ default: m.TextMessage })))
import { AskUserQuestionMessage } from "../components/messages/AskUserQuestionMessage"
import { PresentContentMessage } from "../components/messages/PresentContentMessage"
import { TodoWriteMessage } from "../components/messages/TodoWriteMessage"
import { ToolCallMessage } from "../components/messages/ToolCallMessage"
import { ResultMessage } from "../components/messages/ResultMessage"
import { InterruptedMessage } from "../components/messages/InterruptedMessage"
import { CompactBoundaryMessage, ContextClearedMessage } from "../components/messages/CompactBoundaryMessage"

// Lazy-loaded: these components import react-markdown and are only needed after chat starts
const UserMessage = lazy(() => import("../components/messages/UserMessage").then(m => ({ default: m.UserMessage })))
const ExitPlanModeMessage = lazy(() => import("../components/messages/ExitPlanModeMessage").then(m => ({ default: m.ExitPlanModeMessage })))
const CompactSummaryMessage = lazy(() => import("../components/messages/CompactSummaryMessage").then(m => ({ default: m.CompactSummaryMessage })))
import { StatusMessage } from "../components/messages/StatusMessage"
import { RateLimitMessage } from "../components/messages/RateLimitMessage"
import { CollapsedToolGroup } from "../components/messages/CollapsedToolGroup"
import { WipBlock } from "../components/messages/WipBlock"
import { OpenLocalLinkProvider } from "../components/messages/shared"
import { RichContentChromeProvider } from "../components/rich-content/RichContentBlock"
import { CHAT_SELECTION_ZONE_ATTRIBUTE } from "./chatFocusPolicy"
import { getUnitDomId } from "./chatWaypoints"

export function getRenderItemIndexForMessageId(renderItems: RenderItem[], messageId: string): number {
  return renderItems.findIndex((item) => {
    if (item.sourceEntryIds.includes(messageId)) return true
    if (item.kind === "tool_group") return item.tools.some((tool) => tool.id === messageId)
    if (item.kind === "wip_block") return item.steps.some((step) => step.id === messageId)
    if (item.kind === "standalone_tool") return item.tool.id === messageId
    if (item.kind === "artifact") return item.artifact.id === messageId
    return item.message.id === messageId
  })
}

export type ChatVirtualizer = Virtualizer<HTMLDivElement, Element>

interface ChatTranscriptProps {
  messages: TranscriptRenderUnit[]
  scrollRef: RefObject<HTMLDivElement | null>
  isLoading: boolean
  localPath?: string
  latestToolIds: Record<string, string | null>
  onOpenLocalLink: (target: { path: string; line?: number; column?: number }) => void
  onOpenExternalLink: (href: string) => boolean
  onAskUserQuestionSubmit: (
    toolUseId: string,
    questions: AskUserQuestionItem[],
    answers: AskUserQuestionAnswerMap
  ) => void
  onExitPlanModeConfirm: (toolUseId: string, confirmed: boolean, clearContext?: boolean, message?: string) => void
  richContentChrome?: "card" | "inline"
  virtualizerRef?: RefObject<ChatVirtualizer | null>
}

export function ChatTranscript({
  messages,
  scrollRef,
  isLoading,
  localPath,
  latestToolIds,
  onOpenLocalLink,
  onOpenExternalLink,
  onAskUserQuestionSubmit,
  onExitPlanModeConfirm,
  richContentChrome = "card",
  virtualizerRef,
}: ChatTranscriptProps) {
  const renderItems = messages

  const { estimateSize } = useMessageHeights(renderItems, scrollRef)

  const virtualizer = useVirtualizer({
    count: renderItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    overscan: 5,
    getItemKey: (index) => renderItems[index]?.id ?? index,
  })

  if (virtualizerRef) virtualizerRef.current = virtualizer

  function renderMessage(message: HydratedTranscriptMessage): React.ReactNode {
    if (message.kind === "user_prompt") {
      return <UserMessage key={message.id} content={message.content} />
    }

    switch (message.kind) {
      case "unknown":
        return <RawJsonMessage key={message.id} json={message.json} />
      case "system_init":
        return <SystemMessage key={message.id} message={message} rawJson={message.debugRaw} />
      case "account_info":
        return <AccountInfoMessage key={message.id} message={message} />
      case "assistant_text":
        return <TextMessage key={message.id} message={message} />
      case "tool":
        if (message.toolKind === "ask_user_question") {
          return (
            <AskUserQuestionMessage
              key={message.id}
              message={message}
              onSubmit={onAskUserQuestionSubmit}
              isLatest={message.id === latestToolIds.AskUserQuestion}
            />
          )
        }
        if (message.toolKind === "exit_plan_mode") {
          return (
            <ExitPlanModeMessage
              key={message.id}
              message={message}
              onConfirm={onExitPlanModeConfirm}
              isLatest={message.id === latestToolIds.ExitPlanMode}
            />
          )
        }
        if (message.toolKind === "todo_write") {
          return <TodoWriteMessage key={message.id} message={message} />
        }
        if (message.toolKind === "present_content") {
          return <PresentContentMessage key={message.id} message={message} />
        }
        return (
          <ToolCallMessage
            key={message.id}
            message={message}
            isLoading={isLoading}
            localPath={localPath}
          />
        )
      case "result": {
        return <ResultMessage key={message.id} message={message} />
      }
      case "interrupted":
        return <InterruptedMessage key={message.id} message={message} />
      case "compact_boundary":
        return <CompactBoundaryMessage key={message.id} />
      case "context_cleared":
        return <ContextClearedMessage key={message.id} />
      case "compact_summary":
        return <CompactSummaryMessage key={message.id} message={message} />
      case "status":
        return <StatusMessage key={message.id} message={message} />
      case "rate_limit":
        return <RateLimitMessage key={message.id} message={message} />
    }
  }

  function renderUnit(item: TranscriptRenderUnit): React.ReactNode {
    switch (item.kind) {
      case "wip_block":
        return <WipBlock steps={item.steps} isLoading={isLoading} localPath={localPath} />
      case "tool_group":
        return <CollapsedToolGroup messages={item.tools} isLoading={isLoading} localPath={localPath} />
      case "standalone_tool":
        return renderMessage(item.tool)
      case "artifact":
        return <PresentContentMessage key={item.artifact.id} message={item.artifact} />
      case "assistant_response":
      case "user_prompt":
      case "system_init":
      case "account_info":
      case "status":
      case "result":
      case "compact_boundary":
      case "compact_summary":
      case "context_cleared":
      case "interrupted":
      case "unknown":
      case "rate_limit":
        return renderMessage(item.message)
      default: {
        const _exhaustive: never = item
        return _exhaustive
      }
    }
  }

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <OpenLocalLinkProvider onOpenLocalLink={onOpenLocalLink} onOpenExternalLink={onOpenExternalLink}>
      <RichContentChromeProvider
        chrome={richContentChrome}
        controlsVisibility={richContentChrome === "inline" ? "hover-or-touch" : "always"}
      >
      <Suspense fallback={<div className="min-h-[24px]" />}>
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        {virtualItems.map((virtualRow) => {
          const item = renderItems[virtualRow.index]

          if (item.kind === "tool_group" || item.kind === "wip_block") {
            return (
              <div
                key={virtualRow.key}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div
                  className="group relative pb-5"
                  {...{ [CHAT_SELECTION_ZONE_ATTRIBUTE]: "" }}
                >
                  {renderUnit(item)}
                </div>
              </div>
            )
          }

          const rendered = renderUnit(item)

          return (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {rendered ? (
                <div
                  id={getUnitDomId(item)}
                  className="group relative pb-5"
                  {...{ [CHAT_SELECTION_ZONE_ATTRIBUTE]: "" }}
                >
                  {rendered}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
      </Suspense>
      </RichContentChromeProvider>
    </OpenLocalLinkProvider>
  )
}
