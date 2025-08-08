"use client"

import { useState, useEffect, useRef } from "react"
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
    SidebarInset,
    SidebarProvider,
    SidebarTrigger,
} from "@/components/ui/sidebar"
import { Search, Filter, TrendingUp, Clock, AlertTriangle, BarChart3, Activity, X, RefreshCw } from "lucide-react"
import * as d3 from "d3"
import { getEndpoints, clearEndpointsCache } from "@/utils/endpoints"

// Generate synthetic analytics data for a full 36-hour period
const generateFullTimeSeriesData = (baseValue: number, variance: number) => {
    const data = []
    const now = new Date()
    const totalHours = 48
    const minutesPerPoint = 1 // One data point every 1 minute
    const totalPoints = Math.floor((totalHours * 60) / minutesPerPoint) + 1 // +1 to include the end point

    // Calculate start time (36 hours ago)
    const startTime = new Date(now.getTime() - totalHours * 60 * 60 * 1000)

    // Generate data points for the full 36-hour period
    for (let i = 0; i < totalPoints; i++) {
        // Generate timestamps evenly distributed across the 36-hour period
        // Each point represents 15 minutes
        const timestamp = new Date(startTime.getTime() + i * (minutesPerPoint * 60 * 1000))

        // Make sure we don't go beyond 'now'
        if (timestamp > now) break

        // Add some realistic patterns based on time of day
        const hourOfDay = timestamp.getHours()
        let timeBasedFactor = 1.0

        // Simulate daily patterns - higher traffic during business hours
        if (hourOfDay >= 9 && hourOfDay <= 17) {
            timeBasedFactor = 1.2 // Higher during business hours
        } else if (hourOfDay >= 0 && hourOfDay <= 5) {
            timeBasedFactor = 0.7 // Lower during night hours
        }

        // Add weekly patterns - lower on weekends
        const dayOfWeek = timestamp.getDay()
        if (dayOfWeek === 0 || dayOfWeek === 6) { // 0 = Sunday, 6 = Saturday
            timeBasedFactor *= 0.8 // 20% less on weekends
        }

        // Add some randomness and periodic patterns
        const noise = (Math.random() - 0.5) * variance
        const trend = Math.sin(i * 0.1) * variance * 0.3
        const value = Math.max(0, baseValue * timeBasedFactor + noise + trend)

        data.push({ timestamp, value })
    }
    return data
}

// Create x-axis tick intervals based on time period
const createTimeAxisTicks = (hours: number) => {
    const now = new Date()
    const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000)

    // Determine interval based on time period
    let intervalMinutes: number
    if (hours <= 1) {
        intervalMinutes = 5 // Every 5 minutes for 1 hour
    } else if (hours <= 6) {
        intervalMinutes = 30 // Every 30 minutes for 6 hours
    } else {
        intervalMinutes = 120 // Every 2 hours for 24 hours
    }

    // Round start time up to nearest interval
    const roundedStartTime = roundTimeDown(startTime, intervalMinutes)

    // Generate tick timestamps
    const ticks: Date[] = []
    let currentTime = new Date(roundedStartTime.getTime())

    while (currentTime <= now) {
        ticks.push(new Date(currentTime.getTime()))
        currentTime = new Date(currentTime.getTime() + intervalMinutes * 60 * 1000)
    }

    return ticks
}

// Round time down to nearest interval
const roundTimeDown = (date: Date, intervalMinutes: number) => {
    const roundedDate = new Date(date.getTime())
    const minutes = roundedDate.getMinutes()
    const roundedMinutes = Math.floor(minutes / intervalMinutes) * intervalMinutes
    roundedDate.setMinutes(roundedMinutes, 0, 0)
    return roundedDate
}

// Filter time series data based on selected time period
const filterTimeSeriesData = (data: Array<{ timestamp: Date; value: number }>, hours: number) => {
    const now = new Date()
    const cutoffTime = new Date(now.getTime() - hours * 60 * 60 * 1000)

    // Round cutoff time up to nearest 30 minutes or hour based on time period
    let intervalMinutes: number
    if (hours <= 1) {
        intervalMinutes = 5 // Every 5 minutes for 1 hour
    } else if (hours <= 6) {
        intervalMinutes = 30 // Every 30 minutes for 6 hours
    } else {
        intervalMinutes = 120 // Every hour for 24 hours
    }

    const roundedCutoffTime = roundTimeDown(cutoffTime, intervalMinutes)

    // Filter the original data to the time range and return as-is
    return data.filter(point => point.timestamp >= roundedCutoffTime && point.timestamp <= now)
}

