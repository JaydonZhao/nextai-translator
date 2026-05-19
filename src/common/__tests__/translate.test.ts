import { describe, expect, it } from 'vitest'
import { buildExplainPrompts, QuoteProcessor } from '../translate'

describe('QuoteProcessor', () => {
    it('should return the string without quote', () => {
        const quoteProcessor = new QuoteProcessor()
        const deltas = [
            ...quoteProcessor.quoteStart.split(''),
            'T',
            'h',
            'i',
            's',
            ' ',
            'i',
            's',
            ' ',
            'a',
            ' ',
            't',
            'e',
            's',
            't',
            '.',
            ...quoteProcessor.quoteEnd.split(''),
        ]

        let targetText = ''
        for (const delta of deltas) {
            targetText += quoteProcessor.processText(delta)
        }

        expect(targetText).toEqual('This is a test.')
    })

    it('should return the string without quote', () => {
        const quoteProcessor = new QuoteProcessor()
        const deltas = [
            ...quoteProcessor.quoteStart.split(''),
            'T',
            'h',
            'i',
            's',
            ' ',
            'i',
            's',
            ' ',
            'a',
            ' ',
            't',
            'e',
            's',
            't',
            '.',
            '(',
            ')' + quoteProcessor.quoteEnd.split('')[0],
            ...quoteProcessor.quoteEnd.split('').slice(1),
        ]

        let targetText = ''
        for (const delta of deltas) {
            targetText += quoteProcessor.processText(delta)
        }

        expect(targetText).toEqual('This is a test.()')
    })

    it('should return the string without quote', () => {
        const quoteProcessor = new QuoteProcessor()
        const text = 'This is a test.'
        const targetText = quoteProcessor.processText(quoteProcessor.quoteStart + text + quoteProcessor.quoteEnd)
        expect(targetText).toEqual(text)
    })

    it('should return the string without quote', () => {
        const quoteProcessor = new QuoteProcessor()
        const text = 'This is a test.'
        const targetText = quoteProcessor.processText(
            `${quoteProcessor.quoteStart}This${quoteProcessor.quoteStart} is ${quoteProcessor.quoteEnd}a${quoteProcessor.quoteStart} test.${quoteProcessor.quoteEnd}`
        )
        expect(targetText).toEqual(text)
    })

    it('should return the same string if no quote exists', () => {
        const quoteProcessor = new QuoteProcessor()
        const deltas = [
            '<X',
            '1',
            '2',
            'Y>',
            'T',
            'h',
            'i',
            's',
            ' ',
            'i',
            's',
            ' ',
            'a',
            ' ',
            't',
            'e',
            's',
            't',
            '.',
            '</',
            'X',
            '1',
            '2',
            'Y>',
        ]
        let targetText = ''
        for (const delta of deltas) {
            targetText += quoteProcessor.processText(delta)
        }

        expect(targetText).toEqual('<X12Y>This is a test.</X12Y>')
    })

    it('should return the same string if no quote exists', () => {
        const quoteProcessor = new QuoteProcessor()
        const text = '<X12Y>This is a test.</X12Y>'
        const targetText = quoteProcessor.processText(text)
        expect(targetText).toEqual(text)
    })

    it('should return the same string if no quote exists', () => {
        const quoteProcessor = new QuoteProcessor()
        const text = `This is${quoteProcessor.quoteStart.slice(0, quoteProcessor.quoteStart.length - 1)} a test.`
        const targetText = quoteProcessor.processText(text)
        expect(targetText).toEqual(text)
    })

    it('do not remove the sub part of quote', () => {
        const quoteProcessor = new QuoteProcessor()
        const text = `This is${quoteProcessor.quoteStart.slice(0, quoteProcessor.quoteStart.length - 1)} a test.`
        const targetText = quoteProcessor.processText(quoteProcessor.quoteStart + text + quoteProcessor.quoteEnd)
        expect(targetText).toEqual(text)
    })

    it('do not remove the sub part of quote', () => {
        const quoteProcessor = new QuoteProcessor()
        const text = `This is${quoteProcessor.quoteEnd.slice(0, quoteProcessor.quoteEnd.length - 1)} a test.`
        const targetText = quoteProcessor.processText(quoteProcessor.quoteStart + text + quoteProcessor.quoteEnd)
        expect(targetText).toEqual(text)
    })

    it('do not remove the sub part of quote', () => {
        const quoteProcessor = new QuoteProcessor()
        const text = `This is${quoteProcessor.quoteStart.slice(
            0,
            quoteProcessor.quoteStart.length - 1
        )} a${quoteProcessor.quoteStart.slice(
            0,
            quoteProcessor.quoteStart.length - 2
        )} te${quoteProcessor.quoteEnd.slice(0, quoteProcessor.quoteEnd.length - 1)}st${quoteProcessor.quoteEnd.slice(
            0,
            quoteProcessor.quoteEnd.length - 2
        )}.`
        const targetText = quoteProcessor.processText(quoteProcessor.quoteStart + text + quoteProcessor.quoteEnd)
        expect(targetText).toEqual(text)
    })
})

describe('buildExplainPrompts', () => {
    const baseQuery = {
        text: 'The quick brown fox jumps over the lazy dog.',
    }

    it('default branch: produces a full-text explain prompt when selectedWord is absent', () => {
        const result = buildExplainPrompts(baseQuery, 'English', 'Chinese')

        expect(result.rolePrompt).toMatch(/explain/i)
        expect(result.rolePrompt).toContain('Chinese')
        expect(result.commandPrompt).toMatch(/markdown/i)
        expect(result.commandPrompt).toContain('Chinese')
        expect(result.contentPrompt).toBe(baseQuery.text)
    })

    it('fragment branch: when selectedWord is set, prompt explains the fragment using full text as context', () => {
        const query = {
            text: 'The quick brown fox jumps over the lazy dog.',
            selectedWord: 'lazy dog',
        }
        const result = buildExplainPrompts(query, 'English', 'Chinese')

        expect(result.rolePrompt).toMatch(/fragment/i)
        expect(result.rolePrompt).toMatch(/context/i)
        expect(result.rolePrompt).toContain('English')
        expect(result.rolePrompt).toContain('Chinese')
        expect(result.commandPrompt).toMatch(/yes|understand/i)
        expect(result.contentPrompt).toContain('the original text is:')
        expect(result.contentPrompt).toContain(query.text)
        expect(result.contentPrompt).toContain('the fragment is:')
        expect(result.contentPrompt).toContain(query.selectedWord)
    })

    it('writing mode: ignores selectedWord and stays on the default full-text branch', () => {
        const query = {
            text: 'The quick brown fox jumps over the lazy dog.',
            selectedWord: 'lazy dog',
            writing: true,
        }
        const result = buildExplainPrompts(query, 'English', 'Chinese')

        expect(result.contentPrompt).toBe(query.text)
        expect(result.contentPrompt).not.toContain('the fragment is:')
        expect(result.commandPrompt).toMatch(/markdown/i)
    })
})
