// Maps a file path to how its preview should render. Pure, UI-free so it can be
// unit-tested and shared between the preview modal and any caller that needs to
// know whether a touched file is previewable.

export type PreviewEmbedFormat = "html" | "svg" | "mermaid" | "d2" | "pug"

export type PreviewRenderer =
  | { kind: "markdown" }
  | { kind: "embed"; format: PreviewEmbedFormat }
  | { kind: "code"; language: string | null }
  | { kind: "unsupported" }

const EMBED_BY_EXTENSION: Record<string, PreviewEmbedFormat> = {
  html: "html",
  htm: "html",
  svg: "svg",
  mmd: "mermaid",
  mermaid: "mermaid",
  d2: "d2",
  pug: "pug",
}

const MARKDOWN_EXTENSIONS = new Set(["md", "markdown", "mdx"])

const CODE_EXTENSIONS = new Set([
  "ts", "tsx", "js", "jsx", "json", "css", "scss", "xml", "sh", "bash", "zsh",
  "py", "rs", "go", "java", "rb", "php", "yml", "yaml", "sql",
])

// Files we can read as text but shouldn't try to render as text — show a clear
// "preview unavailable" state instead of garbled bytes.
const UNSUPPORTED_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "avif", "ico", "bmp", "tiff",
  "pdf", "zip", "gz", "tar", "rar", "7z",
  "woff", "woff2", "ttf", "otf", "eot",
  "mp4", "mov", "webm", "mp3", "wav", "ogg", "flac",
  "exe", "dll", "so", "dylib", "bin", "wasm", "class", "jar",
])

function getExtension(path: string): string {
  const base = path.split("/").pop() ?? ""
  if (!base.includes(".")) return ""
  return base.split(".").pop()?.toLowerCase() ?? ""
}

export function inferPreviewRenderer(path: string): PreviewRenderer {
  const extension = getExtension(path)

  if (MARKDOWN_EXTENSIONS.has(extension)) {
    return { kind: "markdown" }
  }

  const embedFormat = EMBED_BY_EXTENSION[extension]
  if (embedFormat) {
    return { kind: "embed", format: embedFormat }
  }

  if (UNSUPPORTED_EXTENSIONS.has(extension)) {
    return { kind: "unsupported" }
  }

  return { kind: "code", language: CODE_EXTENSIONS.has(extension) ? extension : null }
}
