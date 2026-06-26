import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Copy text synchronously inside a user-gesture handler (click/mousedown). */
export function copyToClipboard(text: string): boolean {
  if (typeof document === "undefined") return false

  try {
    const textarea = document.createElement("textarea")
    textarea.value = text
    textarea.setAttribute("readonly", "")
    textarea.style.position = "fixed"
    textarea.style.top = "0"
    textarea.style.left = "0"
    textarea.style.width = "2em"
    textarea.style.height = "2em"
    textarea.style.padding = "0"
    textarea.style.border = "none"
    textarea.style.outline = "none"
    textarea.style.boxShadow = "none"
    textarea.style.background = "transparent"
    textarea.style.opacity = "0"
    document.body.appendChild(textarea)

    const selection = document.getSelection()
    const range =
      selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null

    textarea.focus()
    textarea.select()
    textarea.setSelectionRange(0, text.length)

    const ok = document.execCommand("copy")
    document.body.removeChild(textarea)

    if (range && selection) {
      selection.removeAllRanges()
      selection.addRange(range)
    }

    if (ok) return true
  } catch {
    // fall through to async API
  }

  try {
    void navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
