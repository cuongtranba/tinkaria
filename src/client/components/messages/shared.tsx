import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react"
import {
  ArrowDownToLine,
  CheckLine,
  ChevronRight,
  ListTodo,
  Map,
  MessageCircleQuestion,
  Pencil,
  Search,
  Sparkles,
  SquareX,
  Terminal,
  ToyBrick,
  type LucideIcon,
  File,
  FilePen,
  FilePlusCorner,
  Copy,
  Check,
} from "lucide-react"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"
import { parseLocalFileLink, stripWorkspacePath } from "../../lib/pathUtils"
import { formatBashCommandTitle, toTitleCase } from "../../lib/formatters"
import { RichContentBlock } from "../rich-content/RichContentBlock"
import { EmbedRenderer, isEmbedLanguage } from "../rich-content/EmbedRenderer"
import { highlight } from "sugar-high"
import { getLanguagePreset } from "../../lib/syntaxPresets"

type OpenLocalLinkTarget = { path: string; line?: number; column?: number }
type OpenLocalLinkHandler = (target: OpenLocalLinkTarget) => void
type OpenExternalLinkHandler = (href: string) => boolean

const defaultOpenLocalLink: OpenLocalLinkHandler = () => {}
const defaultOpenExternalLink: OpenExternalLinkHandler = () => false

const OpenLocalLinkContext = createContext<OpenLocalLinkHandler>(defaultOpenLocalLink)
const OpenExternalLinkContext = createContext<OpenExternalLinkHandler>(defaultOpenExternalLink)

export function OpenLocalLinkProvider({
  children,
  onOpenLocalLink,
  onOpenExternalLink,
}: {
  children: ReactNode
  onOpenLocalLink?: OpenLocalLinkHandler
  onOpenExternalLink?: OpenExternalLinkHandler
}) {
  return (
    <OpenExternalLinkContext.Provider value={onOpenExternalLink ?? defaultOpenExternalLink}>
      <OpenLocalLinkContext.Provider value={onOpenLocalLink ?? defaultOpenLocalLink}>
        {children}
      </OpenLocalLinkContext.Provider>
    </OpenExternalLinkContext.Provider>
  )
}

export function useOpenLocalLink(): OpenLocalLinkHandler {
  return useContext(OpenLocalLinkContext)
}

// Tool icon mapping - shared between ToolCallMessage and SystemMessage
export const toolIcons: Record<string, LucideIcon> = {
  Task: ListTodo,
  TaskOutput: ListTodo,
  Bash: Terminal,
  Glob: Search,
  Grep: Search,
  ExitPlanMode: Map,
  Read: File,
  Edit: FilePen,
  Write: FilePlusCorner,
  NotebookEdit: Pencil,
  WebFetch: ArrowDownToLine,
  TodoWrite: CheckLine,
  WebSearch: Search,
  KillShell: SquareX,
  AskUserQuestion: MessageCircleQuestion,
  Skill: Sparkles,
  EnterPlanMode: Map,
}

export const defaultToolIcon: LucideIcon = ToyBrick

// Get icon for a tool.
export function getToolIcon(toolName: string): LucideIcon {
  if (toolIcons[toolName]) {
    return toolIcons[toolName]
  }
  return defaultToolIcon
}

// Derive a human-readable label for a tool call message.
// Shared between ToolCallMessage (detailed view) and WipBlock (compact timeline).
export function getToolLabel(message: import("./types").ProcessedToolCall, localPath?: string | null): string {
  if (message.toolKind === "skill") return message.input.skill
  if (message.toolKind === "glob") {
    return `Search files ${message.input.pattern === "**/*" ? "in all directories" : `matching ${message.input.pattern}`}`
  }
  if (message.toolKind === "grep") {
    const pattern = message.input.pattern
    const outputMode = message.input.outputMode
    if (outputMode === "count") return `Count \`${pattern}\` occurrences`
    if (outputMode === "content") return `Find \`${pattern}\` in text`
    return `Find \`${pattern}\` in files`
  }
  if (message.toolKind === "bash") {
    return message.input.description || (message.input.command ? formatBashCommandTitle(message.input.command) : "Bash")
  }
  if (message.toolKind === "web_search") return message.input.query || "Web Search"
  if (message.toolKind === "read_file") return `Read ${stripWorkspacePath(message.input.filePath, localPath)}`
  if (message.toolKind === "write_file") return `Write ${stripWorkspacePath(message.input.filePath, localPath)}`
  if (message.toolKind === "edit_file") return `Edit ${stripWorkspacePath(message.input.filePath, localPath)}`
  if (message.toolKind === "mcp_generic") return `${toTitleCase(message.input.tool)} from ${toTitleCase(message.input.server)}`
  if (message.toolKind === "subagent_task") return message.input.subagentType || message.toolName
  return message.toolName
}

