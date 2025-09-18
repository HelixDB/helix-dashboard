"use client"

import { useState, useMemo, useCallback } from 'react'
import { ChevronRight, ChevronDown, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface OptimizedJsonViewerProps {
    data: string
    maxInitialItems?: number
}

// Component for individual values with copy functionality
const JsonValue = ({ value, rawValue }: { value: string; rawValue: string }) => {
    const [copied, setCopied] = useState(false)
    
    const handleCopy = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        navigator.clipboard.writeText(rawValue)
        setCopied(true)
        setTimeout(() => setCopied(false), 800)
    }, [rawValue])
    
    return (
        <span
            onClick={handleCopy}
            className={`cursor-pointer rounded px-1 transition-all duration-200 ${
                copied ? 'bg-green-500/20 ring-1 ring-green-500/50' : 'hover:bg-accent'
            }`}
            title={copied ? "Copied!" : "Click to copy"}
            style={{ color: copied ? '#76946A' : '#98BB6C' }}
        >
            {value}
        </span>
    )
}

// Collapsible array component with pagination
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CollapsibleArray = ({ items, needsComma = false }: { items: any[]; needsComma?: boolean }) => {
    const [isExpanded, setIsExpanded] = useState(false)
    const [loadedCount, setLoadedCount] = useState(100)
    
    const displayedItems = useMemo(() => 
        isExpanded ? items.slice(0, loadedCount) : [], 
        [items, isExpanded, loadedCount]
    )
    
    const loadMore = useCallback(() => {
        setLoadedCount(prev => Math.min(prev + 100, items.length))
    }, [items.length])
    
    // Handle empty arrays
    if (items.length === 0) {
        return <span>[]</span>
    }
    
    return (
        <span>
            {!isExpanded ? (
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="inline-flex items-center gap-1 hover:bg-accent rounded px-1 transition-colors"
                >
                    <ChevronRight className="h-3 w-3" />
                    <span>[{items.length} {items.length === 1 ? 'item' : 'items'}]{needsComma ? "," : ""}</span>
                </button>
            ) : (
                <>
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="inline-flex items-center hover:bg-accent rounded px-1 transition-colors"
                    >
                        <ChevronDown className="h-3 w-3" />
                    </button>
                    <span>[</span>
                    {displayedItems.length > 0 && (
                        <div className="ml-4 mt-1">
                            {displayedItems.map((item, index) => (
                                <div key={index} className="my-0.5">
                                    <span className="text-muted-foreground mr-2">{index}:</span>
                                    <JsonNode value={item} needsComma={index < displayedItems.length - 1 || loadedCount < items.length} />
                                </div>
                            ))}
                            
                            {loadedCount < items.length && (
                                <div className="my-0.5">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={loadMore}
                                        className="h-6 text-xs text-muted-foreground"
                                    >
                                        ... Load {Math.min(100, items.length - loadedCount)} more items
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                    <div>]{needsComma ? "," : ""}</div>
                </>
            )}
        </span>
    )
}

// Collapsible object component
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CollapsibleObject = ({ obj, name, needsComma = false }: { obj: Record<string, any>; name?: string; needsComma?: boolean }) => {
    const [isExpanded, setIsExpanded] = useState(name === undefined) // Root object expanded by default
    
    const entries = Object.entries(obj)
    
    if (entries.length === 0) return <span>{'{}'}</span>
    
    return (
        <span>
            {!isExpanded ? (
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="inline-flex items-center gap-1 hover:bg-accent rounded px-1 transition-colors"
                >
                    <ChevronRight className="h-3 w-3" />
                    <span>{`{${entries.length} ${entries.length === 1 ? 'property' : 'properties'}}`}{needsComma ? "," : ""}</span>
                </button>
            ) : (
                <>
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="inline-flex items-center hover:bg-accent rounded px-1 transition-colors"
                    >
                        <ChevronDown className="h-3 w-3" />
                    </button>
                    <span>{'{'}</span>
                    {entries.length > 0 && (
                        <div className="ml-4 mt-1">
                            {entries.map(([key, value], index) => (
                                <div key={key} className="my-0.5">
                                    <span style={{ color: '#7E9CD8' }}>{`"${key}":`}</span>
                                    <span className="ml-2">
                                        <JsonNode value={value} needsComma={index < entries.length - 1} />
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                    <div>{'}'}{needsComma ? "," : ""}</div>
                </>
            )}
        </span>
    )
}

// Main node renderer
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const JsonNode = ({ value, needsComma = false }: { value: any; needsComma?: boolean }) => {
    if (value === null) {
        return <span className="text-gray-500">null{needsComma ? "," : ""}</span>
    }
    
    if (value === undefined) {
        return <span className="text-gray-500">undefined{needsComma ? "," : ""}</span>
    }
    
    if (typeof value === 'string') {
        return <span><JsonValue value={`"${value}"`} rawValue={value} />{needsComma ? "," : ""}</span>
    }
    
    if (typeof value === 'number' || typeof value === 'boolean') {
        return <span><JsonValue value={String(value)} rawValue={String(value)} />{needsComma ? "," : ""}</span>
    }
    
    if (Array.isArray(value)) {
        return <CollapsibleArray items={value} needsComma={needsComma} />
    }
    
    if (typeof value === 'object') {
        return <CollapsibleObject obj={value} needsComma={needsComma} />
    }
    
    return <span>{String(value)}{needsComma ? "," : ""}</span>
}

export function OptimizedJsonViewer({ data}: OptimizedJsonViewerProps) {
    const [copyAll, setCopyAll] = useState(false)
    
    const parsedData = useMemo(() => {
        try {
            // Use a reviver function to maintain order
            const parsed = JSON.parse(data)
            return parsed
        } catch {
            return null
        }
    }, [data])
    
    const handleCopyAll = useCallback(() => {
        navigator.clipboard.writeText(data)
        setCopyAll(true)
        setTimeout(() => setCopyAll(false), 2000)
    }, [data])
    
    if (!parsedData) {
        // Fallback for non-JSON data
        return (
            <pre
                onClick={handleCopyAll}
                className="text-sm whitespace-pre-wrap break-words font-mono cursor-pointer hover:bg-accent rounded p-2 transition-colors"
                title="Click to copy"
            >
                {data}
            </pre>
        )
    }
    
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
            <JsonNode value={parsedData} />
        </div>
    )
}