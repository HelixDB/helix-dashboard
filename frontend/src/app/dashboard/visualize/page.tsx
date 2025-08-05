'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { AppSidebar } from "@/components/app-sidebar"
import {
    SidebarInset,
    SidebarProvider,
    SidebarTrigger,
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuCheckboxItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, GitBranch, Circle, RotateCcw, Download, Check, ChevronDown, Search, X, Settings } from 'lucide-react';

interface DataItem {
    id: string;
    label?: string;
    name?: string;
    [key: string]: any;
}

interface SchemaNode {
    name: string;
    properties: string[];
}

interface SchemaEdge {
    name: string;
    properties: string[];
}

interface SchemaInfo {
    nodes: SchemaNode[];
    edges: SchemaEdge[];
}

interface NodesEdgesResponse {
    data: {
        nodes: DataItem[];
        edges: any[];
        vectors: any[];
    };
    stats?: {
        num_nodes: number;
        num_edges: number;
        num_vectors: number;
    };
}

interface ApiResponse {
    [key: string]: DataItem[] | any;
}

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

const DataVisualization = () => {
    const fgRef = useRef<any>(null);
    const [allNodes, setAllNodes] = useState<Map<string, DataItem>>(new Map());
    const [edgeData, setEdgeData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [schema, setSchema] = useState<SchemaInfo>({ nodes: [], edges: [] });
    const [selectedNodeTypes, setSelectedNodeTypes] = useState<string[]>([]);
    const [selectedNodeLabel, setSelectedNodeLabel] = useState<string>('');
    const [loadingSchema, setLoadingSchema] = useState(true);
    const [showAllNodes, setShowAllNodes] = useState(false);
    const [loadingNodeDetails, setLoadingNodeDetails] = useState(false);
    const [loadingConnections, setLoadingConnections] = useState(false);
    const [showConnections, setShowConnections] = useState(false);
    const [, forceUpdate] = useState({});
    const [searchTerm, setSearchTerm] = useState('');
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [topK, setTopK] = useState<number>(100);
    const [topKInput, setTopKInput] = useState<string>('100');
    const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
    const hasZoomedRef = useRef(false);
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
    const isDraggingRef = useRef(false);
    const lastZoomRef = useRef<number>(1);
    const zoomTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const capturedCenterRef = useRef<{ x: number; y: number } | null>(null);
    const capturedZoomRef = useRef<number | null>(null);
    const [capturedPositions, setCapturedPositions] = useState<Map<string, { x: number, y: number }>>(new Map());
    const [graphReady, setGraphReady] = useState(false);

    // Simple zoom to fit when focused node changes
    useEffect(() => {
        if (!fgRef.current) return;

        if (focusedNodeId) {
            // When focusing on a single node, center and set a reasonable zoom level
            setTimeout(() => {
                if (fgRef.current) {
                    fgRef.current.centerAt(0, 0, 400);
                    fgRef.current.zoom(1.5, 400); // Fixed zoom level for single node view
                }
            }, 300);
        }
    }, [focusedNodeId]);

    const getNodeColor = useCallback((item: DataItem): string => {
        const label = item.label || 'Entity';

        let hash = 0;
        for (let i = 0; i < label.length; i++) {
            const char = label.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }

        const colors = [
            '#3b82f6',
            '#10b981',
            '#f59e0b',
            '#8b5cf6',
            '#06b6d4',
            '#ec4899',
            '#f97316',
            '#14b8a6',
            '#a855f7',
            '#eab308'
        ];

        return colors[Math.abs(hash) % colors.length];
    }, []);

    const formatFieldType = (key: string, value: any): string => {
        if (key === 'id' || key.endsWith('_id')) return 'ID';
        if (typeof value === 'number') return Number.isInteger(value) ? 'I32' : 'F64';
        if (typeof value === 'string') return 'String';
        if (typeof value === 'boolean') return 'Bool';
        if (Array.isArray(value)) return '[F64]';
        return 'String';
    };

    const drawNode = (node: any, ctx: CanvasRenderingContext2D, globalScale: number, isHovered: boolean) => {
        const currentNodeCount = allNodes.size;

        const isNodeInViewport = () => {
            if (!fgRef.current) return true;

            const viewportWidth = ctx.canvas.width;
            const viewportHeight = ctx.canvas.height;

            const screenCoords = fgRef.current.graph2ScreenCoords(node.x, node.y);

            const padding = 100;

            return screenCoords.x >= -padding &&
                screenCoords.x <= viewportWidth + padding &&
                screenCoords.y >= -padding &&
                screenCoords.y <= viewportHeight + padding;
        };

        const thresholdLow = 0.8;
        const thresholdHigh = 1.3;
        let renderMode: 'simple' | 'detailed' | 'transition' = 'simple';
        let detailOpacity = 0;

        if (currentNodeCount < 50) {
            renderMode = 'detailed';
            detailOpacity = 1;
        } else {
            if (isNodeInViewport() && globalScale > thresholdHigh) {
                renderMode = 'detailed';
                detailOpacity = 1;
            } else if (isNodeInViewport() && globalScale > thresholdLow) {
                renderMode = 'transition';
                const progress = (globalScale - thresholdLow) / (thresholdHigh - thresholdLow);
                detailOpacity = Math.pow(progress, 2);
            } else {
                renderMode = 'simple';
                detailOpacity = 0;
            }
        }

        let cardWidth, cardHeight;
        if (detailOpacity > 0 || currentNodeCount < 50) {
            const data = node.originalData as DataItem;
            const label = data.label || 'Entity';
            const allFields = Object.entries(data).filter(([key]) => key !== 'label' && key !== 'id');
            const isExpanded = expandedNodes.has(node.id);
            const fields = isExpanded ? allFields : allFields.slice(0, 5);
            const isFocused = focusedNodeId === node.id;

            const nodeType = data.label?.toLowerCase() || 'entity';
            const hasSpecialAction = nodeType === 'doctor' && isFocused;
            const hasDeleteButton = (nodeType === 'doctor' || nodeType === 'patient') && isFocused;

            const padding = 12;
            const fontSize = 11;
            const headerFontSize = 14;
            const typeFontSize = 9;
            const buttonHeight = 0;

            ctx.font = `${headerFontSize}px monospace bold`;
            let maxWidth = ctx.measureText(label).width;

            ctx.font = `${fontSize}px monospace`;
            fields.forEach(([key, value]) => {
                const displayValue = typeof value === 'string' && value.length > 20 ? value.substring(0, 20) + '...' : value;
                const text = `${key}: ${displayValue}`;
                maxWidth = Math.max(maxWidth, ctx.measureText(text).width + ctx.measureText(' I32').width);
            });

            cardWidth = maxWidth + padding * 3;
            const fieldHeight = fontSize * 1.2;
            cardHeight = headerFontSize + padding * 2 + fields.length * fieldHeight + buttonHeight;
            if (allFields.length > 5) cardHeight += fieldHeight;
        }

        // Set hit area based on render mode
        if ((renderMode === 'detailed' || (renderMode === 'transition' && detailOpacity > 0.5)) && cardWidth && cardHeight) {
            node.__hitType = 'rect';
            node.__hitDimensions = [cardWidth, cardHeight];
            node.__cardDimensions = [cardWidth, cardHeight];
        } else {
            const size = isHovered ? 16 : 12;
            node.__hitType = 'circle';
            node.__hitSize = size * 1.5;
        }

        // Save context state
        const originalAlpha = ctx.globalAlpha;

        // Draw simple view
        if (renderMode === 'simple' || (renderMode === 'transition' && detailOpacity < 1)) {
            const simpleOpacity = renderMode === 'simple' ? 1 : 1 - detailOpacity;
            ctx.globalAlpha = simpleOpacity;
            const size = isHovered ? 16 : 12;
            ctx.beginPath();
            ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
            ctx.fillStyle = node.color || '#64748b';
            ctx.fill();

            if (isHovered) {
                ctx.shadowBlur = 20;
                ctx.shadowColor = node.color || '#64748b';
                ctx.fill();
                ctx.shadowBlur = 0;
            }

            ctx.strokeStyle = isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = isHovered ? 2 : 1;
            ctx.stroke();

            if (isHovered && renderMode === 'simple') {
                const label = node.originalData.title || node.originalData.label || node.originalData.name || 'Entity';
                ctx.font = '12px monospace';
                ctx.fillStyle = '#ffffff';
                ctx.fillText(label, node.x + size + 6, node.y + 4);
            }
            ctx.globalAlpha = originalAlpha;
        }

        // Draw detailed view
        if (detailOpacity > 0) {
            const data = node.originalData as DataItem;
            const label = data.label || 'Entity';
            const allFields = Object.entries(data).filter(([key]) => key !== 'label' && key !== 'id');
            const isExpanded = expandedNodes.has(node.id);
            const fields = isExpanded ? allFields : allFields.slice(0, 5);
            const isFocused = focusedNodeId === node.id;

            const nodeType = data.label?.toLowerCase() || 'entity';
            const hasSpecialAction = nodeType === 'doctor' && isFocused;
            const hasDeleteButton = (nodeType === 'doctor' || nodeType === 'patient') && isFocused;

            const padding = 12;
            const fontSize = 11;
            const headerFontSize = 14;
            const typeFontSize = 9;
            const buttonHeight = 0;

            ctx.globalAlpha = detailOpacity;

            const gradient = ctx.createLinearGradient(
                node.x - cardWidth! / 2,
                node.y - cardHeight! / 2,
                node.x - cardWidth! / 2,
                node.y + cardHeight! / 2
            );
            gradient.addColorStop(0, '#1e293b');
            gradient.addColorStop(1, '#0f172a');
            ctx.fillStyle = gradient;
            ctx.fillRect(node.x - cardWidth! / 2, node.y - cardHeight! / 2, cardWidth!, cardHeight!);

            ctx.strokeStyle = isHovered ? node.color : 'rgba(100, 116, 139, 0.5)';
            ctx.lineWidth = isHovered ? 2 : 1;
            ctx.strokeRect(node.x - cardWidth! / 2, node.y - cardHeight! / 2, cardWidth!, cardHeight!);

            ctx.fillStyle = node.color || '#64748b';
            ctx.fillRect(node.x - cardWidth! / 2, node.y - cardHeight! / 2, cardWidth!, 3);

            // Header
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.font = `${headerFontSize}px monospace bold`;
            ctx.fillText(label, node.x, node.y - cardHeight! / 2 + headerFontSize + padding / 2);

            // Fields
            let yPos = node.y - cardHeight! / 2 + headerFontSize + padding * 1.5;
            ctx.textAlign = 'left';
            ctx.font = `${fontSize}px monospace`;
            fields.forEach(([key, value]) => {
                const fieldType = formatFieldType(key, value);
                const displayValue = typeof value === 'string' && value.length > 20 ? value.substring(0, 20) + '...' : String(value);
                const isId = key === 'id';

                ctx.fillStyle = '#64748b';
                ctx.fillText(`${key}:`, node.x - cardWidth! / 2 + padding, yPos + fontSize / 1.5);

                ctx.fillStyle = isId ? '#22d3ee' : '#cbd5e1';
                ctx.fillText(displayValue, node.x - cardWidth! / 2 + padding + ctx.measureText(`${key}: `).width, yPos + fontSize / 1.5);

                ctx.fillStyle = '#475569';
                ctx.font = `${typeFontSize}px monospace`;
                ctx.fillText(fieldType, node.x + cardWidth! / 2 - padding - ctx.measureText(fieldType).width, yPos + fontSize / 1.5);
                ctx.font = `${fontSize}px monospace`;

                yPos += fontSize * 1.2;
            });

            // Expand/collapse
            if (allFields.length > 5) {
                const toggleText = isExpanded ? '- Show Less' : `+ ${allFields.length - 5} More`;
                const toggleY = yPos + fontSize / 1.5;

                const toggleWidth = ctx.measureText(toggleText).width;
                const toggleX = -toggleWidth / 2;
                node.__moreBounds = {
                    x: toggleX,
                    y: yPos - node.y,
                    width: toggleWidth,
                    height: fontSize * 1.2
                };

                ctx.fillStyle = isExpanded ? '#f87171' : '#34d399';
                ctx.textAlign = 'center';
                ctx.font = `10px monospace`;
                ctx.fillText(toggleText, node.x, toggleY);

                ctx.strokeStyle = isExpanded ? '#f87171' : '#34d399';
                ctx.lineWidth = 0.5;
                ctx.setLineDash([2, 2]);
                ctx.beginPath();
                ctx.moveTo(node.x - toggleWidth / 2, toggleY + 2);
                ctx.lineTo(node.x + toggleWidth / 2, toggleY + 2);
                ctx.stroke();
                ctx.setLineDash([]);
                yPos += fontSize * 1.2;
            }


            ctx.globalAlpha = originalAlpha;
        }
    };

    // Compute graph data from state
    const graphData = useMemo(() => {

        const allNodesList = Array.from(allNodes.values()).map((item, index) => {
            // Create a hash from the node ID for consistent positioning
            let hash = 0;
            for (let i = 0; i < item.id.length; i++) {
                hash = ((hash << 5) - hash) + item.id.charCodeAt(i);
                hash = hash & hash;
            }

            const totalNodes = allNodes.size;
            const angle = (index * 137.5 + hash % 360) * Math.PI / 180;
            const baseRadius = 300;
            const radiusVariation = (hash % 200) + baseRadius;
            const radius = baseRadius + (index * 50) + radiusVariation;

            return {
                id: item.id,
                originalData: item,
                color: getNodeColor(item),
                x: Math.cos(angle) * radius,
                y: Math.sin(angle) * radius,
            };
        });

        let nodes = allNodesList;
        if (focusedNodeId) {
            nodes = allNodesList.filter(node => {
                if (node.id === focusedNodeId) return true;
                return edgeData.some(edge =>
                    (edge.from_node === focusedNodeId && edge.to_node === node.id) ||
                    (edge.to_node === focusedNodeId && edge.from_node === node.id)
                );
            });
        }

        const nodeIds = new Set(nodes.map(n => n.id));
        const links = edgeData
            .filter(edge => nodeIds.has(edge.from_node) && nodeIds.has(edge.to_node))
            .map(edge => ({
                source: edge.from_node,
                target: edge.to_node,
                label: edge.label,
                isVirtual: false
            }));

        return { nodes, links };
    }, [allNodes, edgeData, getNodeColor, focusedNodeId]);

    // Function to compute and update graph data
    const updateGraph = useCallback(() => {
        if (!fgRef.current) {
            console.warn('fgRef.current is null');
            return;
        }
        if (!containerRef.current) {
            console.warn('containerRef.current is null');
            return;
        }

        // Check if graphData method exists
        if (typeof fgRef.current.graphData !== 'function') {
            console.warn('ForceGraph not yet initialized - graphData is not a function');
            return;
        }


        const currentGraph = fgRef.current.graphData();
        const existingNodeIds = new Set(currentGraph.nodes.map((n: any) => n.id));

        const { clientWidth: width, clientHeight: height } = containerRef.current;
        const centerScreenX = width / 2;
        const centerScreenY = height / 2;

        // Check if screen2GraphCoords method exists
        if (typeof fgRef.current.screen2GraphCoords !== 'function') {
            console.warn('ForceGraph screen2GraphCoords not available');
            return;
        }

        const center = fgRef.current.screen2GraphCoords(centerScreenX, centerScreenY);

        const allNodesList = Array.from(allNodes.values()).map((item) => {
            const isNew = !existingNodeIds.has(item.id);
            const node: any = {
                id: item.id,
                originalData: item,
                color: getNodeColor(item),
            };
            if (isNew) {
                node.x = center.x + (Math.random() - 0.5) * 50;
                node.y = center.y + (Math.random() - 0.5) * 50;
            }
            return node;
        });

        let nodes = allNodesList;
        if (focusedNodeId) {
            nodes = allNodesList.filter(node => {
                if (node.id === focusedNodeId) return true;
                return edgeData.some(edge =>
                    (edge.from_node === focusedNodeId && edge.to_node === node.id) ||
                    (edge.to_node === focusedNodeId && edge.from_node === node.id)
                );
            });
        }

        const nodeIds = new Set(nodes.map(n => n.id));
        const links = edgeData
            .filter(edge => nodeIds.has(edge.from_node) && nodeIds.has(edge.to_node))
            .map(edge => ({
                source: edge.from_node,
                target: edge.to_node,
                label: edge.label,
                isVirtual: false
            }));


        fgRef.current.graphData({ nodes, links });
    }, [allNodes, edgeData, getNodeColor, focusedNodeId]);

    const toggleNodeType = (nodeType: string) => {
        setSelectedNodeTypes(prev =>
            prev.includes(nodeType)
                ? prev.filter(t => t !== nodeType)
                : [...prev, nodeType]
        );
    };


    // Configure force simulation
    useEffect(() => {
        if (fgRef.current) {
            fgRef.current.d3Force('charge').strength(-1500);
            fgRef.current.d3Force('link')
                .distance(80)
                .strength(0.6);
            fgRef.current.d3Force('center').strength(0.02);

            // Zoom to fit if this is the first load
            if (!hasZoomedRef.current) {
                fgRef.current.zoomToFit(400, 300);
                hasZoomedRef.current = true;
            }

            // Gradually reduce forces for smoother animation
            setTimeout(() => {
                if (fgRef.current) {
                    fgRef.current.d3Force('charge').strength(-800);
                    fgRef.current.d3Force('link')
                        .distance(100)
                        .strength(0.4);
                    fgRef.current.d3Force('center').strength(0.003);
                }
            }, 2000);
        }
    }, [focusedNodeId]);

    const loadNodes = async () => {
        setLoading(true);
        setError(null);
        setFocusedNodeId(null);
        setShowConnections(false);

        try {
            let url: string;
            const params = [];

            if (selectedNodeLabel) {
                url = 'http://127.0.0.1:8080/nodes-by-label';
                params.push(`label=${encodeURIComponent(selectedNodeLabel)}`);
                if (!showAllNodes) {
                    params.push(`limit=${topK}`);
                }
            } else {
                url = 'http://127.0.0.1:8080/nodes-edges';
                if (!showAllNodes) {
                    params.push(`limit=${topK}`);
                }
            }

            if (params.length > 0) {
                url += '?' + params.join('&');
            }


            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result: NodesEdgesResponse = await response.json();

            if (result.error) {
                throw new Error(result.error);
            }

            const newNodes = new Map();

            const nodes = result.data?.nodes || result.nodes || [];
            if (nodes && nodes.length > 0) {
                nodes.forEach(node => {
                    newNodes.set(node.id, node);
                });
            }


            setAllNodes(newNodes);
            setEdgeData([]);

        } catch (error) {
            console.error('Failed to load nodes:', error);
            setError(error instanceof Error ? error.message : 'Failed to load nodes');
        } finally {
            setLoading(false);
        }
    };

    const loadConnections = async () => {
        if (allNodes.size === 0) {
            setError('No nodes loaded to fetch connections for');
            return;
        }

        setLoadingConnections(true);
        setError(null);

        try {
            let url = 'http://127.0.0.1:8080/nodes-edges';
            if (!showAllNodes) {
                url += `?limit=${Math.max(topK * 10, 1000)}`;
            }

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result: NodesEdgesResponse = await response.json();

            if (result.error) {
                throw new Error(result.error);
            }

            const nodeIds = new Set(Array.from(allNodes.keys()));
            const newEdges: any[] = [];
            const connectedNodes = new Map(allNodes);

            result.data.edges.forEach(edge => {
                const hasFromNode = nodeIds.has(edge.from);
                const hasToNode = nodeIds.has(edge.to);

                if (hasFromNode || hasToNode) {
                    newEdges.push({
                        from_node: edge.from,
                        to_node: edge.to,
                        label: edge.title || 'Edge',
                        id: edge.id
                    });

                    if (!hasFromNode) {
                        const fromNode = result.data.nodes.find(n => n.id === edge.from);
                        if (fromNode) {
                            connectedNodes.set(fromNode.id, fromNode);
                        }
                    }
                    if (!hasToNode) {
                        const toNode = result.data.nodes.find(n => n.id === edge.to);
                        if (toNode) {
                            connectedNodes.set(toNode.id, toNode);
                        }
                    }
                }
            });


            setAllNodes(connectedNodes);
            setEdgeData(newEdges);
            setShowConnections(true);

        } catch (error) {
            console.error('Failed to load connections:', error);
            setError(error instanceof Error ? error.message : 'Failed to load connections');
        } finally {
            setLoadingConnections(false);
        }
    };



    const fetchSchema = async () => {
        try {
            const response = await fetch('http://127.0.0.1:8080/api/schema');
            const data: SchemaInfo = await response.json();
            setSchema(data);
            setLoadingSchema(false);
        } catch (error) {
            console.error('Failed to fetch schema:', error);
            setLoadingSchema(false);
        }
    };

    const fetchNodeDetails = async () => {
        if (allNodes.size === 0) {
            setError('No nodes loaded to fetch details for');
            return;
        }

        setLoadingNodeDetails(true);
        setError(null);

        try {
            const nodeIds = Array.from(allNodes.keys());

            const batchSize = 10;
            const updatedNodes = new Map(allNodes);

            for (let i = 0; i < nodeIds.length; i += batchSize) {
                const batch = nodeIds.slice(i, i + batchSize);

                const batchPromises = batch.map(async (nodeId) => {
                    try {
                        const response = await fetch(`http://127.0.0.1:8080/node-details?id=${encodeURIComponent(nodeId)}`);
                        if (!response.ok) {
                            console.warn(`Failed to fetch details for node ${nodeId}: ${response.status}`);
                            return null;
                        }
                        const details = await response.json();
                        return { nodeId, details };
                    } catch (error) {
                        console.warn(`Error fetching details for node ${nodeId}:`, error);
                        return null;
                    }
                });

                const batchResults = await Promise.all(batchPromises);

                batchResults.forEach((result) => {
                    if (result && result.details) {
                        const existingNode = updatedNodes.get(result.nodeId);
                        if (existingNode) {

                            let nodeData = null;

                            if (result.details.found && result.details.node) {
                                nodeData = result.details.node;
                            }
                            else if (result.details.data) {
                                nodeData = result.details.data;
                            }
                            else {
                                nodeData = result.details;
                            }

                            if (nodeData && typeof nodeData === 'object') {

                                updatedNodes.set(result.nodeId, {
                                    ...existingNode,
                                    ...nodeData,
                                    id: result.nodeId,
                                    title: nodeData.name || nodeData.title || nodeData.label || existingNode.title || result.nodeId
                                });
                            }
                        }
                    }
                });
            }

            setAllNodes(updatedNodes);


            forceUpdate({});

        } catch (error) {
            console.error('Failed to fetch node details:', error);
            setError(error instanceof Error ? error.message : 'Failed to fetch node details');
        } finally {
            setLoadingNodeDetails(false);
        }
    };

    useEffect(() => {
        fetchSchema();
    }, []);


    const clearGraph = () => {
        setSelectedNodeTypes([]);
        setSelectedNodeLabel('');
        setShowAllNodes(false);
        setShowConnections(false);
        setAllNodes(new Map());
        setEdgeData([]);
        setFocusedNodeId(null);
    };



    const wasFocusedRef = useRef(false);



    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="overflow-hidden">
                <div style={{ position: 'relative', height: '100vh', width: '100%', overflow: 'hidden' }} ref={containerRef}>
                    <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <SidebarTrigger className="glass-hover rounded-lg p-2" />
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline">
                                    {selectedNodeLabel || 'Select Node Type'}
                                    <ChevronDown size={16} />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent style={{ width: 200, maxHeight: 300, overflowY: 'auto' }}>
                                <DropdownMenuLabel>Node Types</DropdownMenuLabel>
                                <DropdownMenuCheckboxItem
                                    checked={selectedNodeLabel === ''}
                                    onCheckedChange={() => setSelectedNodeLabel('')}
                                >
                                    All Types
                                </DropdownMenuCheckboxItem>
                                <DropdownMenuSeparator />
                                {schema.nodes.map(node => (
                                    <DropdownMenuCheckboxItem
                                        key={node.name}
                                        checked={selectedNodeLabel === node.name}
                                        onCheckedChange={() => setSelectedNodeLabel(node.name)}
                                    >
                                        {node.name}
                                    </DropdownMenuCheckboxItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <Button onClick={loadNodes} disabled={loading}>
                            {loading ? 'Loading...' : (<><Plus size={16} /> Load Nodes</>)}
                        </Button>

                        <Button onClick={clearGraph}>
                            <RotateCcw size={16} /> Clear
                        </Button>

                        <Button
                            onClick={fetchNodeDetails}
                            disabled={allNodes.size === 0 || loadingNodeDetails}
                            variant="outline"
                        >
                            {loadingNodeDetails ? 'Loading...' : (<><Settings size={16} /> Fetch Details</>)}
                        </Button>

                        <Button
                            onClick={loadConnections}
                            disabled={allNodes.size === 0 || loadingConnections}
                            variant={showConnections ? "default" : "outline"}
                        >
                            {loadingConnections ? 'Loading...' : (<><GitBranch size={16} /> {showConnections ? 'Connections Loaded' : 'Load Connections'}</>)}
                        </Button>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Button
                                variant={showAllNodes ? "default" : "outline"}
                                size="sm"
                                onClick={() => setShowAllNodes(!showAllNodes)}
                                style={{ fontSize: '12px', padding: '4px 8px' }}
                            >
                                {showAllNodes ? 'All Nodes' : `Top ${topK}`}
                            </Button>
                        </div>

                        {!showAllNodes && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <label style={{ color: '#e0e0e0', fontSize: '14px' }}>Limit:</label>
                                <Input
                                    type="text"
                                    value={topKInput}
                                    onChange={(e) => {
                                        setTopKInput(e.target.value);
                                    }}
                                    onBlur={() => {
                                        const num = Number(topKInput);
                                        if (!isNaN(num) && num > 0 && num <= 300) {
                                            setTopK(num);
                                        } else {
                                            setTopKInput('100');
                                            setTopK(100);
                                        }
                                    }}
                                    style={{ width: '80px' }}
                                />
                            </div>
                        )}

                        {error && (
                            <div style={{ color: 'red', background: 'white', padding: '4px 8px', borderRadius: '4px' }}>
                                Error: {error}
                            </div>
                        )}

                        {loadingSchema && (
                            <div style={{ color: '#e0e0e0', background: '#1e293b', padding: '4px 8px', borderRadius: '4px', border: '1px solid #475569' }}>
                                Loading schema...
                            </div>
                        )}
                    </div>

                    <ForceGraph2D
                        ref={fgRef}
                        graphData={graphData}
                        onEngineStop={() => {
                            if (!graphReady) {
                                setGraphReady(true);
                            }
                        }}
                        nodeCanvasObject={(node, ctx, globalScale) => drawNode(node, ctx, globalScale, node.id === hoveredNodeId)}
                        nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
                            if (node.__hitType === 'circle' && node.__hitSize) {
                                ctx.beginPath();
                                ctx.arc(node.x, node.y, node.__hitSize, 0, 2 * Math.PI, false);
                                ctx.fillStyle = color;
                                ctx.fill();
                            } else if (node.__hitType === 'rect' && node.__hitDimensions) {
                                const [w, h] = node.__hitDimensions;
                                ctx.fillStyle = color;
                                ctx.fillRect(node.x - w / 2, node.y - h / 2, w, h);
                            } else {
                                ctx.beginPath();
                                ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI, false);
                                ctx.fillStyle = color;
                                ctx.fill();
                            }
                        }}
                        onNodeHover={(node: any) => setHoveredNodeId(node ? node.id : null)}
                        onNodeClick={(node: any, event: MouseEvent) => {
                            const nodeData = node.originalData as DataItem;

                            const canvas = event.target as HTMLCanvasElement;
                            const rect = canvas.getBoundingClientRect();
                            const canvasX = event.clientX - rect.left;
                            const canvasY = event.clientY - rect.top;

                            const graphCoords = fgRef.current?.screen2GraphCoords(canvasX, canvasY);
                            if (graphCoords) {
                                if (node.__moreBounds) {
                                    const moreBounds = node.__moreBounds;
                                    const relX = graphCoords.x - node.x;
                                    const relY = graphCoords.y - node.y;

                                    if (relX >= moreBounds.x && relX <= moreBounds.x + moreBounds.width &&
                                        relY >= moreBounds.y && relY <= moreBounds.y + moreBounds.height) {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setExpandedNodes(prev => {
                                            const newSet = new Set(prev);
                                            if (newSet.has(node.id)) {
                                                newSet.delete(node.id);
                                            } else {
                                                newSet.add(node.id);
                                            }
                                            return newSet;
                                        });
                                        return;
                                    }
                                }

                            }

                            if (fgRef.current) {
                                fgRef.current.centerAt(node.x, node.y, 400);
                                fgRef.current.zoom(2.5, 400);
                            }

                            setFocusedNodeId(node.id);
                        }}
                        linkColor={() => "#334155"}
                        linkWidth={2}
                        linkDirectionalParticles={(link: any) => {
                            if (hoveredNodeId && (link.source.id === hoveredNodeId || link.target.id === hoveredNodeId)) return 2;
                            return 0;
                        }}
                        linkDirectionalParticleWidth={1.5}
                        linkDirectionalParticleSpeed={0.005}
                        linkDirectionalArrowLength={6}
                        linkDirectionalArrowRelPos={1}
                        cooldownTicks={focusedNodeId ? 30 : 50}
                        cooldownTime={focusedNodeId ? 3000 : 5000}
                        backgroundColor="#1a1a1a"
                        d3AlphaDecay={focusedNodeId ? 0.05 : 0.02}
                        d3VelocityDecay={0.8}
                        d3AlphaMin={0.001}
                        warmupTicks={focusedNodeId ? 0 : 50}
                        enableNodeDrag={true}
                        minZoom={0.01}
                        maxZoom={100}
                        onNodeDrag={(node: any) => {
                            if (!isDraggingRef.current) {
                                isDraggingRef.current = true;
                                fgRef.current.d3Force('link').strength(0.4);
                                fgRef.current.d3Force('charge').strength(-100);
                            }
                            node.fx = node.x;
                            node.fy = node.y;
                        }}
                        onNodeDragEnd={(node: any) => {
                            isDraggingRef.current = false;
                            fgRef.current.d3Force('link').strength(0.4);
                            fgRef.current.d3Force('charge').strength(-800);
                            node.fx = node.x;
                            node.fy = node.y;
                            // Briefly pause and resume simulation to smooth reset
                            fgRef.current.pauseAnimation();
                            setTimeout(() => fgRef.current.resumeAnimation(), 50);
                        }}
                        onBackgroundClick={() => {
                            setFocusedNodeId(null);
                            if (fgRef.current) {
                                fgRef.current.pauseAnimation();
                                setTimeout(() => {
                                    if (fgRef.current) {
                                        fgRef.current.resumeAnimation();
                                    }
                                }, 100);
                            }
                        }}
                        onZoom={({ k }) => {
                            if (zoomTimeoutRef.current) {
                                clearTimeout(zoomTimeoutRef.current);
                            }

                            zoomTimeoutRef.current = setTimeout(() => {
                                lastZoomRef.current = k;
                            }, 50);
                        }}
                    />

                </div>
            </SidebarInset>
        </SidebarProvider>
    );
};

export default DataVisualization;