// Container for meta-style messages (system, tool, result)
export function MetaRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex gap-3 justify-start items-center", className)}>
      {children}
    </div>
  )
}

// Content row with consistent text styling
export function MetaContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-1.5 text-xs", className)}>
      {children}
    </div>
  )
}

// Separator pipe
export function MetaSeparator() {
  return <span className="text-muted-foreground">|</span>
}

// Bold label text
export function MetaLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-medium text-foreground/80", className)}>{children}</span>
}

// Muted text
export function MetaText({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>
}

// Expandable row with chevron
interface ExpandableRowProps {
  children: ReactNode
  expandedContent: ReactNode
  defaultExpanded?: boolean
  headerAction?: ReactNode
}

export function ExpandableRow({ children, expandedContent, defaultExpanded = false, headerAction }: ExpandableRowProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="flex flex-col w-full">

      <div className="flex items-center gap-2 w-full">
        <button
          onClick={() => setExpanded(!expanded)}
          className={`group/expandable-row min-w-0 flex-1 cursor-pointer grid grid-cols-[auto_1fr] items-center gap-1 text-sm ${!expanded ? "hover:opacity-60 transition-opacity" : ""}`}
        >
          <div className="grid grid-cols-[auto_1fr] items-center gap-1.5">
            {children}
          </div>
          <ChevronRight
            className={`h-4.5 w-4.5 text-muted-icon translate-y-[0.5px] transition-all duration-200 opacity-0 group-hover/expandable-row:opacity-100 ${expanded ? "rotate-90 opacity-100" : ""}`}
          />
        </button>
        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </div>
      {expanded && expandedContent}
    </div>
  )
}

// Code block for expanded content
export function MetaCodeBlock({ label, children, copyText }: { label: ReactNode; children: ReactNode; copyText?: string }) {
  const [copied, setCopied] = useState(false)
  const textContent = copyText ?? extractText(children)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(textContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.warn("[tinkaria] clipboard write failed:", err instanceof Error ? err.message : String(err))
    }
  }, [textContent])

  return (
    <div className="group/codeblock">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="font-medium text-muted-foreground">{label}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={copied ? "Copied" : "Copy content"}
          onClick={handleCopy}
          className={cn(
            "ml-auto text-muted-foreground opacity-0 group-hover/codeblock:opacity-100 transition-opacity",
            copied && "pointer-events-none"
          )}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <pre className="text-xs font-mono whitespace-no-wrap break-all bg-muted border border-border rounded-lg p-2 max-h-64 overflow-auto w-full">
        {children}
      </pre>
    </div>
  )
}

// Pill/badge for tags
export function MetaPill({ children, icon: Icon, className }: { children: ReactNode; icon?: LucideIcon; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-1 bg-muted border border-border  rounded-full", className)}>
      {Icon && <Icon className="h-3 w-3 text-muted-foreground" />}
      {children}
    </span>
  )
}

// Container with vertical line on the left
export function VerticalLineContainer({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-[auto_1fr] gap-2 min-w-0", className)}>
      <div className=" min-w-5 flex flex-col relative items-center justify-center">
        <div className="min-h-full w-[1px] bg-muted-foreground/20" />
      </div>
      <div className="-ml-[1px] min-w-0 overflow-hidden">
        {children}
      </div>
    </div>
  )
}

// Helper function to extract text content from ReactNode
export function extractText(node: ReactNode): string {
  if (typeof node === "string") {
    return node
  }
  if (typeof node === "number") {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map(extractText).join("")
  }
  if (node && typeof node === "object" && "props" in node) {
    const props = node.props as { children?: ReactNode }
    return extractText(props.children)
  }
  return ""
}

