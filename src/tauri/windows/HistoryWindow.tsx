import { useCallback, useEffect, useState } from 'react'
import { Window } from '../components/Window'
import { TranslationHistory } from '../../common/components/TranslationHistory'
import { useLiveQuery } from 'dexie-react-hooks'
import { actionService } from '../../common/services/action'
import { HistoryItem } from '../../common/internal-services/db'
import { emit } from '@tauri-apps/api/event'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { useMemoWindow } from '../../common/hooks/useMemoWindow'
import { trackEvent } from '@aptabase/tauri'
import { HISTORY_WINDOW_SCOPE_KEY } from '../../common/history-sidebar'

export function HistoryWindow() {
    useMemoWindow({ size: true, position: true, show: true })

    // Read (and clear) the action scope handed off by the sidebar's detach action (FR-19).
    const [initialScope] = useState<{ actionId?: number; actionMode?: HistoryItem['actionMode'] }>(() => {
        try {
            const raw = localStorage.getItem(HISTORY_WINDOW_SCOPE_KEY)
            if (raw) {
                localStorage.removeItem(HISTORY_WINDOW_SCOPE_KEY)
                return JSON.parse(raw)
            }
        } catch (error) {
            console.error('Failed to read history window scope', error)
        }
        return {}
    })

    useEffect(() => {
        trackEvent('screen_view', { name: 'History' })
    }, [])

    const actions = useLiveQuery(() => actionService.list(), [])
    const appWindow = WebviewWindow.getCurrent()

    const handleClose = useCallback(() => {
        void appWindow.close()
    }, [appWindow])

    const handleRestore = useCallback((item: HistoryItem) => {
        void emit('history:restore', item)
    }, [])

    return (
        <Window>
            <TranslationHistory
                variant='window'
                isOpen
                actions={actions ?? []}
                initialActionId={initialScope.actionId}
                initialActionMode={initialScope.actionMode}
                onClose={handleClose}
                onRestore={handleRestore}
            />
        </Window>
    )
}
