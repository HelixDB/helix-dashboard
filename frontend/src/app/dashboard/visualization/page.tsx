'use client';

import React, { useState, useEffect, useCallback, memo, useMemo } from 'react';
import {
    ReactFlow,
    useNodesState,
    useEdgesState,
    Background,
    BackgroundVariant,
    Handle,
    Position,
    useReactFlow,
    ReactFlowProvider,
} from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, GitBranch, Circle, Maximize2, RotateCcw, Download, Check, ChevronDown, Search, X } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

import '@xyflow/react/dist/style.css';
import './visualization.css';

import { AnimatedSVGEdge } from './AnimatedSVGEdge';

interface DataItem {
    id: string;
    label?: string;
    name?: string;
    [key: string]: any;
}

interface QueryOption {
    value: string;
    label: string;
    method: string;
    type: 'node' | 'edge' | 'vector';
}

// Generic API response interface
interface ApiResponse {
    [key: string]: DataItem[] | any;
}

// Custom database schema node component
const SchemaNode = memo(({ data, selected, id }: { data: any; selected: boolean; id: string }) => {
    const [isHovered, setIsHovered] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    const formatFieldType = (key: string, value: any): string => {
        // ID fields
        if (key === 'id' || key.endsWith('_id')) return 'ID';

        // Try to infer HelixDB types based on value
        if (typeof value === 'number') {
            if (Number.isInteger(value)) return 'I32';
            return 'F64';
        }

        // String fields
        if (typeof value === 'string') {
            // Check for common patterns
            if (key.includes('date') || key.includes('timestamp')) return 'String';
            if (key.includes('amount') || key.includes('price')) return 'F64';
            if (key.includes('count') || key.includes('sequence') || key.includes('duration')) return 'I32';
            return 'String';
        }

        if (typeof value === 'boolean') return 'Bool';
        if (Array.isArray(value)) return '[F64]';

        return 'String';
    };

    const renderFields = (item: DataItem) => {
        const allFields = Object.entries(item)
            .filter(([key]) => key !== 'label');

        const fields = isExpanded ? allFields : allFields.slice(0, 5);

        return (
            <>
                {fields.map(([key, value], index) => {
                    const fieldType = formatFieldType(key, value);
                    const isId = key === 'id';

                    // Format the display value
                    let displayValue = value;
                    if (typeof value === 'string' && value.length > 30) {
                        displayValue = value.substring(0, 30) + '...';
                    } else if (typeof value === 'number') {
                        displayValue = value.toLocaleString();
                    } else if (value === null || value === undefined) {
                        displayValue = 'null';
                    }

                    return (
                        <div
                            key={key}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '6px 12px',
                                borderBottom: index < fields.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none',
                                fontSize: '11px',
                                gap: '8px'
                            }}
                        >
                            <span style={{
                                color: '#94a3b8',
                                fontSize: '10px',
                                fontFamily: 'monospace',
                                minWidth: '80px'
                            }}>
                                {key}:
                            </span>
                            <span style={{
                                flex: 1,
                                color: isId ? '#10b981' : '#e2e8f0',
                                fontWeight: isId ? '500' : '400',
                                wordBreak: 'break-word'
                            }}>
                                {displayValue}
                            </span>
                            <span style={{
                                color: '#64748b',
                                fontSize: '9px',
                                fontFamily: 'monospace',
                                marginLeft: 'auto'
                            }}>
                                {fieldType}
                            </span>
                        </div>
                    );
                })}
                {allFields.length > 5 && (
                    <div
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsExpanded(!isExpanded);
                        }}
                        style={{
                            padding: '8px 12px',
                            fontSize: '10px',
                            color: '#10b981',
                            textAlign: 'center',
                            borderTop: '1px solid rgba(255,255,255,0.1)',
                            cursor: 'pointer',
                            background: 'rgba(16, 185, 129, 0.1)'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.2)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)'}
                    >
                        {isExpanded ? '- Show Less' : `+ Show ${allFields.length - 5} More Properties`}
                    </div>
                )}
            </>
        );
    };

    return (
        <div
            onMouseEnter={() => {
                setIsHovered(true);
                data.onNodeHover?.(id);
            }}
            onMouseLeave={() => {
                setIsHovered(false);
                data.onNodeHover?.(null);
            }}
            style={{
                background: 'rgba(42, 42, 42, 0.98)',
                border: `1px solid ${isHovered ? '#10b981' : selected ? '#3b82f6' : 'rgba(80, 80, 80, 0.6)'}`,
                borderRadius: '8px',
                color: '#ffffff',
                width: '320px',
                cursor: 'pointer',
                boxShadow: selected
                    ? '0 0 0 2px #3b82f6'
                    : '0 2px 4px rgba(0, 0, 0, 0.2)'
            }}
        >
            <Handle
                type="source"
                position={Position.Top}
                style={{
                    background: '#10b981',
                    border: 'none',
                    width: '8px',
                    height: '8px',
                    opacity: isHovered ? 1 : 0.5
                }}
            />
            <Handle
                type="source"
                position={Position.Bottom}
                style={{
                    background: '#10b981',
                    border: 'none',
                    width: '8px',
                    height: '8px',
                    opacity: isHovered ? 1 : 0.5
                }}
            />
            <Handle
                type="source"
                position={Position.Left}
                style={{
                    background: '#10b981',
                    border: 'none',
                    width: '8px',
                    height: '8px',
                    opacity: isHovered ? 1 : 0.5
                }}
            />
            <Handle
                type="source"
                position={Position.Right}
                style={{
                    background: '#10b981',
                    border: 'none',
                    width: '8px',
                    height: '8px',
                    opacity: isHovered ? 1 : 0.5
                }}
            />
            <Handle
                type="target"
                position={Position.Top}
                style={{
                    background: '#10b981',
                    border: 'none',
                    width: '8px',
                    height: '8px',
                    opacity: isHovered ? 1 : 0.5
                }}
            />
            <Handle
                type="target"
                position={Position.Bottom}
                style={{
                    background: '#10b981',
                    border: 'none',
                    width: '8px',
                    height: '8px',
                    opacity: isHovered ? 1 : 0.5
                }}
            />
            <Handle
                type="target"
                position={Position.Left}
                style={{
                    background: '#10b981',
                    border: 'none',
                    width: '8px',
                    height: '8px',
                    opacity: isHovered ? 1 : 0.5
                }}
            />
            <Handle
                type="target"
                position={Position.Right}
                style={{
                    background: '#10b981',
                    border: 'none',
                    width: '8px',
                    height: '8px',
                    opacity: isHovered ? 1 : 0.5
                }}
            />

            <div style={{
                padding: '12px',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(50, 50, 50, 0.9)'
            }}>
                {/* <span style={{ fontSize: '12px', opacity: 0.7, color: '#64748b' }}>[TABLE]</span> */}
                <span style={{ fontWeight: '600', fontSize: '14px' }}>
                    {data.originalData.label || 'Entity'}
                </span>
            </div>

            <div>
                {renderFields(data.originalData)}
            </div>

        </div>
    );
});

