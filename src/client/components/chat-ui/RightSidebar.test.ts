import { describe, expect, mock, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { RightSidebar } from "./RightSidebar"

const defaultProps = {
  touchedFiles: [],
  onOpenFile: () => {},
} as const

describe("RightSidebar", () => {
  test("renders the placeholder copy", () => {
    const markup = renderToStaticMarkup(RightSidebar({ onClose: () => {}, ...defaultProps }))

    expect(markup).toContain("Touched files")
    expect(markup).toContain('data-ui-id="chat.right-sidebar"')
    expect(markup).toContain('data-ui-c3="c3-115"')
    expect(markup).toContain('data-ui-c3-label="right-sidebar"')
  })

  test("renders the close affordance", () => {
    const onClose = mock(() => {})
    const markup = renderToStaticMarkup(RightSidebar({ onClose, ...defaultProps }))

    expect(markup).toContain("Close right sidebar")
  })
})
