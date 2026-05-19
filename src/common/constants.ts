import { TranslateMode } from './translate'
import { ActionOutputRenderingFormat } from './internal-services/db'

export const CUSTOM_MODEL_ID = '__custom__'
export const PREFIX = '__yetone-nextai-translator'
export const builtinActionModes: {
    name: string
    mode: Exclude<TranslateMode, 'big-bang'>
    icon: string
    outputRenderingFormat?: ActionOutputRenderingFormat
}[] = [
    {
        name: 'Translate',
        mode: 'translate',
        icon: 'MdOutlineGTranslate',
    },
    {
        name: 'Polishing',
        mode: 'polishing',
        icon: 'MdPalette',
    },
    {
        name: 'Summarize',
        mode: 'summarize',
        icon: 'MdOutlineSummarize',
    },
    {
        name: 'Analyze',
        mode: 'analyze',
        icon: 'MdOutlineAnalytics',
    },
    {
        name: 'Explain Code',
        mode: 'explain-code',
        icon: 'MdCode',
    },
    {
        name: 'Explain',
        mode: 'explain',
        icon: 'MdOutlineLightbulb',
        outputRenderingFormat: 'markdown',
    },
]
export const chatgptArkoseReqParams = 'cgb=vhwi'
