"use client"

import { Fragment, useState, useEffect, useRef, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
    SidebarInset,
    SidebarProvider,
    SidebarTrigger,
} from "@/components/ui/sidebar"
import { Send, Copy, Download, ArrowLeft, Search, Filter, X, Plus, Edit2, CheckSquare, Square, SquarePen, FileText, RefreshCw, ChevronDown, ChevronRight } from "lucide-react"
import { getEndpoints, clearEndpointsCache, convertParamValue } from "@/utils/endpoints"
import { JsonTable } from "@/components/json-table"
import { OptimizedJsonViewer } from "@/components/optimized-json-viewer"
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip"

interface Parameter {
    name: string;
    type: string;
    param_type: string;
    required: boolean;
    description: string;
}

const inferHttpMethod = (endpointName: string, originalMethod?: string): string => {
    if (originalMethod && originalMethod !== 'GET') {
        return originalMethod;
    }

    const name = endpointName.toLowerCase();

    const methodPatterns = {
        GET: [
            /^get/, /^fetch/, /^retrieve/, /^find/, /^search/, /^list/, /^show/,
            /^read/, /^view/, /^select/, /^query/, /^load/, /^check/
        ],
        POST: [
            /^post/, /^create/, /^add/, /^insert/, /^new/, /^register/,
            /^make/, /^build/, /^generate/, /^send/, /^submit/, /^save/
        ],
        PUT: [
            /^put/, /^update/, /^modify/, /^change/, /^edit/, /^replace/,
            /^set/, /^alter/, /^refresh/, /^sync/
        ],
        PATCH: [
            /^patch/, /^partial/, /^increment/, /^decrement/, /^toggle/
        ],
        DELETE: [
            /^delete/, /^remove/, /^destroy/, /^drop/, /^clear/,
            /^purge/, /^erase/, /^cancel/, /^revoke/
        ]
    };

    for (const [method, patterns] of Object.entries(methodPatterns)) {
        for (const pattern of patterns) {
            if (pattern.test(name)) {
                return method;
            }
        }
    }

    return originalMethod || 'GET';
}

interface EndpointConfig {
    name: string;
    method: string;
    url: string;
    description: string;
    params: Parameter[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body?: any;
}

// Response Panel component with proper scroll handling
const ResponsePanel = ({ loading, response }: { loading: boolean; response: string }) => {
    const scrollRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const scrollContainer = scrollRef.current
        if (!scrollContainer) return

        const handleWheel = (e: WheelEvent) => {
            const { scrollTop, scrollHeight, clientHeight } = scrollContainer
            const isAtTop = scrollTop === 0
            const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 1

            // If scrolling up at the top or down at the bottom, prevent default
            if ((e.deltaY < 0 && isAtTop) || (e.deltaY > 0 && isAtBottom)) {
                e.preventDefault()
                return
            }

            // Stop propagation to prevent page scroll
            e.stopPropagation()
        }

        // Add non-passive event listener
        scrollContainer.addEventListener('wheel', handleWheel, { passive: false })

        return () => {
            scrollContainer.removeEventListener('wheel', handleWheel)
        }
    }, [])

    return (
        <div
            ref={scrollRef}
            className="bg-muted/50 rounded-lg p-4 min-h-96 max-h-96 overflow-auto hide-scrollbar"
        >
            {loading ? (
                <div className="flex items-center justify-center h-full">
                    <div className="text-muted-foreground">Sending request...</div>
                </div>
            ) : response ? (
                <OptimizedJsonViewer data={response} />
            ) : (
                <div className="flex items-center justify-center h-full">
                    <div className="text-center text-muted-foreground">
                        <Send className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>Send a request to see the response</p>
                    </div>
                </div>
            )}
        </div>
    )
}



interface QueryTab {
    id: string
    endpointKey: string
    name: string
    url: string
    method: string
    params: Record<string, string>
    body: string
    response: string
    loading: boolean
    status: number | string | null
}

