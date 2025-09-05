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
const CollapsibleArray = ({ items }: { items: any[] }) => {
    const [isExpanded, setIsExpanded] = useState(false)
    const [loadedCount, setLoadedCount] = useState(100)
    
    const displayedItems = useMemo(() => 
        isExpanded ? items.slice(0, loadedCount) : [], 
        [items, isExpanded, loadedCount]
    )
    
    const loadMore = useCallback(() => {
        setLoadedCount(prev => Math.min(prev + 100, items.length))
    }, [items.length])
    
    return (
        <div className="inline-block">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="inline-flex items-center gap-1 hover:bg-accent rounded px-1 transition-colors"
            >
                {isExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                ) : (
                    <ChevronRight className="h-3 w-3" />
                )}
                <span className="text-muted-foreground">
                    [{items.length} items]
                </span>
            </button>
            
            {isExpanded && (
                <div className="ml-4 mt-1">
                    {displayedItems.map((item, index) => (
                        <div key={index} className="my-0.5">
                            <span className="text-muted-foreground mr-2">{index}:</span>
                            <JsonNode value={item} />
                            {index < displayedItems.length - 1 && <span>,</span>}
                        </div>
                    ))}
                    
                    {loadedCount < items.length && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={loadMore}
                            className="mt-2 h-6 text-xs"
                        >
                            Load {Math.min(100, items.length - loadedCount)} more...
                        </Button>
                    )}
                </div>
            )}
        </div>
    )
}

// Collapsible object component
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CollapsibleObject = ({ obj, name }: { obj: Record<string, any>; name?: string }) => {
    const [isExpanded, setIsExpanded] = useState(name === undefined) // Root object expanded by default
    
    const entries = Object.entries(obj)
    
    if (entries.length === 0) return <span>{'{}'}</span>
    
    return (
        <div className="inline-block">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="inline-flex items-center gap-1 hover:bg-accent rounded px-1 transition-colors"
            >
                {isExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                ) : (
                    <ChevronRight className="h-3 w-3" />
                )}
                <span className="text-muted-foreground">
                    {`{${entries.length} ${entries.length === 1 ? 'property' : 'properties'}}`}
                </span>
            </button>
            
            {isExpanded && (
                <div className="ml-4 mt-1">
                    {entries.map(([key, value], index) => (
                        <div key={key} className="my-0.5">
                            <span style={{ color: '#7E9CD8' }}>{`"${key}":`}</span>
                            <span className="ml-2">
                                <JsonNode value={value} />
                                {index < entries.length - 1 && <span>,</span>}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// Main node renderer
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const JsonNode = ({ value }: { value: any }) => {
    if (value === null) {
        return <span className="text-gray-500">null</span>
    }
    
    if (value === undefined) {
        return <span className="text-gray-500">undefined</span>
    }
    
    if (typeof value === 'string') {
        return <JsonValue value={`"${value}"`} rawValue={value} />
    }
    
    if (typeof value === 'number' || typeof value === 'boolean') {
        return <JsonValue value={String(value)} rawValue={String(value)} />
    }
    
    if (Array.isArray(value)) {
        // For small arrays, render inline
        if (value.length <= 3) {
            return (
                <span>
                    [
                    {value.map((item, index) => (
                        <span key={index}>
                            <JsonNode value={item} />
                            {index < value.length - 1 && ', '}
                        </span>
                    ))}
                    ]
                </span>
            )
        }
        return <CollapsibleArray items={value} />
    }
    
    if (typeof value === 'object') {
        return <CollapsibleObject obj={value} />
    }
    
    return <span>{String(value)}</span>
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