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
import { Plus, GitBranch, Circle, RotateCcw, Download, Check, ChevronDown, Search, X } from 'lucide-react';

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
    error?: string;
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
    const [loadingConnections, setLoadingConnections] = useState(false);
    const [showConnections, setShowConnections] = useState(false);
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
    const pendingFocusRef = useRef<{ nodeId: string, position: { x: number, y: number } } | null>(null);


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
            .filter(edge => {
                const hasFrom = nodeIds.has(edge.from_node);
                const hasTo = nodeIds.has(edge.to_node);
                return hasFrom && hasTo;
            })
            .map(edge => ({
                source: edge.from_node,
                target: edge.to_node,
                label: edge.label,
                isVirtual: false
            }));


        return { nodes, links };
    }, [allNodes, edgeData, getNodeColor, focusedNodeId]);

    useEffect(() => {
        if (!fgRef.current || !pendingFocusRef.current || !graphData) return;

        const { nodeId } = pendingFocusRef.current;

        setTimeout(() => {
            if (fgRef.current) {
                const focusedNode = graphData.nodes.find((n: any) => n.id === nodeId);

                if (focusedNode) {
                    fgRef.current.centerAt(focusedNode.x, focusedNode.y, 600);
                    fgRef.current.zoom(2.5, 600);
                }

                pendingFocusRef.current = null;
            }
        }, 200);
    }, [graphData]);

    // Function to compute and update graph data
    const updateGraph = useCallback(() => {
        if (!fgRef.current || !containerRef.current) {
            return;
        }

        // Check if graphData method exists
        if (typeof fgRef.current.graphData !== 'function') {
            return;
        }


        const currentGraph = fgRef.current.graphData();
        const existingNodeIds = new Set(currentGraph.nodes.map((n: any) => n.id));

        const { clientWidth: width, clientHeight: height } = containerRef.current;
        const centerScreenX = width / 2;
        const centerScreenY = height / 2;

        // Check if screen2GraphCoords method exists
        if (typeof fgRef.current.screen2GraphCoords !== 'function') {
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

            const nodes = result.data?.nodes || [];

            if (nodes && nodes.length > 0) {
                nodes.forEach(node => {
                    newNodes.set(node.id, node);
                });
            }

            setEdgeData([]);

            if (newNodes.size > 0) {
                const nodesWithDetails = await fetchNodeDetailsForNodes(newNodes);
                setAllNodes(nodesWithDetails);
            } else {
                setAllNodes(new Map());
            }

        } catch (error) {
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

        if (showConnections) {
            setError('Connections already loaded. Clear and reload nodes to reset.');
            return;
        }

        setLoadingConnections(true);
        setError(null);

        try {
            const existingNodeIds = Array.from(allNodes.keys());
            const allEdges: any[] = [];
            const connectedNodes = new Map(allNodes);
            const newNodeIds = new Set<string>();


            const batchSize = 10;
            for (let i = 0; i < existingNodeIds.length; i += batchSize) {
                const batch = existingNodeIds.slice(i, i + batchSize);

                const batchPromises = batch.map(async (nodeId) => {
                    try {
                        const response = await fetch(`http://127.0.0.1:8080/node-connections?node_id=${encodeURIComponent(nodeId)}`);
                        if (!response.ok) {
                            return null;
                        }

                        const connectionsText = await response.text();
                        const connections = JSON.parse(connectionsText);
                        return { nodeId, connections };
                    } catch (error) {
                        return null;
                    }
                });

                const batchResults = await Promise.all(batchPromises);

                batchResults.forEach((result) => {
                    if (!result || !result.connections) return;

                    const { connections } = result;

                    const connectedNodesData = connections.connected_nodes || [];

                    if (Array.isArray(connectedNodesData)) {
                        connectedNodesData.forEach((node: any) => {
                            if (node.id && !connectedNodes.has(node.id)) {
                                connectedNodes.set(node.id, node);
                                newNodeIds.add(node.id);
                            }
                        });
                    }

                    const incomingEdgesData = connections.incoming_edges || [];

                    if (Array.isArray(incomingEdgesData)) {
                        incomingEdgesData.forEach((edge: any) => {
                            const processedEdge = {
                                from_node: edge.from_node || edge.from,
                                to_node: edge.to_node || edge.to || result.nodeId,
                                label: edge.label || edge.title || 'Edge',
                                id: edge.id
                            };
                            allEdges.push(processedEdge);
                        });
                    }

                    const outgoingEdgesData = connections.outgoing_edges || [];

                    if (Array.isArray(outgoingEdgesData)) {
                        outgoingEdgesData.forEach((edge: any) => {
                            const processedEdge = {
                                from_node: edge.from_node || edge.from || result.nodeId,
                                to_node: edge.to_node || edge.to,
                                label: edge.label || edge.title || 'Edge',
                                id: edge.id
                            };
                            allEdges.push(processedEdge);
                        });
                    }
                });
            }

            if (newNodeIds.size > 0) {
                const newNodesMap = new Map();
                newNodeIds.forEach(nodeId => {
                    const node = connectedNodes.get(nodeId);
                    if (node) {
                        newNodesMap.set(nodeId, node);
                    }
                });

                const nodesWithDetails = await fetchNodeDetailsForNodes(newNodesMap);
                nodesWithDetails.forEach((detailedNode, nodeId) => {
                    connectedNodes.set(nodeId, detailedNode);
                });
            }


            setAllNodes(connectedNodes);
            setEdgeData(allEdges);
            setShowConnections(true);

        } catch (error) {
            setError(error instanceof Error ? error.message : 'Failed to load connections');
        } finally {
            setLoadingConnections(false);
        }
    };



    const fetchSchema = async () => {
        try {
            const response = await fetch('http://127.0.0.1:8080/api/schema');
            const data: SchemaInfo = await response.json();

            if (!data.nodes || data.nodes.length === 0) {
                await discoverNodeTypesFromData();
            } else {
                setSchema(data);
            }

            setLoadingSchema(false);
        } catch (error) {
            await discoverNodeTypesFromData();
            setLoadingSchema(false);
        }
    };

    const discoverNodeTypesFromData = async () => {
        try {
            const response = await fetch('http://127.0.0.1:8080/nodes-edges?limit=100');
            if (!response.ok) return;

            const result = await response.json();
            const nodes = result.data?.nodes || [];

            const nodeTypes = new Set<string>();

            for (let i = 0; i < Math.min(nodes.length, 20); i++) {
                const node = nodes[i];
                try {
                    const detailResponse = await fetch(`http://127.0.0.1:8080/node-details?id=${encodeURIComponent(node.id)}`);
                    if (detailResponse.ok) {
                        const details = await detailResponse.json();
                        let nodeData = null;

                        if (details.found && details.node) {
                            nodeData = details.node;
                        } else if (details.data) {
                            nodeData = details.data;
                        } else {
                            nodeData = details;
                        }

                        if (nodeData && nodeData.label) {
                            nodeTypes.add(nodeData.label);
                        }
                    }
                } catch (error) {
                    continue;
                }
            }

            const discoveredSchema: SchemaInfo = {
                nodes: Array.from(nodeTypes).map(type => ({ name: type, properties: [] })),
                edges: []
            };

            setSchema(discoveredSchema);
        } catch (error) {
            setSchema({ nodes: [], edges: [] });
        }
    };

    const fetchNodeDetailsForNodes = async (nodes: Map<string, DataItem>) => {
        try {
            const nodeIds = Array.from(nodes.keys());
            const batchSize = 10;
            const updatedNodes = new Map(nodes);

            for (let i = 0; i < nodeIds.length; i += batchSize) {
                const batch = nodeIds.slice(i, i + batchSize);

                const batchPromises = batch.map(async (nodeId) => {
                    try {
                        const response = await fetch(`http://127.0.0.1:8080/node-details?id=${encodeURIComponent(nodeId)}`);
                        if (!response.ok) {
                            return null;
                        }
                        const details = await response.json();
                        return { nodeId, details };
                    } catch (error) {
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

            return updatedNodes;

        } catch (error) {
            setError(error instanceof Error ? error.message : 'Failed to fetch node details');
            return nodes;
        }
    };


    useEffect(() => {
        fetchSchema();
        loadNodes();
    }, []);

    useEffect(() => {
        if (schema.nodes.length > 0) {
            loadNodes();
        }
    }, [selectedNodeLabel]);

    useEffect(() => {
        if (schema.nodes.length > 0) {
            loadNodes();
        }
    }, [showAllNodes]);

    useEffect(() => {
        if (schema.nodes.length > 0) {
            loadNodes();
        }
    }, [topK]);


    const applyLimit = () => {
        const num = Number(topKInput);
        if (!isNaN(num) && num > 0 && num <= 300) {
            setTopK(num);
        } else {
            setTopKInput('100');
            setTopK(100);
        }
    };

    const clearGraph = () => {
        setSelectedNodeTypes([]);
        setSelectedNodeLabel('');
        setShowAllNodes(false);
        setShowConnections(false);
        setAllNodes(new Map());
        setEdgeData([]);
        setFocusedNodeId(null);

    };




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
                                    {selectedNodeLabel || 'All Types'}
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


                        <Button onClick={clearGraph}>
                            <RotateCcw size={16} /> Clear
                        </Button>

                        {!selectedNodeLabel && (
                            <Button
                                onClick={loadConnections}
                                disabled={allNodes.size === 0 || loadingConnections}
                                variant={showConnections ? "default" : "outline"}
                            >
                                {loadingConnections ? 'Loading...' : (<><GitBranch size={16} /> {showConnections ? 'Connections Loaded' : 'Load Connections'}</>)}
                            </Button>
                        )}
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
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Input
                                        type="text"
                                        value={topKInput}
                                        onChange={(e) => {
                                            setTopKInput(e.target.value);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                applyLimit();
                                            }
                                        }}
                                        style={{ width: '80px' }}
                                    />
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={applyLimit}
                                        style={{ padding: '4px 8px', minWidth: 'auto' }}
                                    >
                                        <Check size={14} />
                                    </Button>
                                </div>
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

                    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
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
                                    fgRef.current.centerAt(node.x, node.y, 800);
                                    fgRef.current.zoom(2, 800);
                                }

                                pendingFocusRef.current = {
                                    nodeId: node.id,
                                    position: { x: node.x, y: node.y }
                                };

                                setFocusedNodeId(node.id);
                            }}
                            linkColor={() => "#10b981"}
                            linkWidth={3}
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
                                fgRef.current.pauseAnimation();
                                setTimeout(() => fgRef.current.resumeAnimation(), 50);
                            }}
                            onBackgroundClick={() => {
                                setFocusedNodeId(null);
                                pendingFocusRef.current = null;
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

                        {/* Loading overlay */}
                        {(loading || loadingConnections || loadingSchema) && (
                            <div style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                zIndex: 10,
                                backdropFilter: 'blur(3px)'
                            }}>
                                <div style={{
                                    color: '#ffffff',
                                    fontSize: '20px',
                                    fontWeight: '600',
                                    textAlign: 'center',
                                    padding: '20px 30px',
                                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                                    borderRadius: '12px',
                                    border: '2px solid rgba(16, 185, 129, 0.3)',
                                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
                                }}>
                                    <div style={{
                                        marginBottom: '12px',
                                        background: 'linear-gradient(135deg, #10b981, #3b82f6)',
                                        backgroundClip: 'text',
                                        WebkitBackgroundClip: 'text',
                                        WebkitTextFillColor: 'transparent'
                                    }}>
                                        Loading...
                                    </div>
                                    <div style={{ fontSize: '14px', opacity: 0.9, color: '#cbd5e1' }}>
                                        {loading && 'Fetching nodes'}
                                        {loadingConnections && 'Loading connections'}
                                        {loadingSchema && 'Loading schema'}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                </div>
            </SidebarInset>
        </SidebarProvider>
    );
};

export default DataVisualization;