export function extractLanguageFromChildren(children: ReactNode): string | null {
  if (!isValidElement<{ className?: string }>(children)) return null
  const className = children.props.className
  if (typeof className !== "string") return null
  const match = className.match(/language-(\S+)/)
  return match ? match[1] : null
}

type MarkdownChildNode = ReturnType<typeof Children.toArray>[number]

function withChildClassName(node: MarkdownChildNode, className: string): MarkdownChildNode {
  if (!isValidElement<{ className?: string }>(node)) {
    return node
  }

  return cloneElement(node, {
    className: cn(node.props.className, className),
  })
}

// Markdown component overrides
export const markdownComponents = {
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="text-[20px] font-normal leading-tight mt-5 mb-3 first:mt-0 last:mb-0">{children}</h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="text-[18px] font-normal leading-tight mt-5 mb-3 first:mt-0 last:mb-0">{children}</h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="text-[16px] font-normal leading-tight mt-5 mb-3 first:mt-0 last:mb-0">{children}</h3>
  ),
  h4: ({ children }: { children?: ReactNode }) => (
    <h4 className="text-[16px] font-normal leading-tight mt-5 mb-3 first:mt-0 last:mb-0">{children}</h4>
  ),
  h5: ({ children }: { children?: ReactNode }) => (
    <h5 className="text-[16px] font-normal leading-tight mt-5 mb-3 first:mt-0 last:mb-0">{children}</h5>
  ),
  h6: ({ children }: { children?: ReactNode }) => (
    <h6 className="text-[16px] font-normal leading-tight mt-5 mb-3 first:mt-0 last:mb-0">{children}</h6>
  ),

  pre: ({ children, ...props }: ComponentPropsWithoutRef<"pre">) => {
    const textContent = extractText(children)
    const language = extractLanguageFromChildren(children)
    const isEmbed = isEmbedLanguage(language)
    const autoExpand = (props as Record<string, unknown>)["data-auto-expand"] === "true"

    return (
      <RichContentBlock
        type={isEmbed ? "embed" : "code"}
        title={language ?? "Code"}
        rawContent={textContent}
        defaultExpanded={autoExpand}
      >
        {isEmbed && language ? (
          <EmbedRenderer format={language} source={textContent} />
        ) : (
          <div className="relative overflow-x-auto max-w-full min-w-0 no-code-highlight group/pre">
            <pre className="min-w-0 rounded-none py-2.5 px-3.5 [.no-pre-highlight_&]:bg-background" {...props}>{children}</pre>
          </div>
        )}
      </RichContentBlock>
    )
  },

  code: ({ children, className, ...props }: ComponentPropsWithoutRef<"code">) => {
    const rawText = extractText(children)
    // A language-less fenced block (e.g. ASCII-art diagrams) gets no className
    // from react-markdown; treat multi-line content as a block so its whitespace
    // is preserved (monospace, scrollable) instead of wrapping like inline code.
    const isInline = !className && !rawText.includes("\n")
    if (isInline) {
      return <code className="break-normal [overflow-wrap:anywhere] px-1 bg-border/60 dark:[.no-pre-highlight_&]:bg-background dark:[.text-pretty_&]:bg-neutral [.no-code-highlight_&]:!bg-transparent py-0.5 rounded text-sm whitespace-normal" {...props}>{children}</code>
    }

    const language = typeof className === "string"
      ? className.match(/language-(\S+)/)?.[1] ?? null
      : null
    const preset = language ? getLanguagePreset(language) : undefined
    const highlighted = highlight(rawText, preset)

    return (
      <code
        className="block text-xs whitespace-pre"
        {...props}
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    )
  },

  table: ({ children, ...props }: ComponentPropsWithoutRef<"table">) => (
    <div className="border border-border  rounded-xl overflow-x-auto">
      <table className="table-auto min-w-full divide-y divide-border bg-background" {...props}>{children}</table>
    </div>
  ),

  tbody: ({ children, ...props }: ComponentPropsWithoutRef<"tbody">) => (
    <tbody className="divide-y divide-border" {...props}>{children}</tbody>
  ),

  th: ({ children, ...props }: ComponentPropsWithoutRef<"th">) => (
    <th className="text-left text-xs uppercase text-muted-foreground tracking-wider p-2 pl-0 first:pl-3 bg-muted dark:bg-card [&_*]:font-semibold" {...props}>{children}</th>
  ),
  td: ({ children, ...props }: ComponentPropsWithoutRef<"td">) => (
    <td className="text-left    p-2 pl-0 first:pl-3 [&_*]:font-normal " {...props}>{children}</td>
  ),

  p: ({ children, ...props }: ComponentPropsWithoutRef<"p">) => (
    <p className="break-words mt-5 mb-3 first:mt-0 last:mb-0" {...props}>{children}</p>
  ),

  blockquote: ({ children, ...props }: ComponentPropsWithoutRef<"blockquote">) => (
    (() => {
      const childNodes = Children.toArray(children)

      const firstChild = childNodes[0]
      if (firstChild !== undefined) {
        childNodes[0] = withChildClassName(firstChild, "mt-0")
      }

      const lastIndex = childNodes.length - 1
      const lastChild = childNodes[lastIndex]
      if (lastChild !== undefined) {
        childNodes[lastIndex] = withChildClassName(lastChild, "mb-0")
      }

      return (
        <blockquote
          className="my-2 mt-5 mb-3 first:mt-0 last:mb-0 border-l-2 border-border/80 pl-2 text-muted-foreground"
          {...props}
        >
          {childNodes}
        </blockquote>
      )
    })()
  ),

  a: ({ children, ...props }: ComponentPropsWithoutRef<"a">) => (
    <a
      className="transition-all underline decoration-2 text-logo decoration-logo/50 hover:text-logo/70 dark:text-logo dark:decoration-logo/70 dark:hover:text-logo/60 dark:hover:decoration-logo/40 "
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
}

