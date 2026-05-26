import { memo, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { render as renderPug } from "../../../shared/puggy"
import { cn, generateUUID } from "../../lib/utils"
import { clampEmbedZoom, useContentViewer } from "./ContentViewerContext"

const EMBED_LANGUAGES = new Set(["mermaid", "d2", "svg", "iframe", "diashort", "html", "pug"])
const TAILWIND_BROWSER_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"
// Zero-specificity (:where) base so a self-contained document's own styles
// (e.g. `body{background:#fafafa}`) always win. Without :where, these rules —
// injected after the document's <style> — would override its background/padding/
// font, leaving the page transparent (dark app surface shows through) and its
// dark body text unreadable. Standalone fragments still get these as fallbacks.
const DEFAULT_EMBED_STYLE = ":where(html),:where(body){margin:0;min-height:100%;}:where(body){background:transparent;padding:1rem;font-family:Inter,ui-sans-serif,system-ui,sans-serif;}"

export function isEmbedLanguage(language: string | null): boolean {
  return language !== null && EMBED_LANGUAGES.has(language)
}

interface EmbedRendererProps {
  format: string
  source: string
  // When true (full-screen preview), the HTML/Pug iframe fills the viewport
  // height instead of the fixed inline preview height.
  fillHeight?: boolean
}

type EmbedWheelZoomIntent = "in" | "out" | null

export const EmbedRenderer = memo(function EmbedRenderer({
  format,
  source,
  fillHeight = false,
}: EmbedRendererProps) {
  if (format === "mermaid") {
    return <MermaidDiagram source={source} />
  }

  if (format === "html") {
    return <HtmlEmbed source={source} fillHeight={fillHeight} />
  }

  if (format === "pug") {
    return <PugEmbed source={source} fillHeight={fillHeight} />
  }

  if (format === "svg") {
    return <SvgEmbed source={source} />
  }

  if (format === "iframe" || format === "diashort") {
    return <RemoteEmbed format={format} source={source} />
  }

  // D2 and other formats: show source as fallback
  return (
    <div className="text-xs font-mono">
      <div className="mb-2 text-muted-foreground text-[10px] uppercase tracking-wider">
        {format} diagram (source)
      </div>
      <pre className="whitespace-pre-wrap break-all text-foreground">
        {source}
      </pre>
    </div>
  )
})

type SvgParseResult =
  | {
      ok: true
      markup: string
    }
  | {
      ok: false
      message: string
    }

function parseSvgMarkup(source: string): SvgParseResult {
  const trimmed = source.trim()
  if (!trimmed) {
    return { ok: false, message: "SVG render error" }
  }

  const stack: string[] = []
  let cursor = 0
  let rootStart = -1
  let rootEnd = -1

  while (cursor < trimmed.length) {
    const next = trimmed[cursor]

    if (next !== "<") {
      const textEnd = trimmed.indexOf("<", cursor)
      const text = trimmed.slice(cursor, textEnd === -1 ? trimmed.length : textEnd)
      const insideRoot = stack.length > 0

      if (!insideRoot && text.trim()) {
        return { ok: false, message: "SVG render error" }
      }

      cursor = textEnd === -1 ? trimmed.length : textEnd
      continue
    }

    if (trimmed.startsWith("<!--", cursor)) {
      const end = trimmed.indexOf("-->", cursor + 4)
      if (end === -1) {
        return { ok: false, message: "SVG render error" }
      }
      cursor = end + 3
      continue
    }

    if (trimmed.startsWith("<![CDATA[", cursor)) {
      const end = trimmed.indexOf("]]>", cursor + 9)
      if (end === -1 || stack.length === 0) {
        return { ok: false, message: "SVG render error" }
      }
      cursor = end + 3
      continue
    }

    if (trimmed.startsWith("<?", cursor)) {
      const end = trimmed.indexOf("?>", cursor + 2)
      if (end === -1 || rootStart !== -1) {
        return { ok: false, message: "SVG render error" }
      }
      cursor = end + 2
      continue
    }

    if (trimmed.slice(cursor, cursor + 9).toUpperCase() === "<!DOCTYPE") {
      const end = findTagEnd(trimmed, cursor + 9)
      if (end === -1 || rootStart !== -1) {
        return { ok: false, message: "SVG render error" }
      }
      cursor = end + 1
      continue
    }

    const tag = readSvgTag(trimmed, cursor)
    if (!tag) {
      return { ok: false, message: "SVG render error" }
    }

    const { name, closing, selfClosing, end } = tag
    if (closing) {
      const expected = stack.pop()
      if (expected !== name) {
        return { ok: false, message: "SVG render error" }
      }

      if (name === "svg" && stack.length === 0) {
        rootEnd = end
      }

      cursor = end
      continue
    }

    if (rootStart === -1) {
      if (name !== "svg" || selfClosing) {
        return { ok: false, message: "SVG render error" }
      }
      rootStart = cursor
    } else if (rootEnd !== -1) {
      return { ok: false, message: "SVG render error" }
    }

    if (!selfClosing) {
      stack.push(name)
    }

    cursor = end
  }

  if (rootStart === -1 || rootEnd === -1 || stack.length !== 0) {
    return { ok: false, message: "SVG render error" }
  }

  return { ok: true, markup: trimmed.slice(rootStart, rootEnd) }
}

export function getEmbedWheelZoomIntent(event: {
  ctrlKey: boolean
  metaKey: boolean
  deltaY: number
}): EmbedWheelZoomIntent {
  if (!event.ctrlKey && !event.metaKey) return null
  if (event.deltaY < 0) return "in"
  if (event.deltaY > 0) return "out"
  return null
}

function normalizeRemoteEmbedSource(format: string, source: string): string | null {
  try {
    const url = new URL(source)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null

    if (format === "diashort" || url.hostname === "diashort.apps.quickable.co") {
      const match = url.pathname.match(/^\/(?:d|e)\/([^/?#]+)/)
      if (!match) return null
      const documentUrl = new URL(`/d/${match[1]}`, url.origin)
      for (const [key, value] of url.searchParams.entries()) {
        documentUrl.searchParams.set(key, value)
      }
      return documentUrl.toString()
    }

    return url.toString()
  } catch (_err: unknown) {
    return null
  }
}

function useEmbedState() {
  const viewer = useContentViewer()
  const [localMode] = useState<"render" | "source">("render")
  const [localZoom, setLocalZoom] = useState(1)

  const embedState = viewer !== null && viewer.state.type === "embed" ? viewer.state : null
  const viewerDispatch = viewer !== null && viewer.state.type === "embed" ? viewer.dispatch : null
  const mode = embedState ? embedState.renderMode : localMode
  const zoom = embedState ? embedState.zoom : localZoom

  const adjustZoom = (direction: EmbedWheelZoomIntent) => {
    if (direction === "in") {
      if (viewerDispatch) {
        viewerDispatch({ type: "ZOOM_IN" })
      } else {
        setLocalZoom((current) => clampEmbedZoom(current + 0.25))
      }
      return
    }
    if (direction === "out") {
      if (viewerDispatch) {
        viewerDispatch({ type: "ZOOM_OUT" })
      } else {
        setLocalZoom((current) => clampEmbedZoom(current - 0.25))
      }
    }
  }

  return { mode, zoom, adjustZoom }
}

function getEmbedZoomContentStyle(zoom: number): CSSProperties | undefined {
  return zoom !== 1 ? { transform: `scale(${zoom})`, transformOrigin: "top left" } : undefined
}

function ZoomableEmbedViewport({
  zoom,
  adjustZoom,
  children,
  className,
}: {
  zoom: number
  adjustZoom: (direction: EmbedWheelZoomIntent) => void
  children: ReactNode
  className?: string
}) {
  return (
    <div
      onWheel={(event) => {
        const direction = getEmbedWheelZoomIntent(event)
        if (!direction) return
        event.preventDefault()
        adjustZoom(direction)
      }}
      data-embed-zoomable="true"
      className={`overflow-auto overscroll-contain touch-pan-x touch-pan-y rounded-md border border-border/60 bg-background ${className ?? ""}`}
    >
      <div
        data-embed-zoom-content="true"
        style={getEmbedZoomContentStyle(zoom)}
        className="min-w-full origin-top-left"
      >
        {children}
      </div>
    </div>
  )
}

function HtmlEmbed({ source, fillHeight = false }: { source: string; fillHeight?: boolean }) {
  const { mode, zoom, adjustZoom } = useEmbedState()
  const htmlSource = createHtmlEmbedDocument(source)

  return (
    <>
      {mode === "render" ? (
        <ZoomableEmbedViewport zoom={zoom} adjustZoom={adjustZoom}>
          <iframe
            data-html-embed="true"
            srcDoc={htmlSource}
            title="HTML content"
            sandbox="allow-scripts"
            className={cn(
              "block w-full border-0 bg-background",
              // Full-screen preview fills the viewport height; inline transcript
              // embeds keep the fixed preview height.
              fillHeight ? "h-[calc(100dvh-8rem)]" : "h-[420px]"
            )}
          />
        </ZoomableEmbedViewport>
      ) : (
        <pre className="whitespace-pre-wrap break-all text-xs font-mono text-foreground">
          {source}
        </pre>
      )}
    </>
  )
}

function PugEmbed({ source, fillHeight = false }: { source: string; fillHeight?: boolean }) {
  const { mode } = useEmbedState()
  if (mode === "source") {
    return (
      <pre className="whitespace-pre-wrap break-all text-xs font-mono text-foreground">
        {source}
      </pre>
    )
  }

  const rendered = renderPug(source)

  if (!rendered.ok) {
    return (
      <div className="space-y-2">
        <div className="text-xs text-destructive">Pug render error</div>
        <pre className="whitespace-pre-wrap break-all text-xs font-mono text-destructive">
          {rendered.diagnostics.map((diagnostic) => (
            `${diagnostic.code} at ${diagnostic.line}:${diagnostic.column} ${diagnostic.message}`
          )).join("\n")}
        </pre>
        <pre className="whitespace-pre-wrap break-all text-xs font-mono text-foreground">
          {source}
        </pre>
      </div>
    )
  }

  return <HtmlEmbed source={rendered.html} fillHeight={fillHeight} />
}

function RemoteEmbed({ format, source }: { format: string; source: string }) {
  const { mode, zoom, adjustZoom } = useEmbedState()
  const embedUrl = normalizeRemoteEmbedSource(format, source)

  return (
    <>
      {mode === "render" && embedUrl ? (
        <ZoomableEmbedViewport zoom={zoom} adjustZoom={adjustZoom}>
          <iframe
            data-remote-embed="true"
            data-remote-embed-url={embedUrl}
            src={embedUrl}
            title="Embedded content"
            sandbox="allow-scripts allow-same-origin"
            referrerPolicy="no-referrer"
            className="block h-[420px] w-full min-w-[720px] border-0 bg-background sm:min-w-0"
          />
        </ZoomableEmbedViewport>
      ) : (
        <div className="space-y-2">
          {!embedUrl ? (
            <div className="text-xs text-destructive">Embed URL is invalid or unsupported</div>
          ) : null}
          <pre className="whitespace-pre-wrap break-all text-xs font-mono text-foreground">
            {embedUrl ?? source}
          </pre>
        </div>
      )}
    </>
  )
}

function findTagEnd(source: string, start: number): number {
  let quote: string | null = null

  for (let index = start; index < source.length; index += 1) {
    const char = source[index]
    if (quote) {
      if (char === quote) {
        quote = null
      } else if (char === "\\") {
        index += 1
      }
      continue
    }

    if (char === "\"" || char === "'") {
      quote = char
      continue
    }

    if (char === ">") {
      return index
    }
  }

  return -1
}

function readSvgTag(
  source: string,
  start: number
): { name: string; closing: boolean; selfClosing: boolean; end: number } | null {
  const end = findTagEnd(source, start + 1)
  if (end === -1) {
    return null
  }

  const raw = source.slice(start + 1, end).trim()
  if (!raw) {
    return null
  }

  const closing = raw.startsWith("/")
  const body = closing ? raw.slice(1).trim() : raw
  const nameMatch = body.match(/^([A-Za-z][\w:-]*)\b/)
  if (!nameMatch) {
    return null
  }

  const name = nameMatch[1]
  const selfClosing = !closing && /\/\s*$/.test(body)
  return { name, closing, selfClosing, end: end + 1 }
}

function createHtmlEmbedDocument(source: string): string {
  const trimmed = source.trim()
  if (!trimmed) {
    return createStandaloneHtmlDocument("")
  }

  if (!looksLikeHtmlDocument(trimmed)) {
    return createStandaloneHtmlDocument(trimmed)
  }

  return injectEmbedShellIntoDocument(trimmed)
}

function createStandaloneHtmlDocument(bodyMarkup: string): string {
  return `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />${createTailwindBootstrapTag()}<style>${DEFAULT_EMBED_STYLE}</style></head><body>${bodyMarkup}</body></html>`
}

function createTailwindBootstrapTag(): string {
  return `<script src="${TAILWIND_BROWSER_SCRIPT_URL}"></script>`
}

function looksLikeHtmlDocument(source: string): boolean {
  return /<!doctype html/i.test(source) || /<html[\s>]/i.test(source) || /<head[\s>]/i.test(source)
}

function injectEmbedShellIntoDocument(source: string): string {
  const withHead = /<head[\s>]/i.test(source)
    ? source
    : source.replace(/<html([^>]*)>/i, `<html$1><head></head>`)

  const withTailwind = withHead.includes(TAILWIND_BROWSER_SCRIPT_URL)
    ? withHead
    : withHead.replace(/<\/head>/i, `${createTailwindBootstrapTag()}</head>`)

  const withStyle = /<style[^>]*data-tinkaria-embed-base/i.test(withTailwind)
    ? withTailwind
    : withTailwind.replace(/<\/head>/i, `<style data-tinkaria-embed-base>${DEFAULT_EMBED_STYLE}</style></head>`)

  return withStyle
}

function SvgEmbed({ source }: { source: string }) {
  const { mode, zoom, adjustZoom } = useEmbedState()
  const parsed = parseSvgMarkup(source)
  const svgDataUrl = parsed.ok
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(parsed.markup)}`
    : null

  return (
    <>
      {mode === "render" && parsed.ok ? (
        <ZoomableEmbedViewport zoom={zoom} adjustZoom={adjustZoom} className="border-0 bg-transparent">
          <img
            data-svg-render="true"
            alt=""
            src={svgDataUrl ?? undefined}
            className="block h-auto max-h-[320px] max-w-none rounded-md border border-border/60 bg-background p-3 w-auto"
          />
          <script type="text/plain" data-svg-source="true">
            {source}
          </script>
        </ZoomableEmbedViewport>
      ) : (
        <div className="space-y-2">
          {!parsed.ok ? (
            <div className="text-xs text-destructive">{parsed.message}</div>
          ) : null}
          <pre className="whitespace-pre-wrap break-all text-xs font-mono text-foreground">
            {source}
          </pre>
        </div>
      )}
    </>
  )
}

function MermaidDiagram({ source }: { source: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const { mode, zoom, adjustZoom } = useEmbedState()

  useEffect(() => {
    let cancelled = false
    if (mode !== "render") return () => {
      cancelled = true
    }

    async function render() {
      const container = containerRef.current
      if (!container) return

      try {
        setError(null)
        const mermaid = await import("mermaid")
        mermaid.default.initialize({
          startOnLoad: false,
          theme: "default",
          securityLevel: "strict",
        })

        // crypto.randomUUID() is undefined in insecure contexts (e.g. http
        // over a LAN/Tailscale IP), which threw here and surfaced as
        // "Diagram render error". generateUUID() falls back safely.
        const id = `mermaid-${generateUUID().slice(0, 8)}`
        const { svg } = await mermaid.default.render(id, source)
        if (!cancelled) {
          container.innerHTML = svg
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    }

    void render()
    return () => {
      cancelled = true
    }
  }, [mode, source])

  if (error) {
    return (
      <div>
        <div className="mb-1 text-xs text-destructive">Diagram render error</div>
        <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
          {source}
        </pre>
      </div>
    )
  }

  if (mode === "source") {
    return (
      <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
        {source}
      </pre>
    )
  }

  return (
    <ZoomableEmbedViewport zoom={zoom} adjustZoom={adjustZoom} className="border-0 bg-transparent">
      <div
        ref={containerRef}
        data-mermaid-source={source}
        className="inline-flex min-h-[60px] min-w-full items-center justify-center [&_svg]:h-auto [&_svg]:max-w-none"
      />
    </ZoomableEmbedViewport>
  )
}