export default function QueriesPage() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const selectedEndpoint = searchParams.get("endpoint")

    // Dynamic endpoints state
    const [endpoints, setEndpoints] = useState<Record<string, EndpointConfig>>({})
    const [endpointsLoading, setEndpointsLoading] = useState(true)
    const [endpointsError, setEndpointsError] = useState<string | null>(null)

    // Tab management
    const [openTabs, setOpenTabs] = useState<QueryTab[]>([])
    const [activeTabId, setActiveTabId] = useState<string | null>(null)

    // Legacy state for backward compatibility with single query view
    const [url, setUrl] = useState("")
    const [method, setMethod] = useState("GET")
    const [params, setParams] = useState<Record<string, string>>({})
    const [body, setBody] = useState("")
    const [response, setResponse] = useState("")
    const [loading, setLoading] = useState(false)
    const [status, setStatus] = useState<number | string | null>(null)

    // Search and filter states
    const [searchTerm, setSearchTerm] = useState("")
    const [selectedTags, setSelectedTags] = useState<string[]>([])
    const [showFilters, setShowFilters] = useState(false)

    // Dynamic tags management
    const [endpointTags, setEndpointTags] = useState<Record<string, string[]>>({})
    const [editingTags, setEditingTags] = useState<string | null>(null)
    const [newTag, setNewTag] = useState("")

    // Method editing
    const [editingMethod, setEditingMethod] = useState<string | null>(null)
    const [endpointMethods, setEndpointMethods] = useState<Record<string, string>>({})

    // Collapsed methods
    const [collapsedMethods, setCollapsedMethods] = useState<Set<string>>(new Set())

    // Multi-select functionality
    const [isMultiSelectMode, setIsMultiSelectMode] = useState(false)
    const [selectedEndpoints, setSelectedEndpoints] = useState<string[]>([])
    const [bulkNewTag, setBulkNewTag] = useState("")
    const [showBulkActions, setShowBulkActions] = useState(false)

    const host = process.env.DOCKER_HOST_INTERNAL || 'localhost';
    const port = process.env.HELIX_PORT || 6969;
    const cloudUrl = process.env.HELIX_CLOUD_URL;
    
    const helixUrl = cloudUrl ? cloudUrl : `http://${host}:${port}`;

    // Load endpoints from backend
    const loadEndpoints = async () => {
        setEndpointsLoading(true)
        setEndpointsError(null)
        try {
            const dynamicEndpoints = await getEndpoints()
            if (Object.keys(dynamicEndpoints).length > 0) {
                const processedEndpoints: Record<string, EndpointConfig> = {}
                const inferredMethods: Record<string, string> = {}

                Object.entries(dynamicEndpoints).forEach(([key, endpoint]) => {
                    const inferredMethod = inferHttpMethod(endpoint.name, endpoint.method)
                    processedEndpoints[key] = {
                        ...endpoint,
                        method: inferredMethod
                    }

                    if (inferredMethod !== endpoint.method) {
                        inferredMethods[key] = inferredMethod
                    }
                })

                setEndpoints(processedEndpoints)

                setEndpointMethods(prev => ({
                    ...prev,
                    ...inferredMethods
                }))
            } else {
                // Show empty state if no endpoints are available
                setEndpoints({})
                setEndpointsError("No endpoints available - backend may be unavailable")
            }
        } catch (error) {
            console.error('Failed to load endpoints:', error)
            setEndpoints({})
            setEndpointsError("Failed to connect to backend - please ensure the server is running")
        } finally {
            setEndpointsLoading(false)
        }
    }

    // Refresh endpoints by clearing cache and reloading
    const refreshEndpoints = async () => {
        setEditingMethod(null)
        clearEndpointsCache()
        await loadEndpoints()
    }

    // Load endpoints on mount
    useEffect(() => {
        loadEndpoints()
    }, [])

    // Load tags and methods from localStorage on mount
    useEffect(() => {
        const savedTags = localStorage.getItem('endpoint-tags')
        if (savedTags) {
            setEndpointTags(JSON.parse(savedTags))
        }

        const savedMethods = localStorage.getItem('endpoint-methods')
        if (savedMethods) {
            setEndpointMethods(JSON.parse(savedMethods))
        }
    }, [])

    // Save tags to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem('endpoint-tags', JSON.stringify(endpointTags))
    }, [endpointTags])

    // Save methods to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem('endpoint-methods', JSON.stringify(endpointMethods))
    }, [endpointMethods])

    // Get all unique tags
    const getAllTags = () => {
        const allTags = new Set<string>()
        Object.values(endpointTags).forEach(tags => {
            tags.forEach(tag => allTags.add(tag))
        })
        return Array.from(allTags).sort()
    }

    // Get tags for a specific endpoint
    const getEndpointTags = (endpointKey: string) => {
        return endpointTags[endpointKey] || []
    }

    // Add tag to endpoint
    const addTagToEndpoint = (endpointKey: string, tag: string) => {
        if (!tag.trim()) return

        const trimmedTag = tag.trim()
        const existingTags = endpointTags[endpointKey] || []

        // Prevent duplicate tags
        if (existingTags.includes(trimmedTag)) return

        setEndpointTags(prev => ({
            ...prev,
            [endpointKey]: [...existingTags, trimmedTag]
        }))
        setNewTag("")
    }

    // Remove tag from endpoint
    const removeTagFromEndpoint = (endpointKey: string, tagToRemove: string) => {
        setEndpointTags(prev => ({
            ...prev,
            [endpointKey]: (prev[endpointKey] || []).filter(tag => tag !== tagToRemove)
        }))
    }

    // Filter endpoints based on search and tags
    const getFilteredEndpoints = () => {
        const filtered = Object.entries(endpoints).filter(([key, endpoint]) => {
            const tags = getEndpointTags(key)

            // Search filter
            const matchesSearch = searchTerm === "" ||
                endpoint.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                endpoint.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))

            // Tag filter
            const matchesTags = selectedTags.length === 0 ||
                selectedTags.every(selectedTag => tags.includes(selectedTag))

            return matchesSearch && matchesTags
        })

        // Sort by HTTP method
        const methodOrder = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
        return filtered.sort(([keyA, endpointA], [keyB, endpointB]) => {
            const methodA = endpointMethods[keyA] || endpointA.method
            const methodB = endpointMethods[keyB] || endpointB.method

            const indexA = methodOrder.indexOf(methodA)
            const indexB = methodOrder.indexOf(methodB)

            // If both methods are in the order array, sort by that order
            if (indexA !== -1 && indexB !== -1) {
                return indexA - indexB
            }

            // If only one is in the order array, it comes first
            if (indexA !== -1) return -1
            if (indexB !== -1) return 1

            // Otherwise, sort alphabetically
            return methodA.localeCompare(methodB)
        })
    }

    const toggleTag = (tag: string) => {
        setSelectedTags(prev =>
            prev.includes(tag)
                ? prev.filter(t => t !== tag)
                : [...prev, tag]
        )
    }

    const clearFilters = () => {
        setSearchTerm("")
        setSelectedTags([])
        setEditingMethod(null)
    }

    const toggleMethodCollapse = (method: string) => {
        setCollapsedMethods(prev => {
            const newSet = new Set(prev)
            if (newSet.has(method)) {
                newSet.delete(method)
            } else {
                newSet.add(method)
            }
            return newSet
        })
    }

    const handleAddTag = (endpointKey: string, e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            addTagToEndpoint(endpointKey, newTag)
        }
    }

    // Multi-select functions
    const toggleEndpointSelection = (endpointKey: string) => {
        setSelectedEndpoints(prev =>
            prev.includes(endpointKey)
                ? prev.filter(key => key !== endpointKey)
                : [...prev, endpointKey]
        )
    }

    const selectAllEndpoints = () => {
        const filteredKeys = getFilteredEndpoints().map(([key]) => key)
        setSelectedEndpoints(filteredKeys)
    }

    const clearEndpointSelection = () => {
        setSelectedEndpoints([])
    }

    const toggleMultiSelectMode = () => {
        setIsMultiSelectMode(!isMultiSelectMode)
        if (isMultiSelectMode) {
            clearEndpointSelection()
            setShowBulkActions(false)
        }
    }

    // Bulk tag operations
    const bulkAddTag = (tag: string) => {
        if (!tag.trim()) return

        setEndpointTags(prev => {
            const updated = { ...prev }
            selectedEndpoints.forEach(endpointKey => {
                const existingTags = updated[endpointKey] || []
                if (!existingTags.includes(tag.trim())) {
                    updated[endpointKey] = [...existingTags, tag.trim()]
                }
            })
            return updated
        })
        setBulkNewTag("")
    }

    const bulkRemoveTag = (tag: string) => {
        setEndpointTags(prev => {
            const updated = { ...prev }
            selectedEndpoints.forEach(endpointKey => {
                if (updated[endpointKey]) {
                    updated[endpointKey] = updated[endpointKey].filter(t => t !== tag)
                }
            })
            return updated
        })
    }

    const handleBulkAddTag = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            bulkAddTag(bulkNewTag)
        }
    }

    // Get tags that are common to all selected endpoints
    const getCommonTags = () => {
        if (selectedEndpoints.length === 0) return []

        const firstEndpointTags = getEndpointTags(selectedEndpoints[0])
        return firstEndpointTags.filter(tag =>
            selectedEndpoints.every(endpointKey =>
                getEndpointTags(endpointKey).includes(tag)
            )
        )
    }

    // Create a new tab for a query
    const createTab = useCallback( (endpointKey: string): QueryTab => {
        const endpoint = endpoints[endpointKey]
        const tabId = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

        const inferredMethod = inferHttpMethod(endpoint.name, endpoint.method)
        const finalMethod = endpointMethods[endpointKey] || inferredMethod

        return {
            id: tabId,
            endpointKey,
            name: endpoint.name,
            url: endpoint.url,
            method: finalMethod,
            params: {},
            body: endpoint.body ? JSON.stringify(endpoint.body, null, 2) : "",
            response: "",
            loading: false,
            status: null
        }
    }, [endpoints, endpointMethods])

    // Open a query in a new tab
    const openInNewTab = useCallback( (endpointKey: string, switchToTab = true) => {
        const newTab = createTab(endpointKey)
        setOpenTabs(prev => [...prev, newTab])
        if (switchToTab) {
            setActiveTabId(newTab.id)
            router.push(`/dashboard/queries?tab=${newTab.id}`)
        }
        return newTab
    }, [createTab, router])

    // Close a tab
    const closeTab = (tabId: string) => {
        const filtered = openTabs.filter(tab => tab.id !== tabId)
        setOpenTabs(filtered)

        if (activeTabId === tabId) {
            const newActiveTab = filtered.length > 0 ? filtered[filtered.length - 1] : null
            setActiveTabId(newActiveTab?.id || null)
        }
    }

    // Switch to a different tab
    const switchToTab = (tabId: string) => {
        setActiveTabId(tabId)
        router.push(`/dashboard/queries?tab=${tabId}`)
    }

    // Get active tab
    const getActiveTab = () => {
        return openTabs.find(tab => tab.id === activeTabId) || null
    }

    // Update tab state
    const updateTabState = (tabId: string, updates: Partial<QueryTab>) => {
        setOpenTabs(prev => prev.map(tab =>
            tab.id === tabId ? { ...tab, ...updates } : tab
        ))
    }

    // Handle navigation when activeTabId changes
    useEffect(() => {
        if (activeTabId) {
            const currentTabParam = searchParams.get('tab')
            if (currentTabParam !== activeTabId) {
                router.push(`/dashboard/queries?tab=${activeTabId}`)
            }
        } else if (openTabs.length === 0) {
            const currentTab = searchParams.get('tab')
            const currentEndpoint = searchParams.get('endpoint')
            if (currentTab || (!currentEndpoint && (selectedEndpoint || currentTab))) {
                router.push('/dashboard/queries')
            }
        }
    }, [activeTabId, openTabs.length, router, searchParams, selectedEndpoint])

    // Handle URL parameters for tab management
    useEffect(() => {
        const tabId = searchParams.get('tab')

        if (tabId) {
            // Tab mode
            const existingTab = openTabs.find(tab => tab.id === tabId)
            if (existingTab) {
                setActiveTabId(tabId)
            } else {
                // Tab doesn't exist, redirect to main page
                setActiveTabId(null)
            }
        } else if (selectedEndpoint && !tabId) {
            // Convert to tab mode when an endpoint is selected
            const existingTab = openTabs.find(tab => tab.endpointKey === selectedEndpoint)
            if (existingTab) {
                setActiveTabId(existingTab.id)
            } else {
                openInNewTab(selectedEndpoint, true)
            }
        } else {
            setActiveTabId(null)
        }
    }, [selectedEndpoint, endpoints, searchParams, openTabs, openInNewTab])

    const updateEndpoint = useCallback( (endpointKey: string) => {
        const endpoint = endpoints[endpointKey]
        if (!endpoint) return

        const inferredMethod = inferHttpMethod(endpoint.name, endpoint.method)
        const finalMethod = endpointMethods[endpointKey] || inferredMethod

        setMethod(finalMethod)
        setUrl(endpoint.url)
        setParams({})
        setBody(endpoint.body ? JSON.stringify(endpoint.body, null, 2) : "")
        setResponse("")
        setStatus(null)
    }, [endpoints, endpointMethods, setMethod, setUrl, setParams, setBody, setResponse, setStatus])

    useEffect(() => {
        if (selectedEndpoint && endpoints[selectedEndpoint] && !searchParams.get('tab')) {
            updateEndpoint(selectedEndpoint)
        }
    }, [selectedEndpoint, endpoints, endpointMethods, updateEndpoint, searchParams])

    const handleEndpointSelect = (endpointKey: string) => {
        // Always create a new tab when selecting an endpoint
        // Check if tab already exists for this endpoint
        const existingTab = openTabs.find(tab => tab.endpointKey === endpointKey)
        if (existingTab) {
            // Switch to existing tab
            setActiveTabId(existingTab.id)
            router.push(`/dashboard/queries?tab=${existingTab.id}`)
        } else {
            // Create new tab
            openInNewTab(endpointKey, true)
        }
    }

    const goBackToList = () => {
        // Clear active tab and go back to list
        setActiveTabId(null)
        router.push("/dashboard/queries")
    }

    const handleParamChange = (paramName: string, value: string) => {
        const activeTab = getActiveTab()
        if (activeTab) {
            const newParams = { ...activeTab.params, [paramName]: value }
            updateTabState(activeTab.id, {
                params: newParams,
                body: syncParamsToBody(newParams, activeTab.body, activeTab.endpointKey)
            })
        } else {
            const newParams = { ...params, [paramName]: value }
            setParams(newParams)
            setBody(syncParamsToBody(newParams, body, selectedEndpoint || ''))
        }
    }

    const syncParamsToBody = (currentParams: Record<string, string>, currentBody: string, endpointKey: string) => {
        const endpoint = endpoints[endpointKey]
        if (!endpoint) return currentBody

        if (!currentBody.trim()) {
            const nonEmptyParams = Object.entries(currentParams).filter(([, value]) => value.trim() !== '')
            if (nonEmptyParams.length > 0) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const paramsObject: Record<string, any> = {}
                nonEmptyParams.forEach(([key, value]) => {
                    const param = endpoint.params.find(p => p.name === key)
                    if (param) {
                        paramsObject[key] = convertParamValue(value, param.param_type)
                    } else {
                        paramsObject[key] = value
                    }
                })
                return JSON.stringify(paramsObject, null, 2)
            }
            return currentBody
        }

        try {
            const bodyObj = JSON.parse(currentBody)

            Object.entries(currentParams).forEach(([key, value]) => {
                if (value.trim() !== '') {
                    const param = endpoint.params.find(p => p.name === key)
                    if (param) {
                        bodyObj[key] = convertParamValue(value, param.param_type)
                    } else {
                        bodyObj[key] = value
                    }
                } else {
                    delete bodyObj[key]
                }
            })

            return JSON.stringify(bodyObj, null, 2)
        } catch {
            return currentBody
        }
    }

    const buildUrl = (tabData?: QueryTab) => {
        const activeTab = getActiveTab()
        const currentUrl = tabData?.url || activeTab?.url || url
        const currentParams = tabData?.params || activeTab?.params || params
        const currentEndpointKey = tabData?.endpointKey || activeTab?.endpointKey || selectedEndpoint

        let finalUrl = currentUrl
        const endpoint = endpoints[currentEndpointKey || '']

        endpoint?.params?.forEach((param: Parameter) => {
            if (param.type === "path") {
                finalUrl = finalUrl.replace(`{${param.name}}`, currentParams[param.name] || `{${param.name}}`)
            }
        })

        const queryParams = endpoint?.params?.filter((p: Parameter) => p.type === "query" && currentParams[p.name])
        if (queryParams && queryParams.length > 0) {
            const queryString = queryParams.map((p: Parameter) => `${p.name}=${encodeURIComponent(currentParams[p.name])}`).join("&")
            finalUrl = finalUrl.includes("?") ? finalUrl.replace(/\{[^}]+\}/g, "") : finalUrl
            if (!finalUrl.includes("?")) finalUrl += "?"
            finalUrl += queryString
        }

        return finalUrl
    }

    const sendRequest = async () => {
        const activeTab = getActiveTab()

        if (activeTab) {
            // Tab mode
            updateTabState(activeTab.id, { loading: true, response: "", status: null })

            try {
                const finalUrl = buildUrl(activeTab)
                const options: RequestInit = {
                    method: activeTab.method,
                    headers: {} as Record<string, string>,
                }

                // Only set Content-Type for requests that have a body
                if (activeTab.method !== "GET" && activeTab.method !== "DELETE") {
                    (options.headers as Record<string, string>)["Content-Type"] = "application/json"
                }

                if (activeTab.method !== "GET" && activeTab.method !== "DELETE" && activeTab.body.trim()) {
                    options.body = activeTab.body
                }

                const res = await fetch(finalUrl, options)

                // Capture status immediately after fetch
                const responseStatus = res.status

                const responseText = await res.text()

                let formattedResponse: string
                try {
                    const jsonResponse = JSON.parse(responseText)
                    formattedResponse = JSON.stringify(jsonResponse, null, 2)
                } catch {
                    formattedResponse = responseText
                }

                updateTabState(activeTab.id, {
                    loading: false,
                    response: formattedResponse,
                    status: responseStatus
                })
            } catch (error) {
                let errorMessage = error instanceof Error ? error.message : "Unknown error"
                let errorStatus: string | number = 0

                // Check if it's a CORS/network error that might have status info
                if (errorMessage.includes('Failed to fetch') || errorMessage.includes('CORS')) {
                    errorMessage = "CORS error - check if server allows cross-origin requests"
                    errorStatus = "CORS Error"
                }

                updateTabState(activeTab.id, {
                    loading: false,
                    response: `Error: ${errorMessage}`,
                    status: errorStatus
                })
            }
        } else {
            setLoading(true)
            setResponse("")
            setStatus(null)

            try {
                const finalUrl = buildUrl()
                const options: RequestInit = {
                    method,
                    headers: {} as Record<string, string>,
                }

                // Only set Content-Type for requests that have a body
                if (method !== "GET" && method !== "DELETE") {
                    (options.headers as Record<string, string>)["Content-Type"] = "application/json"
                }

                if (method !== "GET" && method !== "DELETE" && body.trim()) {
                    options.body = body
                }

                const res = await fetch(finalUrl, options)

                // Capture status immediately after fetch
                const responseStatus = res.status
                setStatus(responseStatus)

                const responseText = await res.text()
                try {
                    const jsonResponse = JSON.parse(responseText)
                    setResponse(JSON.stringify(jsonResponse, null, 2))
                } catch {
                    setResponse(responseText)
                }
            } catch (error) {
                setResponse(`Error: ${error instanceof Error ? error.message : "Unknown error"}`)
                setStatus(0)
            } finally {
                setLoading(false)
            }
        }
    }

    const copyResponse = () => {
        const activeTab = getActiveTab()
        const responseText = activeTab?.response || response
        navigator.clipboard.writeText(responseText)
    }

    const downloadResponse = () => {
        const activeTab = getActiveTab()
        const responseText = activeTab?.response || response
        const endpointKey = activeTab?.endpointKey || selectedEndpoint

        const blob = new Blob([responseText], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `response-${endpointKey}-${Date.now()}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    const activeTab = getActiveTab()
    const currentEndpoint = activeTab
        ? endpoints[activeTab.endpointKey as keyof typeof endpoints]
        : selectedEndpoint
            ? endpoints[selectedEndpoint as keyof typeof endpoints]
            : null

    // Show list view if no endpoint is selected and no active tab (but allow tabs to exist in background)
    if (!selectedEndpoint && !activeTab) {
        return (
            <SidebarProvider>
                <AppSidebar />
                <SidebarInset>
                    <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
                        <div className="flex items-center gap-2 px-4">
                            <SidebarTrigger className="-ml-1" />
                            <Separator
                                orientation="vertical"
                                className="mr-2 data-[orientation=vertical]:h-4"
                            />
                            <Breadcrumb>
                                <BreadcrumbList>
                                    <BreadcrumbItem className="hidden md:block">
                                        <BreadcrumbLink href="/dashboard">
                                            Dashboard
                                        </BreadcrumbLink>
                                    </BreadcrumbItem>
                                    <BreadcrumbSeparator className="hidden md:block" />
                                    <BreadcrumbItem>
                                        <BreadcrumbPage>Queries</BreadcrumbPage>
                                    </BreadcrumbItem>
                                </BreadcrumbList>
                            </Breadcrumb>
                        </div>
                    </header>

                    <div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-x-hidden">
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-2xl font-bold">API Queries</h1>
                                <div className="flex items-center gap-2">
                                    <p className="text-muted-foreground">Select an endpoint to test and execute API requests</p>
                                    {endpointsError && (
                                        <Badge variant="secondary" className="text-xs">
                                            {endpointsError}
                                        </Badge>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={refreshEndpoints}
                                    disabled={endpointsLoading}
                                    className="flex items-center gap-2"
                                >
                                    <RefreshCw className={`h-4 w-4 ${endpointsLoading ? 'animate-spin' : ''}`} />
                                    Refresh Endpoints
                                </Button>
                                {openTabs.length > 0 && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-muted-foreground">Open tabs:</span>
                                        {openTabs.map((tab) => (
                                            <button
                                                key={tab.id}
                                                onClick={() => {
                                                    setActiveTabId(tab.id)
                                                    router.push(`/dashboard/queries?tab=${tab.id}`)
                                                }}
                                                className="px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded border flex items-center gap-1"
                                            >
                                                <FileText className="h-3 w-3" />
                                                {tab.name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Search and Filter Controls */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-4">
                                <div className="relative flex-1 max-w-md">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search endpoints..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-10"
                                    />
                                </div>
                                <Button
                                    variant="outline"
                                    onClick={() => setShowFilters(!showFilters)}
                                    className="flex items-center gap-2"
                                >
                                    <Filter className="h-4 w-4" />
                                    Filters
                                    {selectedTags.length > 0 && (
                                        <Badge variant="secondary" className="ml-1">
                                            {selectedTags.length}
                                        </Badge>
                                    )}
                                </Button>
                                <Button
                                    variant={isMultiSelectMode ? "default" : "outline"}
                                    onClick={toggleMultiSelectMode}
                                    className="flex items-center gap-2"
                                >
                                    <SquarePen className="h-4 w-4" />
                                    Multi-Edit
                                    {selectedEndpoints.length > 0 && (
                                        <Badge variant="secondary" className="ml-1">
                                            {selectedEndpoints.length}
                                        </Badge>
                                    )}
                                </Button>
                                {(searchTerm || selectedTags.length > 0) && (
                                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                                        <X className="h-4 w-4" />
                                        Clear
                                    </Button>
                                )}
                            </div>

                            {/* Tag Filter Panel */}
                            {showFilters && (
                                <div className="border rounded-lg p-4 space-y-3">
                                    <h3 className="font-medium text-sm">Filter by Tags</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {getAllTags().map((tag) => (
                                            <Badge
                                                key={tag}
                                                variant={selectedTags.includes(tag) ? "default" : "outline"}
                                                className="cursor-pointer hover:bg-accent"
                                                onClick={() => toggleTag(tag)}
                                            >
                                                {tag}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Multi-select Controls */}
                            {isMultiSelectMode && (
                                <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                                    <div className="flex items-center gap-2">
                                        <Button variant="outline" size="sm" onClick={selectAllEndpoints}>
                                            Select All ({getFilteredEndpoints().length})
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={clearEndpointSelection}>
                                            Clear Selection
                                        </Button>
                                    </div>
                                    {selectedEndpoints.length > 0 && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setShowBulkActions(!showBulkActions)}
                                        >
                                            Bulk Actions ({selectedEndpoints.length})
                                        </Button>
                                    )}
                                </div>
                            )}

                            {/* Bulk Actions Panel */}
                            {isMultiSelectMode && showBulkActions && selectedEndpoints.length > 0 && (
                                <div className="border rounded-lg p-4 space-y-4">
                                    <h3 className="font-medium text-sm">Bulk Tag Actions</h3>

                                    {/* Add Tag */}
                                    <div className="space-y-2">
                                        <Label className="text-xs">Add Tag to Selected Endpoints</Label>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                value={bulkNewTag}
                                                onChange={(e) => setBulkNewTag(e.target.value)}
                                                onKeyDown={handleBulkAddTag}
                                                placeholder="Enter tag name..."
                                                className="h-8 text-sm"
                                            />
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => bulkAddTag(bulkNewTag)}
                                            >
                                                <Plus className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Remove Common Tags */}
                                    {getCommonTags().length > 0 && (
                                        <div className="space-y-2">
                                            <Label className="text-xs">Remove Common Tags</Label>
                                            <div className="flex flex-wrap gap-1">
                                                {getCommonTags().map((tag) => (
                                                    <Badge
                                                        key={tag}
                                                        variant="destructive"
                                                        className="cursor-pointer flex items-center gap-1"
                                                        onClick={() => bulkRemoveTag(tag)}
                                                    >
                                                        {tag}
                                                        <X className="h-2 w-2" />
                                                    </Badge>
                                                ))}
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                Click to remove these tags from all selected endpoints
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Active Filters Display */}
                            {selectedTags.length > 0 && (
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="text-muted-foreground">Active tags:</span>
                                    {selectedTags.map((tag) => (
                                        <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                                            {tag}
                                            <X
                                                className="h-3 w-3 cursor-pointer hover:text-destructive"
                                                onClick={() => toggleTag(tag)}
                                            />
                                        </Badge>
                                    ))}
                                </div>
                            )}
                        </div>

                        {endpointsLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="text-center">
                                    <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
                                    <p className="text-lg font-medium">Loading endpoints...</p>
                                    <p className="text-sm text-muted-foreground">Fetching API endpoints from backend</p>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {getFilteredEndpoints().map(([key, endpoint], index, array) => {
                                    const currentMethod = endpointMethods[key] || endpoint.method
                                    const prevMethod = index > 0 ? (endpointMethods[array[index - 1][0]] || array[index - 1][1].method) : null
                                    const showMethodHeader = index === 0 || currentMethod !== prevMethod

                                    // Count endpoints for this method
                                    const methodCount = array.filter(([k, e]) =>
                                        (endpointMethods[k] || e.method) === currentMethod
                                    ).length

                                    const isCollapsed = collapsedMethods.has(currentMethod)

                                    return (
                                        <Fragment key={key}>
                                            {showMethodHeader && (
                                                <div className="col-span-full flex items-center gap-2 mt-2 first:mt-0">
                                                    <button
                                                        onClick={() => toggleMethodCollapse(currentMethod)}
                                                        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                                                    >
                                                        {isCollapsed ? (
                                                            <ChevronRight className="h-4 w-4" />
                                                        ) : (
                                                            <ChevronDown className="h-4 w-4" />
                                                        )}
                                                        <span className={`text-sm font-semibold badge-${currentMethod.toLowerCase()} px-3 py-1 rounded-full`}>
                                                            {currentMethod}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">
                                                            ({methodCount})
                                                        </span>
                                                    </button>
                                                    <div className="flex-1 h-px bg-border" />
                                                </div>
                                            )}
                                            {!isCollapsed && (
                                                <Card
                                                    className={`group relative cursor-pointer pt-2 gap-0 ${selectedEndpoints.includes(key) ? 'ring-2 ring-primary' : ''}`}
                                                    onClick={() => {
                                                        if (isMultiSelectMode) {
                                                            toggleEndpointSelection(key)
                                                        } else {
                                                            handleEndpointSelect(key)
                                                        }
                                                    }}
                                                >
                                                    <CardHeader className="relative pb-3 gap-0">
                                                        <div className="grid grid-cols-[1fr_auto] items-start gap-2 min-w-0">
                                                            <div className="flex flex-col items-start justify-start gap-2 min-w-0 flex-1">
                                                                <div className="flex items-start justify-start gap-2 min-w-0 w-full">
                                                                    {isMultiSelectMode && (
                                                                        <div className="h-6 w-6 flex items-center justify-center flex-shrink-0">
                                                                            {selectedEndpoints.includes(key) ? (
                                                                                <CheckSquare className="h-4 w-4" />
                                                                            ) : (
                                                                                <Square className="h-4 w-4" />
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                    <CardTitle className="text-lg min-w-0 flex-1 truncate">
                                                                        <Tooltip>
                                                                        <TooltipTrigger>{endpoint.name}</TooltipTrigger>
                                                                        <TooltipContent bgColor="bg-popover" fillColor="fill-popover">
                                                                            <p className="text-left text-popover-foreground">{endpoint.name}</p>
                                                                        </TooltipContent>
                                                                        </Tooltip>
                                                                    </CardTitle>
                                                                    
                                                                </div>
                                                                <CardDescription className="w-full">
                                                                    {endpoint.description}
                                                                </CardDescription>
                                                            </div>
                                                            <div className="flex flex-col items-end gap-2 pt-2 flex-shrink-0">
                                                                    {editingMethod === key ? (
                                                                        <Select
                                                                            value={endpointMethods[key] || endpoint.method}
                                                                            onValueChange={(value) => {
                                                                                setEndpointMethods(prev => ({
                                                                                    ...prev,
                                                                                    [key]: value
                                                                                }))
                                                                                setEditingMethod(null)
                                                                            }}
                                                                        >
                                                                            <SelectTrigger
                                                                                className="h-6 w-20 text-xs"
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            >
                                                                                <SelectValue />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                <SelectItem value="GET">GET</SelectItem>
                                                                                <SelectItem value="POST">POST</SelectItem>
                                                                                <SelectItem value="PUT">PUT</SelectItem>
                                                                                <SelectItem value="DELETE">DELETE</SelectItem>
                                                                                <SelectItem value="PATCH">PATCH</SelectItem>
                                                                            </SelectContent>
                                                                        </Select>
                                                                    ) : (
                                                                        <span
                                                                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold cursor-pointer badge-${(endpointMethods[key] || endpoint.method).toLowerCase()}`}
                                                                            onClick={(e) => {
                                                                                e.stopPropagation()
                                                                                setEditingMethod(key)
                                                                            }}
                                                                            title="Click to change method"
                                                                        >
                                                                            {endpointMethods[key] || endpoint.method}
                                                                        </span>
                                                                    )}
                                                                    {!isMultiSelectMode && (
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation()
                                                                                setEditingTags(editingTags === key ? null : key)
                                                                            }}
                                                                        >
                                                                            <Edit2 className="h-3 w-3" />
                                                                        </Button>
                                                                    )}
                                                            </div>
                                                        </div>
                                                    </CardHeader>
                                                    <CardContent className="py-0">
                                                        <div className="space-y-3">
                                                            <div className="text-sm font-mono text-muted-foreground truncate">
                                                                {endpoint.url}
                                                            </div>

                                                            {/* Tags Display/Edit */}
                                                            <div className="space-y-2">
                                                                <div className="flex flex-wrap gap-1">
                                                                    {getEndpointTags(key).map((tag) => (
                                                                        <Badge key={tag} variant="outline" className="text-xs flex items-center gap-1">
                                                                            {tag}
                                                                            {editingTags === key && !isMultiSelectMode && (
                                                                                <button
                                                                                    className="ml-1 h-3 w-3 rounded-full hover:bg-destructive/20 flex items-center justify-center cursor-pointer"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation()
                                                                                        removeTagFromEndpoint(key, tag)
                                                                                    }}
                                                                                >
                                                                                    <X className="h-2 w-2 hover:text-destructive" />
                                                                                </button>
                                                                            )}
                                                                        </Badge>
                                                                    ))}

                                                                    {editingTags === key && !isMultiSelectMode && (
                                                                        <div className="flex items-center gap-1">
                                                                            <Input
                                                                                value={newTag}
                                                                                onChange={(e) => setNewTag(e.target.value)}
                                                                                onKeyDown={(e) => handleAddTag(key, e)}
                                                                                placeholder="Add tag..."
                                                                                className="h-6 text-xs w-20"
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            />
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="sm"
                                                                                className="h-6 w-6 p-0"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation()
                                                                                    addTagToEndpoint(key, newTag)
                                                                                }}
                                                                            >
                                                                                <Plus className="h-3 w-3" />
                                                                            </Button>
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {getEndpointTags(key).length === 0 && editingTags !== key && !isMultiSelectMode && (
                                                                    <div className="text-xs text-muted-foreground">
                                                                        No tags - hover and click edit to add some
                                                                    </div>
                                                                )}

                                                                {isMultiSelectMode && (
                                                                    <div className="text-xs text-muted-foreground">
                                                                        Select endpoints to bulk edit tags
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            )}
                                        </Fragment>
                                    )
                                })}
                            </div>
                        )}

                        {/* No Results Message */}
                        {!endpointsLoading && getFilteredEndpoints().length === 0 && (
                            <div className="text-center py-12">
                                <div className="text-muted-foreground">
                                    {Object.keys(endpoints).length === 0 ? (
                                        <div>
                                            <div className="h-12 w-12 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                                                ⚠️
                                            </div>
                                            <p className="text-lg font-medium">No endpoints available</p>
                                            <p className="text-sm mb-4">Unable to connect to HelixDB</p>
                                            <div className="space-y-2 text-xs">
                                                <p>Make sure HelixDB is running on <code className="bg-muted px-1 rounded">{helixUrl}</code></p>
                                                <p>Check your HelixDB connection and try clicking the {"Refresh Endpoints"} button above</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                            <p className="text-lg font-medium">No endpoints found</p>
                                            <p className="text-sm">Try adjusting your search or filters</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </SidebarInset>
            </SidebarProvider>
        )
    }

    // Show tabbed interface when tabs are open, or detailed endpoint testing view for legacy mode
    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="overflow-hidden">
                <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
                    <div className="flex items-center gap-2 px-4">
                        <SidebarTrigger className="-ml-1" />
                        <Separator
                            orientation="vertical"
                            className="mr-2 data-[orientation=vertical]:h-4"
                        />
                        <Breadcrumb>
                            <BreadcrumbList>
                                <BreadcrumbItem className="hidden md:block">
                                    <BreadcrumbLink href="/dashboard">
                                        Dashboard
                                    </BreadcrumbLink>
                                </BreadcrumbItem>
                                <BreadcrumbSeparator className="hidden md:block" />
                                <BreadcrumbItem>
                                    <button
                                        onClick={goBackToList}
                                        className="hover:text-foreground text-muted-foreground transition-colors"
                                    >
                                        Queries
                                    </button>
                                </BreadcrumbItem>
                                <BreadcrumbSeparator className="hidden md:block" />
                                <BreadcrumbItem>
                                    <BreadcrumbPage>{currentEndpoint?.name}</BreadcrumbPage>
                                </BreadcrumbItem>
                            </BreadcrumbList>
                        </Breadcrumb>
                    </div>
                </header>

                <div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-x-hidden max-w-full">
                    {/* Tab Bar */}
                    {openTabs.length > 0 && (
                        <div className="flex items-center gap-2 border-b pb-2">
                            <Button variant="outline" size="sm" onClick={goBackToList}>
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Back to Queries
                            </Button>
                            <div className="flex-1 flex items-center gap-1 overflow-x-auto">
                                {openTabs.map((tab) => (
                                    <div
                                        key={tab.id}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-t-lg border border-b-0 min-w-0 cursor-pointer ${tab.id === activeTabId
                                            ? 'bg-background border-border'
                                            : 'bg-muted/50 border-transparent hover:bg-muted'
                                            }`}
                                        onClick={() => switchToTab(tab.id)}
                                    >
                                        <FileText className="h-3 w-3 flex-shrink-0" />
                                        <span className="text-sm truncate max-w-32" title={tab.name}>
                                            {tab.name}
                                        </span>
                                        {tab.loading && (
                                            <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse flex-shrink-0" />
                                        )}
                                        <button
                                            className="h-4 w-4 rounded hover:bg-destructive/20 flex items-center justify-center flex-shrink-0"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                closeTab(tab.id)
                                            }}
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Header for non-tabbed view */}
                    {openTabs.length === 0 && (
                        <div className="flex items-center gap-4 mb-4">
                            <Button variant="outline" size="sm" onClick={goBackToList}>
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Back to Queries
                            </Button>
                            <div>
                                <h1 className="text-xl font-semibold">{currentEndpoint?.name}</h1>
                                <p className="text-muted-foreground text-sm">{currentEndpoint?.description}</p>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0 flex-1 overflow-hidden">
                        {/* Request Panel */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-semibold">Request</h2>
                            </div>


                            {/* Method and URL */}
                            <div className="flex gap-2">
                                <Select
                                    value={activeTab?.method || method}
                                    onValueChange={(value) => {
                                        if (activeTab) {
                                            updateTabState(activeTab.id, { method: value })
                                        } else {
                                            setMethod(value)
                                        }
                                    }}
                                >
                                    <SelectTrigger className="w-24">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="GET">GET</SelectItem>
                                        <SelectItem value="POST">POST</SelectItem>
                                        <SelectItem value="PUT">PUT</SelectItem>
                                        <SelectItem value="DELETE">DELETE</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Input value={buildUrl()} readOnly className="flex-1" />
                                <Button onClick={sendRequest} disabled={activeTab?.loading || loading}>
                                    {(activeTab?.loading || loading) ? "Sending..." : <Send className="h-4 w-4" />}
                                </Button>
                            </div>

                            {/* Parameters */}
                            {currentEndpoint?.params && currentEndpoint.params.length > 0 && (
                                <div className="space-y-2">
                                    <Label>Parameters</Label>
                                    <div className="space-y-2">
                                        {currentEndpoint.params.map((param: Parameter) => (
                                            <div key={param.name} className="grid grid-cols-[160px_1fr_60px_auto] gap-2 items-center">
                                                <Label className="text-sm truncate" title={param.name}>{param.name}</Label>
                                                <Input
                                                    placeholder={param.description}
                                                    value={(activeTab?.params || params)[param.name] || ""}
                                                    onChange={(e) => handleParamChange(param.name, e.target.value)}
                                                />
                                                <span className="text-xs text-muted-foreground text-center">
                                                    {param.param_type}
                                                </span>
                                                <div className="w-4 flex justify-center">
                                                    {param.required && (
                                                        <span className="text-xs text-red-500">*</span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Request Body */}
                            {((activeTab?.method || method) === "POST" || (activeTab?.method || method) === "PUT") && (
                                <div className="space-y-2">
                                    <Label htmlFor="body">Request Body (JSON)</Label>
                                    <Textarea
                                        id="body"
                                        value={activeTab?.body || body}
                                        onChange={(e) => {
                                            if (activeTab) {
                                                updateTabState(activeTab.id, { body: e.target.value })
                                            } else {
                                                setBody(e.target.value)
                                            }
                                        }}
                                        placeholder="Enter JSON body..."
                                        className="min-h-32 font-mono text-sm"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Response Panel */}
                        <div className="space-y-4 overflow-hidden">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-semibold">Response</h2>
                                {(activeTab?.response || response) && (
                                    <div className="flex gap-2">
                                        <Button variant="outline" size="sm" onClick={copyResponse}>
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={downloadResponse}>
                                            <Download className="h-4 w-4" />
                                        </Button>
                                    </div>
                                )}
                            </div>

                            {(() => {
                                const currentStatus = activeTab?.status ?? status;
                                return (currentStatus !== null && currentStatus !== undefined) && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium">Status:</span>
                                        <span
                                            className={`px-2 py-1 rounded text-xs font-medium ${currentStatus === 0 || (typeof currentStatus === 'string' && currentStatus === "CORS Error")
                                                ? "bg-[#C34043CC] text-white"
                                                : typeof currentStatus === 'number' && currentStatus >= 200 && currentStatus < 300
                                                    ? "bg-[#76946A] text-white"
                                                    : typeof currentStatus === 'number' && currentStatus >= 400
                                                        ? "bg-[#E67E80] text-white"
                                                        : "bg-[#E69875] text-white"
                                                }`}
                                        >
                                            {currentStatus === 0
                                                ? "Failed to fetch"
                                                : (typeof currentStatus === 'string' && currentStatus === "CORS Error")
                                                    ? "CORS Error"
                                                    : currentStatus}
                                        </span>
                                    </div>
                                );
                            })()}

                            <ResponsePanel
                                loading={activeTab?.loading || loading}
                                response={activeTab?.response || response}
                            />
                        </div>
                    </div>

                    {/* Table View Section */}
                    {(activeTab?.response || response) && !(activeTab?.loading || loading) && (
                        <div className="w-full max-w-full space-y-4 mt-6 overflow-hidden">
                            <div>
                                <h2 className="text-lg font-semibold">Table View</h2>
                                <p className="text-sm text-muted-foreground">View response data in a sortable, searchable table format</p>
                            </div>
                            <div className="w-full max-w-full bg-muted/50 rounded-lg p-4 overflow-hidden">
                                <JsonTable data={activeTab?.response || response} />
                            </div>
                        </div>
                    )}
                </div>
            </SidebarInset>
        </SidebarProvider>
    )
}