const generateQueryMetrics = (queryKey: string) => {
    // Use query key as seed for consistent randomness per query
    let seed = queryKey.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const random = () => {
        const x = Math.sin(seed++) * 10000
        return x - Math.floor(x)
    }

    // Base values
    const baseRps = (random() * 30 + 15) // 15-45 RPS base
    const baseLatency = (random() * 150 + 100) // 100-250ms base latency
    const baseErrorRate = (random() * 2 + 0.5) // 0.5-2.5% base error rate

    // Generate full 36 hours of data
    const fullTrafficData = generateFullTimeSeriesData(baseRps, baseRps * 0.3)
    const fullLatencyData = generateFullTimeSeriesData(baseLatency, baseLatency * 0.2)
    const fullErrorRateData = generateFullTimeSeriesData(baseErrorRate, baseErrorRate * 0.4)

    return {
        fullTrafficData,
        fullLatencyData,
        fullErrorRateData,
        baseRps,
        baseLatency,
        baseErrorRate
    }
}

// Aggregate multiple time series by averaging values at each timestamp
const aggregateTimeSeries = (dataArrays: Array<{ timestamp: Date; value: number }[]>) => {
    if (dataArrays.length === 0) return []
    if (dataArrays.length === 1) return dataArrays[0]

    // Assume all arrays have the same timestamps (they do in our synthetic data)
    const result = dataArrays[0].map((point, index) => {
        const avgValue = dataArrays.reduce((sum: number, arr) => sum + arr[index].value, 0) / dataArrays.length
        return {
            timestamp: point.timestamp,
            value: avgValue
        }
    })

    return result
}

