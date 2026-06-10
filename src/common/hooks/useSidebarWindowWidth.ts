import { useCallback, useRef } from 'react'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { currentMonitor } from '@tauri-apps/api/window'
import { LogicalSize } from '@tauri-apps/api/dpi'
import { windowWidthOnShow, windowWidthOnHide, windowWidthOnResize } from '../history-sidebar'

// Manages the translator window's width as the sidebar is shown / hidden / resized.
// All numeric decisions come from the unit-tested helpers in ../history-sidebar.
export function useSidebarWindowWidth() {
    // The logical window width to restore to when the sidebar is hidden. Null when the
    // sidebar is not currently responsible for any extra width (e.g. right after a hide,
    // or on a fresh launch where the OS-restored window already includes the sidebar).
    const baseWidthRef = useRef<number | null>(null)

    const readMetrics = useCallback(async () => {
        const win = WebviewWindow.getCurrent()
        const factor = await win.scaleFactor()
        const inner = await win.innerSize()
        const width = inner.width / factor
        const height = inner.height / factor
        const monitor = await currentMonitor()
        const screenAvail = monitor ? monitor.size.width / factor : Number.POSITIVE_INFINITY
        return { win, width, height, screenAvail }
    }, [])

    const showSidebar = useCallback(
        async (sidebarWidth: number) => {
            const { win, width, height, screenAvail } = await readMetrics()
            if (baseWidthRef.current === null) {
                baseWidthRef.current = width
            }
            const target = windowWidthOnShow(width, sidebarWidth, screenAvail)
            await win.setSize(new LogicalSize(Math.round(target), Math.round(height)))
        },
        [readMetrics]
    )

    const hideSidebar = useCallback(
        async (sidebarWidth: number) => {
            const { win, width, height } = await readMetrics()
            const target = windowWidthOnHide(width, sidebarWidth, baseWidthRef.current)
            baseWidthRef.current = null
            await win.setSize(new LogicalSize(Math.round(target), Math.round(height)))
        },
        [readMetrics]
    )

    const resizeSidebar = useCallback(
        async (deltaWidth: number) => {
            const { win, width, height, screenAvail } = await readMetrics()
            const target = windowWidthOnResize(width, deltaWidth, screenAvail)
            await win.setSize(new LogicalSize(Math.round(target), Math.round(height)))
        },
        [readMetrics]
    )

    return { showSidebar, hideSidebar, resizeSidebar }
}