export function createMarkdownComponents(options?: {
  onOpenLocalLink?: OpenLocalLinkHandler
  onOpenExternalLink?: OpenExternalLinkHandler
  renderRichContentBlocks?: boolean
}) {
  const renderRichContentBlocks = options?.renderRichContentBlocks ?? true

  return {
    ...markdownComponents,
    pre: ({ children, ...props }: ComponentPropsWithoutRef<"pre">) => {
      if (renderRichContentBlocks) {
        return <div>{markdownComponents.pre({ children, ...props })}</div>
      }

      const textContent = extractText(children)
      const language = extractLanguageFromChildren(children)
      const isEmbed = isEmbedLanguage(language)

      if (isEmbed && language) {
        return (
          <div className="my-2 overflow-x-auto max-w-full min-w-0">
            <EmbedRenderer format={language} source={textContent} />
          </div>
        )
      }

      return (
        <div className="relative overflow-x-auto max-w-full min-w-0 no-code-highlight group/pre my-2">
          <pre className="min-w-0 rounded-xl border border-border bg-muted/30 py-2.5 px-3.5 [.no-pre-highlight_&]:bg-background" {...props}>{children}</pre>
        </div>
      )
    },
    a: ({ children, href, onClick, ...props }: ComponentPropsWithoutRef<"a">) => {
      const onOpenLocalLink = options?.onOpenLocalLink ?? useContext(OpenLocalLinkContext)
      const onOpenExternalLink = options?.onOpenExternalLink ?? useContext(OpenExternalLinkContext)
      const parsedLocalLink = parseLocalFileLink(href)

      return (
        <a
          {...props}
          className="transition-all underline decoration-2 text-logo decoration-logo/50 hover:text-logo/70 dark:text-logo dark:decoration-logo/70 dark:hover:text-logo/60 dark:hover:decoration-logo/40 "
          href={href}
          target={parsedLocalLink ? undefined : "_blank"}
          rel={parsedLocalLink ? undefined : "noopener noreferrer"}
          onClick={(event) => {
            onClick?.(event)
            if (event.defaultPrevented) return
            if (parsedLocalLink) {
              if (onOpenLocalLink === defaultOpenLocalLink) return
              event.preventDefault()
              onOpenLocalLink(parsedLocalLink)
              return
            }
            if (!href || onOpenExternalLink === defaultOpenExternalLink) return
            if (!onOpenExternalLink(href)) return
            event.preventDefault()
          }}
        >
          {children}
        </a>
      )
    },
  }
}

export const markdownWithHeadingsComponents = {
  ...markdownComponents,
}