const nodeTypes = {
    schema: SchemaNode,
};

const edgeTypes = {
    animatedSvg: AnimatedSVGEdge,
};

const DataVisualizationInner = () => {
    const { setCenter, getZoom } = useReactFlow();
    const [allNodes, setAllNodes] = useState<Map<string, DataItem>>(new Map());
    const [edgeData, setEdgeData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [queries, setQueries] = useState<QueryOption[]>([]);
    const [selectedQueries, setSelectedQueries] = useState<string[]>([]);
    const [loadingQueries, setLoadingQueries] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

    // Generate positions with nodes grouped by type and aligned by connections
    const generateNodePositions = useCallback((nodes: DataItem[], edges: any[]) => {
        const positions = new Map<string, { x: number; y: number }>();

        // Group nodes by their label/type
        const nodesByType = new Map<string, DataItem[]>();
        const nodeById = new Map<string, DataItem>();

        nodes.forEach(node => {
            const type = node.label || 'unknown';
            if (!nodesByType.has(type)) {
                nodesByType.set(type, []);
            }
            nodesByType.get(type)!.push(node);
            nodeById.set(node.id, node);
        });

        // Build adjacency map from edges
        const connections = new Map<string, Set<string>>();
        edges.forEach(edge => {
            if (!connections.has(edge.from_node)) {
                connections.set(edge.from_node, new Set());
            }
            if (!connections.has(edge.to_node)) {
                connections.set(edge.to_node, new Set());
            }
            connections.get(edge.from_node)!.add(edge.to_node);
            connections.get(edge.to_node)!.add(edge.from_node);
        });

        // Layout parameters
        const startX = 150;
        const startY = 150;
        const columnSpacing = 400;
        const rowSpacing = 80; // Spacing between rows
        const propertyHeight = 35; // Height per property
        const headerHeight = 50; // Header height
        const padding = 20; // Additional padding

        // Create column positions
        const typeColumns = new Map<string, number>();
        let currentX = startX;
        nodesByType.forEach((_, type) => {
            typeColumns.set(type, currentX);
            currentX += columnSpacing;
        });

        // Track positioned nodes
        const positioned = new Set<string>();
        let currentY = startY;

        // Position connected nodes in rows
        nodes.forEach(node => {
            if (positioned.has(node.id)) return;

            // Get all connected nodes
            const rowNodes = new Map<string, DataItem>();
            rowNodes.set(node.id, node);
            positioned.add(node.id);

            // Find all directly connected nodes
            const connected = connections.get(node.id);
            if (connected) {
                connected.forEach(connectedId => {
                    if (!positioned.has(connectedId) && nodeById.has(connectedId)) {
                        const connectedNode = nodeById.get(connectedId)!;
                        rowNodes.set(connectedId, connectedNode);
                        positioned.add(connectedId);
                    }
                });
            }

            // Calculate max height for this row
            let maxHeight = 0;
            rowNodes.forEach(rowNode => {
                const propertyCount = Object.keys(rowNode).filter(key => key !== 'label').length;
                const displayedProperties = Math.min(propertyCount, 5);
                const hasExpander = propertyCount > 5 ? 40 : 0;
                const nodeHeight = headerHeight + (displayedProperties * propertyHeight) + padding + hasExpander;
                maxHeight = Math.max(maxHeight, nodeHeight);
            });

            // Position all nodes in this row
            rowNodes.forEach(rowNode => {
                const type = rowNode.label || 'unknown';
                const x = typeColumns.get(type) || startX;
                positions.set(rowNode.id, { x, y: currentY });
            });

            // Move to next row
            currentY += maxHeight + rowSpacing;
        });

        // Position any remaining unconnected nodes
        nodesByType.forEach((nodesOfType, type) => {
            const x = typeColumns.get(type) || startX;
            nodesOfType.forEach(node => {
                if (!positioned.has(node.id)) {
                    positions.set(node.id, { x, y: currentY });
                    const propertyCount = Object.keys(node).filter(key => key !== 'label').length;
                    const displayedProperties = Math.min(propertyCount, 5);
                    const hasExpander = propertyCount > 5 ? 40 : 0;
                    const nodeHeight = headerHeight + (displayedProperties * propertyHeight) + padding + hasExpander;
                    currentY += nodeHeight + rowSpacing;
                }
            });
        });

        return positions;
    }, []);

    // Different colors for different node types based on label
    const getNodeColor = useCallback((item: DataItem): string => {
        const label = item.label?.toLowerCase() || '';
        if (label.includes('patient')) return '#3b82f6'; // Blue
        if (label.includes('doctor')) return '#10b981'; // Green
        if (label.includes('nurse')) return '#8b5cf6'; // Purple
        if (label.includes('department')) return '#f59e0b'; // Amber
        return '#6b7280'; // Default gray
    }, []);

    // Convert generic data to ReactFlow nodes with collapsible functionality
    const createDataNodes = useCallback((nodeMap: Map<string, DataItem>, edges: any[], maxNodes = 500) => {
        const nodes = Array.from(nodeMap.values()).slice(0, maxNodes);
        const positions = generateNodePositions(nodes, edges);

        return nodes.map((item) => {
            const position = positions.get(item.id) || { x: 0, y: 0 };
            return {
                id: item.id,
                type: 'schema',
                position,
                data: {
                    originalData: item,
                    nodeColor: getNodeColor(item),
                    onNodeHover: setHoveredNodeId
                }
            };
        });
    }, [generateNodePositions, getNodeColor, setHoveredNodeId]);

    // Fetch available queries
    const fetchQueries = async () => {
        try {
            const response = await fetch('http://127.0.0.1:8080/api/endpoints');
            const data = await response.json();

            const queryOptions: QueryOption[] = data.map((endpoint: any) => {
                let type: 'node' | 'edge' | 'vector' = 'node';

                if (endpoint.query_name.toLowerCase().includes('edge') ||
                    endpoint.query_name.toLowerCase().includes('assign') ||
                    endpoint.query_name.toLowerCase().includes('link') ||
                    endpoint.query_name.toLowerCase().includes('referral')) {
                    type = 'edge';
                } else if (endpoint.query_name.toLowerCase().includes('vector') ||
                    endpoint.query_name.toLowerCase().includes('note')) {
                    type = 'vector';
                }

                return {
                    value: endpoint.query_name,
                    label: endpoint.query_name
                        .replace(/([A-Z])/g, ' $1')
                        .replace(/^./, (str: string) => str.toUpperCase())
                        .trim(),
                    method: endpoint.method,
                    type
                };
            });

            setQueries(queryOptions);
            setLoadingQueries(false);
        } catch (error) {
            console.error('Failed to fetch queries:', error);
            setLoadingQueries(false);
        }
    };

    useEffect(() => {
        fetchQueries();
    }, []);

    // Create edges from the edge data
    const createEdges = useCallback((edgesData: any[], hoveredNodeId: string | null) => {
        return edgesData.map((edge) => {
            const isHighlighted = hoveredNodeId && (edge.from_node === hoveredNodeId || edge.to_node === hoveredNodeId);

            return {
                id: edge.id,
                source: edge.from_node,
                target: edge.to_node,
                type: 'animatedSvg',
                label: edge.label,
                data: {
                    isHighlighted: isHighlighted
                }
            };
        });
    }, []);

    const initialNodes = createDataNodes(allNodes, edgeData);
    const initialEdges = createEdges(edgeData, hoveredNodeId);

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    // Execute multiple queries and fetch data
    const executeQueries = async () => {
        if (selectedQueries.length === 0) return;

        setLoading(true);
        setError(null);

        try {
            // Execute all selected queries in parallel
            const promises = selectedQueries.map(async (queryName) => {
                const queryOption = queries.find(q => q.value === queryName);
                if (!queryOption) return null;

                const response = await fetch(`http://127.0.0.1:8080/api/query/${queryName}`);
                if (!response.ok) {
                    throw new Error(`HTTP error for ${queryName}! status: ${response.status}`);
                }

                const data: ApiResponse = await response.json();
                return { queryOption, data };
            });

            const results = await Promise.all(promises);

            // Process results
            const newNodes = new Map(allNodes);
            const newEdges: any[] = [];

            results.forEach((result) => {
                if (!result) return;

                const { queryOption, data } = result;

                // Extract the data array from the response
                let dataArray: DataItem[] = [];

                // Find the first array property in the response
                for (const key in data) {
                    if (Array.isArray(data[key])) {
                        dataArray = data[key];
                        break;
                    }
                }

                // If no array found, check if the response itself is an array
                if (dataArray.length === 0 && Array.isArray(data)) {
                    dataArray = data;
                }

                // Update the appropriate state based on query type
                if (queryOption.type === 'edge') {
                    newEdges.push(...dataArray);
                } else {
                    // For node queries, add to nodes map
                    dataArray.forEach(item => {
                        newNodes.set(item.id, item);
                    });
                }
            });

            setAllNodes(newNodes);
            setEdgeData(newEdges);

        } catch (error) {
            console.error('Failed to execute queries:', error);
            setError(error instanceof Error ? error.message : 'Failed to execute queries');
        } finally {
            setLoading(false);
        }
    };

    // Update nodes and edges when data changes (but not hover state)
    useEffect(() => {
        const newNodes = createDataNodes(allNodes, edgeData);
        setNodes(newNodes);
    }, [allNodes, edgeData]);

    // Update edges when hover state changes
    useEffect(() => {
        const newEdges = createEdges(edgeData, hoveredNodeId);
        setEdges(newEdges);
    }, [edgeData, hoveredNodeId]);

    // Toggle query selection
    const toggleQuery = (queryValue: string) => {
        setSelectedQueries(prev => {
            if (prev.includes(queryValue)) {
                return prev.filter(q => q !== queryValue);
            } else {
                return [...prev, queryValue];
            }
        });
    };

    // Clear all data
    const clearGraph = () => {
        setAllNodes(new Map());
        setEdgeData([]);
        setSelectedQueries([]);
    };

    // Handle node click to focus
    const onNodeClick = useCallback((_event: React.MouseEvent, node: any) => {
        const zoom = getZoom();
        setCenter(node.position.x, node.position.y, {
            zoom: Math.max(1.5, zoom),
            duration: 800
        });
    }, [setCenter, getZoom]);

    if (loading) {
        return (
            <div className="visualization-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ color: '#ffffff', fontSize: '18px' }}>Loading data...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="visualization-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ color: '#ef4444', fontSize: '18px' }}>Error: {error}</div>
            </div>
        );
    }

    return (
        <div className="visualization-container">
            {/* Control Panel */}
            <div className="control-panel">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="w-[300px] justify-between glass-card">
                                    {selectedQueries.length === 0 ? (
                                        loadingQueries ? "Loading queries..." : "Select queries"
                                    ) : (
                                        `${selectedQueries.length} selected`
                                    )}
                                    <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-[300px] glass-card max-h-[400px] overflow-y-auto" align="start" onInteractOutside={(e) => e.preventDefault()}>
                                <div className="flex items-center justify-between px-2 pb-2">
                                    <DropdownMenuLabel className="px-0">Select queries to visualize</DropdownMenuLabel>
                                    {selectedQueries.length > 0 && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setSelectedQueries([])}
                                            className="h-6 px-2 text-xs"
                                        >
                                            Clear all
                                        </Button>
                                    )}
                                </div>
                                <div className="px-2 pb-2">
                                    <div className="relative">
                                        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                            placeholder="Search queries..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="h-8 pl-8 pr-8"
                                            onClick={(e) => e.stopPropagation()}
                                            onKeyDown={(e) => e.stopPropagation()}
                                            autoFocus
                                        />
                                        {searchTerm && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setSearchTerm('')}
                                                className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 p-0"
                                            >
                                                <X className="h-3 w-3" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                                <DropdownMenuSeparator />

                                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                                    Node Operations
                                </DropdownMenuLabel>
                                {queries
                                    .filter(q => q.type === 'node')
                                    .filter(q => q.label.toLowerCase().includes(searchTerm.toLowerCase()))
                                    .map(query => (
                                        <DropdownMenuCheckboxItem
                                            key={query.value}
                                            checked={selectedQueries.includes(query.value)}
                                            onCheckedChange={() => toggleQuery(query.value)}
                                            onSelect={(e) => e.preventDefault()}
                                        >
                                            <div className="flex items-center gap-2 w-full">
                                                <Circle className="w-3 h-3 text-blue-500" />
                                                <span className="flex-1">{query.label}</span>
                                                <span className={`text-xs badge-${query.method.toLowerCase()}`}>
                                                    {query.method}
                                                </span>
                                            </div>
                                        </DropdownMenuCheckboxItem>
                                    ))}

                                <DropdownMenuSeparator />
                                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                                    Edge Operations
                                </DropdownMenuLabel>
                                {queries
                                    .filter(q => q.type === 'edge')
                                    .filter(q => q.label.toLowerCase().includes(searchTerm.toLowerCase()))
                                    .map(query => (
                                        <DropdownMenuCheckboxItem
                                            key={query.value}
                                            checked={selectedQueries.includes(query.value)}
                                            onCheckedChange={() => toggleQuery(query.value)}
                                            onSelect={(e) => e.preventDefault()}
                                        >
                                            <div className="flex items-center gap-2 w-full">
                                                <GitBranch className="w-3 h-3 text-green-500" />
                                                <span className="flex-1">{query.label}</span>
                                                <span className={`text-xs badge-${query.method.toLowerCase()}`}>
                                                    {query.method}
                                                </span>
                                            </div>
                                        </DropdownMenuCheckboxItem>
                                    ))}

                                <DropdownMenuSeparator />
                                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                                    Vector Operations
                                </DropdownMenuLabel>
                                {queries
                                    .filter(q => q.type === 'vector')
                                    .filter(q => q.label.toLowerCase().includes(searchTerm.toLowerCase()))
                                    .map(query => (
                                        <DropdownMenuCheckboxItem
                                            key={query.value}
                                            checked={selectedQueries.includes(query.value)}
                                            onCheckedChange={() => toggleQuery(query.value)}
                                            onSelect={(e) => e.preventDefault()}
                                        >
                                            <div className="flex items-center gap-2 w-full">
                                                <Maximize2 className="w-3 h-3 text-purple-500" />
                                                <span className="flex-1">{query.label}</span>
                                                <span className={`text-xs badge-${query.method.toLowerCase()}`}>
                                                    {query.method}
                                                </span>
                                            </div>
                                        </DropdownMenuCheckboxItem>
                                    ))}
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <Button
                            variant="default"
                            size="sm"
                            className="glass-hover"
                            disabled={selectedQueries.length === 0 || loading}
                            onClick={executeQueries}
                        >
                            <Plus className="w-4 h-4 mr-1" />
                            Add to Graph
                        </Button>
                    </div>

                    <div className="ml-auto flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="glass-hover"
                            onClick={clearGraph}
                        >
                            <RotateCcw className="w-4 h-4 mr-1" />
                            Clear Graph
                        </Button>
                        <Button variant="outline" size="sm" className="glass-hover">
                            <Download className="w-4 h-4 mr-1" />
                            Export
                        </Button>
                    </div>
                </div>
            </div>

            <div style={{ position: 'absolute', bottom: '10px', left: '10px', zIndex: 10, color: '#e0e0e0', background: 'rgba(40, 40, 40, 0.9)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(80, 80, 80, 0.4)' }}>
                {allNodes.size > 0 ?
                    `Displaying ${Math.min(allNodes.size, 500)} of ${allNodes.size} nodes (${edgeData.length} connections)` :
                    'Select queries and click "Add to Graph" to start visualizing'
                }
            </div>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={onNodeClick}
                fitView
                nodesDraggable={true}
                nodesConnectable={false}
                elementsSelectable={true}
                panOnDrag={true}
                selectNodesOnDrag={false}
                nodeOrigin={[0.5, 0.5]}
                maxZoom={4}
                minZoom={0.2}
                defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
                proOptions={{ hideAttribution: true }}
                autoPanOnNodeDrag={false}
                autoPanOnConnect={false}
                connectionMode="loose"
                elevateNodesOnSelect={false}
                disableKeyboardA11y={true}
            >
                <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#2a2a2a" />
            </ReactFlow>
        </div>
    );
};

const DataVisualization = () => {
    return (
        <ReactFlowProvider>
            <DataVisualizationInner />
        </ReactFlowProvider>
    );
};

export default DataVisualization;