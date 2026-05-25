import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { createC3UiIdentityDescriptor, getUiIdentityAttributeProps } from "../../lib/uiIdentityOverlay"
import { ContentOverlay } from "../rich-content/ContentOverlay"
import { EmbedRenderer } from "../rich-content/EmbedRenderer"
import { remarkRichContentHint } from "../rich-content/remarkRichContentHint"
import type { RichContentType } from "../rich-content/types"
import { createMarkdownComponents } from "./shared"
import { stripWorkspacePath } from "../../lib/pathUtils"
import { inferPreviewRenderer } from "../../lib/previewRenderer"

export interface LocalFilePreview {
  path: string
  content: string
  line?: number
  column?: number
}

const LOCAL_FILE_PREVIEW_DIALOG_UI_ID = "content-preview.dialog"
const LOCAL_FILE_PREVIEW_DIALOG_UI_DESCRIPTOR = createC3UiIdentityDescriptor({
  id: LOCAL_FILE_PREVIEW_DIALOG_UI_ID,
  c3ComponentId: "c3-111",
  c3ComponentLabel: "messages",
})

function inferCodeLanguage(path: string): string | null {
  const extension = path.split("/").pop()?.split(".").pop()?.toLowerCase() ?? ""
  switch (extension) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "json":
    case "css":
    case "scss":
    case "html":
    case "xml":
    case "svg":
    case "sh":
    case "bash":
    case "zsh":
    case "py":
    case "rs":
    case "go":
    case "java":
    case "rb":
    case "php":
    case "yml":
    case "yaml":
    case "sql":
      return extension
    default:
      return null
  }
}

function wrapPreviewCodeFence(path: string, content: string): string {
  const language = inferCodeLanguage(path) ?? ""
  return `\`\`\`${language}\n${content}\n\`\`\``
}

function isAsciiTreeLine(line: string): boolean {
  return /[├└│─]/.test(line)
}

function isAsciiTreeRootLine(line: string): boolean {
  return /^\S.*\/\s*$/.test(line)
}

function isFenceLine(line: string): boolean {
  return /^\s*(```|~~~)/.test(line)
}

function normalizeLocalFilePreviewMarkdown(content: string): string {
  const lines = content.split("\n")
  const normalized: string[] = []
  let index = 0
  let inFence = false

  while (index < lines.length) {
    const line = lines[index] ?? ""
    if (isFenceLine(line)) {
      inFence = !inFence
      normalized.push(line)
      index += 1
      continue
    }

    if (!inFence && isAsciiTreeLine(line)) {
      const block: string[] = []
      const previous = normalized[normalized.length - 1]
      if (previous !== undefined && isAsciiTreeRootLine(previous)) {
        normalized.pop()
        block.push(previous)
      }

      while (index < lines.length && isAsciiTreeLine(lines[index] ?? "")) {
        block.push(lines[index] ?? "")
        index += 1
      }

      if (block.length > 1) {
        const beforeBlock = normalized[normalized.length - 1]
        if (beforeBlock !== undefined && beforeBlock.trim() !== "") normalized.push("")
        normalized.push("```text", ...block, "```")
        if ((lines[index] ?? "").trim() !== "") normalized.push("")
        continue
      }

      normalized.push(...block)
      continue
    }

    normalized.push(line)
    index += 1
  }

  return normalized.join("\n")
}

function getDialogTitle(preview: LocalFilePreview, workspacePath?: string | null): string {
  const displayPath = stripWorkspacePath(preview.path, workspacePath)
  if (!preview.line) return displayPath
  if (!preview.column) return `${displayPath}:${preview.line}`
  return `${displayPath}:${preview.line}:${preview.column}`
}

function getLocalFilePreviewType(path: string): RichContentType {
  const renderer = inferPreviewRenderer(path)
  if (renderer.kind === "markdown") {
    return "markdown"
  }
  if (renderer.kind === "embed") {
    return "embed"
  }
  return "code"
}

interface LocalFilePreviewDialogProps {
  preview: LocalFilePreview | null
  workspacePath?: string | null
  onClose: () => void
  onOpenLocalLink: (target: { path: string; line?: number; column?: number }) => void
}

function getLocalFilePreviewDialogUiIdentityProps() {
  return getUiIdentityAttributeProps(LOCAL_FILE_PREVIEW_DIALOG_UI_DESCRIPTOR)
}

export function LocalFilePreviewContent({
  preview,
  onOpenLocalLink,
}: {
  preview: LocalFilePreview
  onOpenLocalLink: (target: { path: string; line?: number; column?: number }) => void
}) {
  const renderer = inferPreviewRenderer(preview.path)

  if (renderer.kind === "markdown") {
    const content = normalizeLocalFilePreviewMarkdown(preview.content)
    return (
      <div className="text-pretty prose prose-sm dark:prose-invert px-0.5 w-full max-w-full space-y-4">
        <Markdown
          remarkPlugins={[remarkGfm]}
          components={createMarkdownComponents({ onOpenLocalLink, renderRichContentBlocks: false })}
        >
          {content}
        </Markdown>
      </div>
    )
  }

  if (renderer.kind === "embed") {
    return (
      <div className="w-full max-w-full">
        <EmbedRenderer format={renderer.format} source={preview.content} />
      </div>
    )
  }

  if (renderer.kind === "unsupported") {
    return (
      <div className="px-1 py-10 text-center text-sm text-muted-foreground">
        Preview unavailable for this file type.
      </div>
    )
  }

  return (
    <div className="text-pretty prose prose-sm dark:prose-invert px-0.5 w-full max-w-full space-y-4">
      <Markdown
        remarkPlugins={[remarkGfm, remarkRichContentHint]}
        components={createMarkdownComponents({ onOpenLocalLink, renderRichContentBlocks: false })}
      >
        {wrapPreviewCodeFence(preview.path, preview.content)}
      </Markdown>
    </div>
  )
}

export function LocalFilePreviewDialog({
  preview,
  workspacePath,
  onClose,
  onOpenLocalLink,
}: LocalFilePreviewDialogProps) {
  return (
    <ContentOverlay
      open={preview !== null}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose()
        }
      }}
      title={preview ? getDialogTitle(preview, workspacePath) : "File preview"}
      type={preview ? getLocalFilePreviewType(preview.path) : "code"}
      rawContent={preview?.content}
      rootUiId={LOCAL_FILE_PREVIEW_DIALOG_UI_DESCRIPTOR}
    >
      {preview ? <LocalFilePreviewContent preview={preview} onOpenLocalLink={onOpenLocalLink} /> : null}
    </ContentOverlay>
  )
}

export {
  LOCAL_FILE_PREVIEW_DIALOG_UI_ID,
  getDialogTitle,
  getLocalFilePreviewDialogUiIdentityProps,
  getLocalFilePreviewType,
  normalizeLocalFilePreviewMarkdown,
}
