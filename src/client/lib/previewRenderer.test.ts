import { describe, expect, test } from "bun:test"
import { inferPreviewRenderer } from "./previewRenderer"

describe("inferPreviewRenderer", () => {
  test("markdown extensions", () => {
    for (const path of ["docs/plan.md", "a.markdown", "notes.mdx"]) {
      expect(inferPreviewRenderer(path)).toEqual({ kind: "markdown" })
    }
  })

  test("html renders as embed/html", () => {
    expect(inferPreviewRenderer("page.html")).toEqual({ kind: "embed", format: "html" })
    expect(inferPreviewRenderer("page.htm")).toEqual({ kind: "embed", format: "html" })
  })

  test("svg renders as embed/svg", () => {
    expect(inferPreviewRenderer("icon.svg")).toEqual({ kind: "embed", format: "svg" })
  })

  test("mermaid extensions render as embed/mermaid", () => {
    expect(inferPreviewRenderer("flow.mmd")).toEqual({ kind: "embed", format: "mermaid" })
    expect(inferPreviewRenderer("flow.mermaid")).toEqual({ kind: "embed", format: "mermaid" })
  })

  test("d2 renders as embed/d2", () => {
    expect(inferPreviewRenderer("diagram.d2")).toEqual({ kind: "embed", format: "d2" })
  })

  test("pug renders as embed/pug", () => {
    expect(inferPreviewRenderer("template.pug")).toEqual({ kind: "embed", format: "pug" })
  })

  test("known code extensions render as code with language", () => {
    expect(inferPreviewRenderer("src/app.ts")).toEqual({ kind: "code", language: "ts" })
    expect(inferPreviewRenderer("data.json")).toEqual({ kind: "code", language: "json" })
    expect(inferPreviewRenderer("main.py")).toEqual({ kind: "code", language: "py" })
  })

  test("unknown text extension falls back to code with null language", () => {
    expect(inferPreviewRenderer("server.conf")).toEqual({ kind: "code", language: null })
  })

  test("no extension falls back to code with null language", () => {
    expect(inferPreviewRenderer("Dockerfile")).toEqual({ kind: "code", language: null })
    expect(inferPreviewRenderer("README")).toEqual({ kind: "code", language: null })
  })

  test("binary and image extensions are unsupported", () => {
    for (const path of ["logo.png", "photo.jpg", "doc.pdf", "archive.zip", "font.woff2", "clip.mp4", "lib.so"]) {
      expect(inferPreviewRenderer(path)).toEqual({ kind: "unsupported" })
    }
  })

  test("extension match is case-insensitive", () => {
    expect(inferPreviewRenderer("PLAN.MD")).toEqual({ kind: "markdown" })
    expect(inferPreviewRenderer("PAGE.HTML")).toEqual({ kind: "embed", format: "html" })
    expect(inferPreviewRenderer("LOGO.PNG")).toEqual({ kind: "unsupported" })
  })

  test("resolves extension from full path with directories and dots", () => {
    expect(inferPreviewRenderer("/abs/path/to/my.plan.v2.md")).toEqual({ kind: "markdown" })
  })
})