// Line chart component
const LineChart = ({ data, title, yLabel, color, height = 200, timePeriod = "1" }: {
    data: Array<{ timestamp: Date; value: number }>
    title: string
    yLabel: string
    color: string
    height?: number
    timePeriod: string
}) => {
    const svgRef = useRef<SVGSVGElement>(null)
    const tooltipRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const [containerWidth, setContainerWidth] = useState(800)

    // ResizeObserver to track container width
    useEffect(() => {
        if (!containerRef.current) return

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerWidth(entry.contentRect.width)
            }
        })

        resizeObserver.observe(containerRef.current)

        return () => {
            resizeObserver.disconnect()
        }
    }, [])

    useEffect(() => {
        if (!svgRef.current || !data.length) return

        const svg = d3.select(svgRef.current)
        svg.selectAll("*").remove()

        const margin = { top: 20, right: 30, bottom: 40, left: 50 }
        const chartWidth = containerWidth - margin.left - margin.right
        const chartHeight = height - margin.top - margin.bottom

        const g = svg.append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`)

        // Calculate time range
        const hours = parseInt(timePeriod)
        const now = new Date()
        const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000)

        // Round start time up to nearest interval
        let intervalMinutes: number
        if (hours <= 1) {
            intervalMinutes = 5 // Every 5 minutes for 1 hour
        } else if (hours <= 6) {
            intervalMinutes = 30 // Every 30 minutes for 6 hours
        } else {
            intervalMinutes = 120 // Every hour for 24 hours
        }

        // Add dots for data points (only for non-zero values)
        let nonZeroData = data.filter(d => d.value > 0)

        let actualData = []

        if (hours <= 1) {
            actualData = nonZeroData
        } else if (hours <= 6) {
            // Push a data point for every 5 minutes
            for (let i = 0; i < nonZeroData.length; i++) {
                if (i === 0 || (nonZeroData[i].timestamp.getTime() - nonZeroData[0].timestamp.getTime()) % (5 * 60 * 1000) === 0) {
                    actualData.push(nonZeroData[i])
                }
            }
        } else if (hours <= 24) {
            // Push a data point for every 30 minutes
            for (let i = 0; i < nonZeroData.length; i++) {
                if (i === 0 || (nonZeroData[i].timestamp.getTime() - nonZeroData[0].timestamp.getTime()) % (30 * 60 * 1000) === 0) {
                    actualData.push(nonZeroData[i])
                }
            }
        } else {
            actualData = nonZeroData
        }

        const roundedStartTime = roundTimeDown(startTime, intervalMinutes)

        // Scales
        const xScale = d3.scaleTime()
            .domain([roundedStartTime, now])
            .range([0, chartWidth])

        const yScale = d3.scaleLinear()
            .domain([0, d3.max(data, (d: { timestamp: Date; value: number }) => d.value) as number])
            .nice()
            .range([chartHeight, 0])

        // Line generator
        const line = d3.line<{ timestamp: Date; value: number }>()
            .x((d: { timestamp: Date; value: number }) => xScale(d.timestamp))
            .y((d: { timestamp: Date; value: number }) => yScale(d.value))
            .curve(d3.curveMonotoneX)

        // Area generator for gradient fill
        const area = d3.area<{ timestamp: Date; value: number }>()
            .x((d: { timestamp: Date; value: number }) => xScale(d.timestamp))
            .y0(chartHeight)
            .y1((d: { timestamp: Date; value: number }) => yScale(d.value))
            .curve(d3.curveMonotoneX)

        // Create unique gradient ID based on title and color to avoid conflicts
        const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '')
        const safeColor = color.replace(/[^a-zA-Z0-9]/g, '')
        const gradientId = `gradient-${safeTitle}-${safeColor}-${Math.random().toString(36).substring(2, 9)}`

        // Vertical gradient (for area fill)
        const verticalGradient = svg.append("defs")
            .append("linearGradient")
            .attr("id", gradientId)
            .attr("gradientUnits", "userSpaceOnUse")
            .attr("x1", 0)
            .attr("y1", 0)
            .attr("x2", 0)
            .attr("y2", chartHeight)

        verticalGradient.append("stop")
            .attr("offset", "0%")
            .attr("stop-color", color)
            .attr("stop-opacity", 0.3)

        verticalGradient.append("stop")
            .attr("offset", "100%")
            .attr("stop-color", color)
            .attr("stop-opacity", 0.05)

        // Clip path for area animation
        const clipId = `clip-${safeTitle}-${Math.random().toString(36).substring(2, 9)}`

        const clipPath = svg.append("defs")
            .append("clipPath")
            .attr("id", clipId)

        const clipRect = clipPath.append("rect")
            .attr("width", 0)
            .attr("height", chartHeight)
            .attr("x", 0)
            .attr("y", 0)

        // Add area with gradient fill
        const areaPath = g.append("path")
            .datum(actualData)
            .attr("fill", `url(#${gradientId})`)
            .attr("d", area)
            .attr("clip-path", `url(#${clipId})`)
            .attr("opacity", 0.8)

        // Add line
        const path = g.append("path")
            .datum(actualData)
            .attr("fill", "none")
            .attr("stroke", color)
            .attr("stroke-width", 2)
            .attr("d", line)

        // Animate line drawing
        const totalLength = path.node()?.getTotalLength() || 0
        path
            .attr("stroke-dasharray", `${totalLength} ${totalLength}`)
            .attr("stroke-dashoffset", totalLength)
            .transition()
            .duration(1500)
            .ease(d3.easeLinear)
            .attr("stroke-dashoffset", 0)

        // Animate area fill from left to right
        clipRect.transition()
            .duration(1500)
            .ease(d3.easeLinear)
            .attr("width", chartWidth)

        // Create ticks based on time period
        const tickValues = createTimeAxisTicks(hours)
        const tickFormat = d3.timeFormat("%H:%M")

        // Create x-axis
        const xAxis = d3.axisBottom(xScale)
            .tickValues(tickValues)
            .tickFormat((d) => tickFormat(d as Date))

        g.append("g")
            .attr("transform", `translate(0,${chartHeight})`)
            .call(xAxis)

        g.append("g")
            .call(d3.axisLeft(yScale))

        // Add Y axis label
        g.append("text")
            .attr("transform", "rotate(-90)")
            .attr("y", 0 - margin.left)
            .attr("x", 0 - (chartHeight / 2))
            .attr("dy", "1em")
            .style("text-anchor", "middle")
            .style("font-size", "12px")
            .style("fill", "#6b7280")
            .text(yLabel)

        const dots = g.selectAll(".dot")
            .data(actualData)
            .enter().append("circle")
            .attr("class", "dot")
            .attr("cx", (d: { timestamp: Date; value: number }) => xScale(d.timestamp))
            .attr("cy", (d: { timestamp: Date; value: number }) => yScale(d.value))
            .attr("r", 0)
            .attr("fill", color)
            .style("opacity", 0)
            .style("cursor", "pointer")

        // Tooltip
        const tooltip = d3.select(tooltipRef.current)

        // Add event handlers to dots
        dots
            .on("mouseover", (event, d) => {
                // Get the container's bounding rect to calculate relative position
                const containerRect = containerRef.current?.getBoundingClientRect()
                if (!containerRect) return

                // Calculate position relative to the container
                const x = event.clientX - containerRect.left
                const y = event.clientY - containerRect.top

                // Update tooltip content
                tooltip.select('.tooltip-title').text(`${d.value.toFixed(2)}${yLabel}`)
                tooltip.select('.tooltip-content').text(
                    `${d.timestamp.toLocaleTimeString()}`
                )

                // Position and show tooltip
                tooltip
                    .style("opacity", 1)
                    .style("left", `${x}px`)
                    .style("top", `${y}px`)

                d3.select(event.target)
                    .transition()
                    .duration(100)
                    .attr("r", 5)
                    .style("opacity", 1)
            })
            .on("mouseout", (event) => {
                tooltip.style("opacity", 0)
                d3.select(event.target)
                    .transition()
                    .duration(100)
                    .attr("r", 3)
                    .style("opacity", 0.7)
            })

        // Animate dots from left to right following the line
        dots.transition()
            .delay((d: { timestamp: Date; value: number }, i: number) => {
                // Calculate delay based on position along x-axis
                const xPosition = xScale(d.timestamp)
                const maxX = chartWidth
                return (xPosition / maxX) * 1000 // Scale delay based on position
            })
            .duration(900)
            .attr("r", 3)
            .style("opacity", 0.7)

    }, [data, title, yLabel, color, height, timePeriod, containerWidth])

    return (
        <div className="relative" ref={containerRef}>
            <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" style={{ color }} />
                {title}
            </h3>
            <svg
                ref={svgRef}
                width={containerWidth}
                height={height}
                className="w-full"
                style={{ maxWidth: "100%" }}
            />
            <div
                ref={tooltipRef}
                className="absolute pointer-events-none z-50 bg-background/70 backdrop-blur-sm border rounded-lg shadow-lg p-1 text-xs"
                style={{
                    opacity: 0,
                    transform: 'translate(-50%, -100%)',
                    marginTop: '-10px'
                }}
            >
                <div className="font-medium tooltip-title text-xs"></div>
                <div className="text-muted-foreground tooltip-content text-xs"></div>
            </div>
        </div>
    )
}

