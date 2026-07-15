// Copyright 2019-2024 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

import { invoke } from "@tauri-apps/api/core"
import { type as ostype } from "@tauri-apps/plugin-os"
import { createSignal } from "solid-js"

const OS_NAME = ostype()

const [webviewZoom, setWebviewZoom] = createSignal(1)

const MAX_ZOOM_LEVEL = 10
const MIN_ZOOM_LEVEL = 0.2

const ZOOM_STEP = 0.2

const clamp = (value: number) => Math.min(Math.max(value, MIN_ZOOM_LEVEL), MAX_ZOOM_LEVEL)

const applyZoom = (next: number) => {
  setWebviewZoom(next)
  void invoke("plugin:webview|set_webview_zoom", {
    value: next,
  })
}

// Named zoom controls, shared by the Ctrl/Cmd+± keyboard shortcuts and the desktop menu's
// zoom actions (`runDesktopMenuAction`) so both paths clamp identically.
const zoomIn = () => applyZoom(clamp(webviewZoom() + ZOOM_STEP))
const zoomOut = () => applyZoom(clamp(webviewZoom() - ZOOM_STEP))
const resetZoom = () => applyZoom(1)

window.addEventListener("keydown", (event) => {
  if (!(OS_NAME === "macos" ? event.metaKey : event.ctrlKey)) return

  if (event.key === "-") zoomOut()
  if (event.key === "=" || event.key === "+") zoomIn()
  if (event.key === "0") resetZoom()
})

export { webviewZoom, zoomIn, zoomOut, resetZoom }
