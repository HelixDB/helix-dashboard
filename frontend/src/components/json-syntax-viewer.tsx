"use client"

import { useState, useMemo, useCallback } from 'react'
import { Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface JsonSyntaxViewerProps {
    data: string
}

export function JsonSyntaxViewer({ data }: JsonSyntaxViewerProps) {
    const [copyAll, setCopyAll] = useState(false)
    const [copiedValues, setCopiedValues] = useState<Set<string>>(new Set())

    const handleCopyAll = useCallback(() => {
        navigator.clipboard.writeText(data)
        setCopyAll(true)
        setTimeout(() => setCopyAll(false), 2000)
    }, [data])

    const handleCopyValue = useCallback((value: string, id: string) => {
        navigator.clipboard.writeText(value)
        setCopiedValues(prev => new Set(prev).add(id))
        setTimeout(() => {
            setCopiedValues(prev => {
                const next = new Set(prev)
                next.delete(id)
                return next
            })
        }, 800)
    }, [])

    const formattedContent = useMemo(() => {
        try {
            // Parse to validate and format
            const parsed = JSON.parse(data)
            const formatted = JSON.stringify(parsed, null, 2)
            
            // Tokenize the JSON string while preserving order
            let valueId = 0
            const tokens = formatted.split(/("(?:[^"\\]|\\.)*")|([,:\[\]{}])|(\s+)/)
                .filter(token => token !== undefined)
                .map((token, index) => {
                    // Skip whitespace and structural characters
                    if (!token || /^[\s,:\[\]{}]$/.test(token)) {
                        return { type: 'structural', value: token }
                    }
                    
                    // String tokens (keys or values)
                    if (token.startsWith('"') && token.endsWith('"')) {
                        const unquoted = token.slice(1, -1)
                        const isKey = index > 0 && 
                            formatted.split(/("(?:[^"\\]|\\.)*")|([,:\[\]{}])|(\s+)/)
                                .filter(t => t !== undefined)
                                .slice(index + 1)
                                .find(t => t && t.trim()) === ':'
                        
                        if (isKey) {
                            return { type: 'key', value: token }
                        } else {
                            const id = `value-${valueId++}`
                            return { type: 'string', value: token, rawValue: unquoted, id }
                        }
                    }
                    
                    // Number, boolean, null
                    if (/^(true|false|null|-?\d+\.?\d*)$/.test(token)) {
                        const id = `value-${valueId++}`
                        return { type: 'primitive', value: token, rawValue: token, id }
                    }
                    
                    return { type: 'unknown', value: token }
                })
            
            return tokens.map((token, index) => {
                switch (token.type) {
                    case 'structural':
                        return <span key={index}>{token.value}</span>
                    
                    case 'key':
                        return <span key={index} style={{ color: '#7E9CD8' }}>{token.value}</span>
                    
                    case 'string':
                    case 'primitive':
                        const isCopied = copiedValues.has(token.id!)
                        return (
                            <span
                                key={index}
                                onClick={() => handleCopyValue(token.rawValue!, token.id!)}
                                className={`cursor-pointer rounded px-1 transition-all duration-200 ${
                                    isCopied ? 'bg-green-500/20 ring-1 ring-green-500/50' : 'hover:bg-accent'
                                }`}
                                title={isCopied ? "Copied!" : "Click to copy"}
                                style={{ color: isCopied ? '#76946A' : '#98BB6C' }}
                            >
                                {token.value}
                            </span>
                        )
                    
                    default:
                        return <span key={index}>{token.value}</span>
                }
            })
        } catch (e) {
            // Fallback for invalid JSON
            return (
                <pre
                    onClick={handleCopyAll}
                    className="cursor-pointer hover:bg-accent rounded p-2 transition-colors"
                    title="Click to copy"
                >
                    {data}
                </pre>
            )
        }
    }, [data, copiedValues, handleCopyValue, handleCopyAll])

    return (
        <div className="font-mono text-sm">
            <div className="flex justify-end mb-2">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyAll}
                    className="h-6 text-xs"
                >
                    {copyAll ? (
                        <>
                            <Check className="h-3 w-3 mr-1" />
                            Copied!
                        </>
                    ) : (
                        <>
                            <Copy className="h-3 w-3 mr-1" />
                            Copy All
                        </>
                    )}
                </Button>
            </div>
            <pre className="whitespace-pre-wrap">{formattedContent}</pre>
        </div>
    )
}