export default function AnalyticsPage() {
    const [searchTerm, setSearchTerm] = useState("")
    const [timePeriod, setTimePeriod] = useState("1")
    const [selectedQueries, setSelectedQueries] = useState<string[]>([])
    const [chartViewMode, setChartViewMode] = useState<"average" | string>("average")

    // Dynamic endpoints state
    const [endpoints, setEndpoints] = useState<Record<string, any>>({})
    const [endpointsLoading, setEndpointsLoading] = useState(true)
    const [endpointsError, setEndpointsError] = useState<string | null>(null)

    // Store the full 36-hour dataset
    const [fullMetricsData, setFullMetricsData] = useState<Record<string, {
        fullTrafficData: Array<{ timestamp: Date; value: number }>,
        fullLatencyData: Array<{ timestamp: Date; value: number }>,
        fullErrorRateData: Array<{ timestamp: Date; value: number }>,
        baseRps: number,
        baseLatency: number,
        baseErrorRate: number
    }>>({})

    // Store the filtered metrics based on selected time period
    interface QueryMetrics {
        traffic: Array<{ timestamp: Date; value: number }>
        latency: Array<{ timestamp: Date; value: number }>
        errorRate: Array<{ timestamp: Date; value: number }>
        totalRequests: number
        avgLatency: number
        errorPercentage: number
        p95Latency: number
        p99Latency: number
    }

    const [metricsData, setMetricsData] = useState<Record<string, QueryMetrics>>({})

    // Load endpoints from backend
    const loadEndpoints = async () => {
        setEndpointsLoading(true)
        setEndpointsError(null)
        try {
            const dynamicEndpoints = await getEndpoints()
            if (Object.keys(dynamicEndpoints).length > 0) {
                setEndpoints(dynamicEndpoints)
                // Auto-select first endpoint if none are selected
                if (selectedQueries.length === 0) {
                    const firstEndpointKey = Object.keys(dynamicEndpoints)[0]
                    if (firstEndpointKey) {
                        setSelectedQueries([firstEndpointKey])
                    }
                }
            } else {
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
        clearEndpointsCache()
        await loadEndpoints()
    }

    // Load endpoints on mount
    useEffect(() => {
        loadEndpoints()
    }, [])

    // Generate full 36-hour dataset when selected queries change
    useEffect(() => {
        const newFullMetricsData: Record<string, any> = {}

        selectedQueries.forEach(queryKey => {
            // Only generate new data if we don't already have it for this query
            if (!fullMetricsData[queryKey]) {
                newFullMetricsData[queryKey] = generateQueryMetrics(queryKey)
            }
        })

        if (Object.keys(newFullMetricsData).length > 0) {
            setFullMetricsData(prev => ({
                ...prev,
                ...newFullMetricsData
            }))
        }
    }, [selectedQueries])

    // Filter data based on selected time period
    useEffect(() => {
        if (Object.keys(fullMetricsData).length === 0) return

        const hours = parseInt(timePeriod)
        const newMetricsData: Record<string, QueryMetrics> = {}

        selectedQueries.forEach(queryKey => {
            const fullData = fullMetricsData[queryKey]
            if (!fullData) return

            // Filter time series data for the selected time period
            const traffic = filterTimeSeriesData(fullData.fullTrafficData, hours)
            const latency = filterTimeSeriesData(fullData.fullLatencyData, hours)
            const errorRate = filterTimeSeriesData(fullData.fullErrorRateData, hours)

            // Calculate aggregate metrics based on filtered data
            const avgTraffic = traffic.reduce((sum, point) => sum + point.value, 0) / traffic.length
            const avgLatency = latency.reduce((sum, point) => sum + point.value, 0) / latency.length
            const avgErrorRate = errorRate.reduce((sum, point) => sum + point.value, 0) / errorRate.length

            // Calculate total requests based on average RPS and time period
            const totalRequests = Math.floor(avgTraffic * hours * 3600)

            // Calculate percentiles
            const sortedLatencies = [...latency].sort((a, b) => a.value - b.value)
            const p95Index = Math.floor(sortedLatencies.length * 0.95)
            const p99Index = Math.floor(sortedLatencies.length * 0.99)
            const p95Latency = sortedLatencies[p95Index]?.value || avgLatency * 1.5
            const p99Latency = sortedLatencies[p99Index]?.value || avgLatency * 2

            newMetricsData[queryKey] = {
                traffic,
                latency,
                errorRate,
                totalRequests,
                avgLatency,
                errorPercentage: avgErrorRate,
                p95Latency,
                p99Latency
            }
        })

        setMetricsData(newMetricsData)
    }, [fullMetricsData, selectedQueries, timePeriod])

    // Reset chart view mode when selected queries change
    useEffect(() => {
        if (!selectedQueries.includes(chartViewMode) && chartViewMode !== "average") {
            setChartViewMode("average")
        }
    }, [selectedQueries, chartViewMode])

    // Filter queries based on search
    const filteredQueries = Object.entries(endpoints).filter(([key, endpoint]) =>
        endpoint.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        key.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const toggleQuerySelection = (queryKey: string) => {
        setSelectedQueries(prev =>
            prev.includes(queryKey)
                ? prev.filter(k => k !== queryKey)
                : [...prev, queryKey]
        )
    }

    const getTimePeriodLabel = () => {
        switch (timePeriod) {
            case "1": return "Last 1 Hour"
            case "6": return "Last 6 Hours"
            case "24": return "Last 24 Hours"
            default: return "Last 1 Hour"
        }
    }

    // Calculate average metrics
    const getAverageMetrics = () => {
        if (selectedQueries.length === 0) return null

        const selectedMetrics = selectedQueries.map(key => metricsData[key]).filter(Boolean)
        if (selectedMetrics.length === 0) return null

        // Average time series data
        const averagedTraffic = aggregateTimeSeries(selectedMetrics.map(m => m.traffic))
        const averagedLatency = aggregateTimeSeries(selectedMetrics.map(m => m.latency))
        const averagedErrorRate = aggregateTimeSeries(selectedMetrics.map(m => m.errorRate))

        // Average summary metrics
        const totalRequests = selectedMetrics.reduce((sum, m) => sum + m.totalRequests, 0)
        const avgLatency = selectedMetrics.reduce((sum, m) => sum + m.avgLatency, 0) / selectedMetrics.length
        const avgErrorRate = selectedMetrics.reduce((sum, m) => sum + m.errorPercentage, 0) / selectedMetrics.length
        const avgP95Latency = selectedMetrics.reduce((sum, m) => sum + m.p95Latency, 0) / selectedMetrics.length
        const avgP99Latency = selectedMetrics.reduce((sum, m) => sum + m.p99Latency, 0) / selectedMetrics.length

        return {
            traffic: averagedTraffic,
            latency: averagedLatency,
            errorRate: averagedErrorRate,
            totalRequests,
            avgLatency,
            errorPercentage: avgErrorRate,
            p95Latency: avgP95Latency,
            p99Latency: avgP99Latency
        }
    }

    const averageMetrics = getAverageMetrics()

    // Get the metrics to display based on chart view mode
    const getDisplayMetrics = () => {
        if (chartViewMode === "average" || selectedQueries.length === 1) {
            return averageMetrics
        }
        return metricsData[chartViewMode]
    }

    const displayMetrics = getDisplayMetrics()

    // Get the title for the current chart view
    const getChartTitle = () => {
        if (chartViewMode === "average") {
            return selectedQueries.length === 1
                ? endpoints[selectedQueries[0]]?.name || 'Unknown Query'
                : `Average (${selectedQueries.length} queries)`
        }
        return endpoints[chartViewMode]?.name || 'Unknown Query'
    }

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
                                    <BreadcrumbPage>Analytics</BreadcrumbPage>
                                </BreadcrumbItem>
                            </BreadcrumbList>
                        </Breadcrumb>
                    </div>
                </header>

                <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold">Query Analytics</h1>
                            <div className="flex items-center gap-2">
                                <p className="text-muted-foreground">Monitor API performance, traffic patterns, and error rates</p>
                                {endpointsError && (
                                    <Badge variant="secondary" className="text-xs">
                                        {endpointsError}
                                    </Badge>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
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
                            <Badge variant="outline" className="flex items-center gap-1">
                                <Activity className="h-3 w-3" />
                                {getTimePeriodLabel()}
                            </Badge>
                            <Badge variant="secondary">
                                {selectedQueries.length} {selectedQueries.length === 1 ? 'query' : 'queries'} selected
                            </Badge>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="flex items-center gap-4">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search queries..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <Select value={timePeriod} onValueChange={setTimePeriod}>
                            <SelectTrigger className="w-40">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="1">Last 1 Hour</SelectItem>
                                <SelectItem value="6">Last 6 Hours</SelectItem>
                                <SelectItem value="24">Last 24 Hours</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Query Selection */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <Filter className="h-5 w-5" />
                                    Available Queries
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setSelectedQueries([])}
                                >
                                    Clear All
                                </Button>
                            </CardTitle>
                            <CardDescription>
                                Click on queries to add/remove them from analytics. Select multiple queries to see aggregated metrics.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {endpointsLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <div className="text-center">
                                        <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
                                        <p className="text-lg font-medium">Loading endpoints...</p>
                                        <p className="text-sm text-muted-foreground">Fetching API endpoints from backend</p>
                                    </div>
                                </div>
                            ) : filteredQueries.length > 0 ? (
                                <div
                                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-h-64 overflow-y-auto p-2 pr-4 custom-scrollbar"
                                    style={{
                                        scrollbarWidth: 'thin',
                                        scrollbarColor: 'var(--muted-foreground) transparent',
                                    }}
                                >
                                    {filteredQueries.map(([key, endpoint]) => (
                                        <div
                                            key={key}
                                            className={`p-3 rounded-lg border cursor-pointer ${selectedQueries.includes(key)
                                                ? 'border-primary bg-primary/5 shadow-sm'
                                                : 'border-border'
                                                }`}
                                            onClick={() => toggleQuerySelection(key)}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium truncate">{endpoint.name}</p>
                                                    <p className="text-xs text-muted-foreground truncate">{key}</p>
                                                </div>
                                                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold badge-${endpoint.method.toLowerCase()}`}>
                                                    {endpoint.method}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-12">
                                    <div className="text-muted-foreground">
                                        {Object.keys(endpoints).length === 0 ? (
                                            <div>
                                                <div className="h-12 w-12 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                                                    ⚠️
                                                </div>
                                                <p className="text-lg font-medium">No endpoints available</p>
                                                <p className="text-sm mb-4">Unable to connect to the backend server</p>
                                                <div className="space-y-2 text-xs">
                                                    <p>Make sure the backend server is running on <code className="bg-muted px-1 rounded">http://127.0.0.1:8080</code></p>
                                                    <p>Then click the "Refresh Endpoints" button above</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                                <p className="text-lg font-medium">No endpoints found</p>
                                                <p className="text-sm">Try adjusting your search</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Aggregated Metrics Summary */}
                    {averageMetrics && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <BarChart3 className="h-5 w-5" />
                                    {selectedQueries.length === 1 ? 'Query Metrics' : 'Average Metrics'}
                                </CardTitle>
                                <CardDescription>
                                    {selectedQueries.length === 1
                                        ? `Performance metrics for ${endpoints[selectedQueries[0]]?.name || 'Unknown Query'} over ${getTimePeriodLabel().toLowerCase()}`
                                        : `Average performance metrics for ${selectedQueries.length} queries over ${getTimePeriodLabel().toLowerCase()}`
                                    }
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <Activity className="h-4 w-4 text-blue-500" />
                                            <span className="text-sm font-medium">Total Requests</span>
                                        </div>
                                        <p className="text-2xl font-bold">{averageMetrics.totalRequests.toLocaleString()}</p>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <AlertTriangle className={`h-4 w-4 ${averageMetrics.errorPercentage > 5 ? 'text-red-500' : 'text-green-500'}`} />
                                            <span className="text-sm font-medium">Error Rate</span>
                                        </div>
                                        <p className={`text-2xl font-bold ${averageMetrics.errorPercentage > 5 ? 'text-red-500' : 'text-green-500'}`}>
                                            {averageMetrics.errorPercentage.toFixed(2)}%
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <Clock className="h-4 w-4 text-green-500" />
                                            <span className="text-sm font-medium">Avg Latency</span>
                                        </div>
                                        <p className="text-2xl font-bold">{averageMetrics.avgLatency.toFixed(0)}ms</p>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <Clock className="h-4 w-4 text-orange-500" />
                                            <span className="text-sm font-medium">P99 Latency</span>
                                        </div>
                                        <p className="text-2xl font-bold">{averageMetrics.p99Latency.toFixed(0)}ms</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Charts */}
                    {averageMetrics && (
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle>Performance Charts</CardTitle>
                                        <CardDescription>
                                            Real-time performance metrics visualization
                                        </CardDescription>
                                    </div>
                                    {selectedQueries.length > 1 && (
                                        <Select
                                            value={chartViewMode}
                                            onValueChange={setChartViewMode}
                                        >
                                            <SelectTrigger className="w-[280px]">
                                                <SelectValue placeholder="View mode" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="average">
                                                    <div className="flex items-center gap-2">
                                                        <BarChart3 className="h-4 w-4" />
                                                        <span>Average View (All Queries)</span>
                                                    </div>
                                                </SelectItem>
                                                <Separator className="my-2" />
                                                {selectedQueries.map(key => {
                                                    const endpoint = endpoints[key]
                                                    if (!endpoint) return null
                                                    return (
                                                        <SelectItem key={key} value={key}>
                                                            <div className="flex items-center gap-2">
                                                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold badge-${endpoint.method.toLowerCase()}`}>
                                                                    {endpoint.method}
                                                                </span>
                                                                <span>{endpoint.name}</span>
                                                            </div>
                                                        </SelectItem>
                                                    )
                                                })}
                                            </SelectContent>
                                        </Select>
                                    )}
                                </div>
                                {chartViewMode !== "average" && selectedQueries.length > 1 && (
                                    <div className="mt-2">
                                        <Badge variant="secondary" className="text-xs">
                                            Viewing individual metrics for {endpoints[chartViewMode]?.name || 'Unknown Query'}
                                        </Badge>
                                    </div>
                                )}
                            </CardHeader>
                            <CardContent>
                                {displayMetrics ? (
                                    <div className="space-y-8">
                                        <LineChart
                                            data={displayMetrics.traffic}
                                            title={`Traffic - ${getChartTitle()}`}
                                            yLabel=" rps"
                                            color="#3b82f6"
                                            height={250}
                                            timePeriod={timePeriod}
                                        />
                                        <LineChart
                                            data={displayMetrics.latency}
                                            title={`Latency - ${getChartTitle()}`}
                                            yLabel=" ms"
                                            color="#10b981"
                                            height={250}
                                            timePeriod={timePeriod}
                                        />
                                        <LineChart
                                            data={displayMetrics.errorRate}
                                            title={`Errors - ${getChartTitle()}`}
                                            yLabel="%"
                                            color="#ef4444"
                                            height={250}
                                            timePeriod={timePeriod}
                                        />
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center h-40">
                                        <p className="text-muted-foreground">No metrics available for this query</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Detailed Metrics Table */}
                    {selectedQueries.length > 1 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <BarChart3 className="h-5 w-5" />
                                    Individual Query Breakdown
                                </CardTitle>
                                <CardDescription>
                                    Detailed metrics for each selected query
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div
                                    className="overflow-x-auto max-h-64 custom-scrollbar pr-4"
                                    style={{
                                        scrollbarWidth: 'thin',
                                        scrollbarColor: 'var(--muted-foreground) transparent',
                                    }}
                                >
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b">
                                                <th className="text-left font-medium p-2">Query</th>
                                                <th className="text-left font-medium p-2">Method</th>
                                                <th className="text-right font-medium p-2">Total Requests</th>
                                                <th className="text-right font-medium p-2">Error Rate</th>
                                                <th className="text-right font-medium p-2">Avg Latency</th>
                                                <th className="text-right font-medium p-2">P95 Latency</th>
                                                <th className="text-right font-medium p-2">P99 Latency</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedQueries.map(key => {
                                                const endpoint = endpoints[key]
                                                const metrics = metricsData[key]
                                                if (!metrics || !endpoint) return null

                                                return (
                                                    <tr key={key} className="border-b">
                                                        <td className="p-2">
                                                            <div>
                                                                <div className="font-medium">{endpoint.name}</div>
                                                                <div className="text-xs text-muted-foreground">{key}</div>
                                                            </div>
                                                        </td>
                                                        <td className="p-2">
                                                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold badge-${endpoint.method.toLowerCase()}`}>
                                                                {endpoint.method}
                                                            </span>
                                                        </td>
                                                        <td className="p-2 text-right font-mono">{metrics.totalRequests.toLocaleString()}</td>
                                                        <td className="p-2 text-right">
                                                            <span className={`font-mono ${metrics.errorPercentage > 5 ? 'text-red-600' : metrics.errorPercentage > 2 ? 'text-yellow-600' : 'text-green-600'}`}>
                                                                {metrics.errorPercentage.toFixed(2)}%
                                                            </span>
                                                        </td>
                                                        <td className="p-2 text-right font-mono">{metrics.avgLatency.toFixed(0)}ms</td>
                                                        <td className="p-2 text-right font-mono">{metrics.p95Latency.toFixed(0)}ms</td>
                                                        <td className="p-2 text-right font-mono">{metrics.p99Latency.toFixed(0)}ms</td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Empty State */}
                    {selectedQueries.length === 0 && (
                        <Card>
                            <CardContent className="flex items-center justify-center h-64">
                                <div className="text-center">
                                    <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                                    <h3 className="text-lg font-medium text-muted-foreground mb-2">No queries selected</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Select one or more queries above to view their analytics and performance metrics
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </SidebarInset>
        </SidebarProvider>
    )
}