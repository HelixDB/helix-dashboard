'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
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
import { Plus, GitBranch, Circle, RotateCcw, Download, Check, ChevronDown, Search, X, Users } from 'lucide-react';

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
    const [queries, setQueries] = useState<QueryOption[]>([]);
    const [selectedQueries, setSelectedQueries] = useState<string[]>([]);
    const [loadingQueries, setLoadingQueries] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [topK, setTopK] = useState<number>(100);
    const [topKInput, setTopKInput] = useState<string>('100');
    const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
    const [selectedDoctorNode, setSelectedDoctorNode] = useState<DataItem | null>(null);
    const [loadingPatients, setLoadingPatients] = useState(false);
    const hasZoomedRef = useRef(false);
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
    const isDraggingRef = useRef(false);
    const lastZoomRef = useRef<number>(1);
    const zoomTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [isProgressiveMode, setIsProgressiveMode] = useState(false);
    const [doctorList, setDoctorList] = useState<DataItem[]>([]);
    const [currentDoctorIndex, setCurrentDoctorIndex] = useState(0);
    const [totalDoctors, setTotalDoctors] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const capturedCenterRef = useRef<{ x: number; y: number } | null>(null);
    const capturedZoomRef = useRef<number | null>(null);
    const [capturedPositions, setCapturedPositions] = useState<Map<string, { x: number, y: number }>>(new Map());
    const [graphReady, setGraphReady] = useState(false);
    const [loadDoctorsWithPatients, setLoadDoctorsWithPatients] = useState(false);

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

        // Debug: Log when drawNode is called
        if (currentNodeCount < 10) { // Only log for small graphs to avoid spam
            console.log('drawNode called for:', node.id, { globalScale, isHovered, currentNodeCount });
        }

        const thresholdLow = 0.8;
        const thresholdHigh = 1.3;
        let renderMode: 'simple' | 'detailed' | 'transition' = 'simple';
        let detailOpacity = 0;

        // Determine render mode based on node count and zoom level
        if (currentNodeCount < 50) {
            renderMode = 'detailed';
            detailOpacity = 1;
        } else {
            if (globalScale > thresholdHigh) {
                renderMode = 'detailed';
                detailOpacity = 1;
            } else if (globalScale > thresholdLow) {
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

            const padding = 12;
            const fontSize = 11;
            const headerFontSize = 14;
            const typeFontSize = 9;
            const buttonHeight = hasSpecialAction ? 26 : 0;

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
            if (hasSpecialAction) cardHeight += padding;
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
                const label = node.originalData.label || 'Entity';
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

            const padding = 12;
            const fontSize = 11;
            const headerFontSize = 14;
            const typeFontSize = 9;
            const buttonHeight = hasSpecialAction ? 26 : 0;

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

            // Button for nodes with special actions
            if (hasSpecialAction) {
                yPos += padding / 2;
                const buttonWidth = cardWidth! - padding * 2;
                const buttonX = node.x - buttonWidth / 2;
                const buttonY = yPos;

                const btnGradient = ctx.createLinearGradient(buttonX, buttonY, buttonX, buttonY + 22);
                if (loadingPatients) {
                    btnGradient.addColorStop(0, '#475569');
                    btnGradient.addColorStop(1, '#334155');
                } else {
                    btnGradient.addColorStop(0, '#3b82f6');
                    btnGradient.addColorStop(1, '#2563eb');
                }
                ctx.fillStyle = btnGradient;
                ctx.fillRect(buttonX, buttonY, buttonWidth, 22);

                ctx.strokeStyle = loadingPatients ? '#64748b' : '#60a5fa';
                ctx.lineWidth = 1;
                ctx.strokeRect(buttonX, buttonY, buttonWidth, 22);

                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.font = `10px monospace`;

                const buttonText = nodeType === 'doctor'
                    ? (loadingPatients ? 'Loading...' : 'View Patients')
                    : 'View Details';

                ctx.fillText(buttonText, node.x, buttonY + 14);

                node.__buttonBounds = {
                    x: buttonX - node.x,
                    y: buttonY - node.y,
                    width: buttonWidth,
                    height: 22
                };
            }

            ctx.globalAlpha = originalAlpha;
        }
    };

    // Compute graph data from state
    const graphData = useMemo(() => {
        console.log('Computing graph data from state:', {
            allNodesSize: allNodes.size,
            edgeDataLength: edgeData.length
        });

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

        console.log('Computed graph data:', { nodesCount: nodes.length, linksCount: links.length });
        return { nodes, links };
    }, [allNodes, edgeData, getNodeColor, focusedNodeId]);

    // Function to compute and update graph data
    const updateGraph = useCallback(() => {
        console.log('updateGraph called - checking refs...');
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
            console.log('fgRef.current methods:', Object.getOwnPropertyNames(fgRef.current));
            return;
        }

        console.log('updateGraph called with:', {
            allNodesSize: allNodes.size,
            edgeDataLength: edgeData.length,
            focusedNodeId
        });

        const currentGraph = fgRef.current.graphData();
        console.log('Current graph data:', currentGraph);
        const existingNodeIds = new Set(currentGraph.nodes.map((n: any) => n.id));

        const { clientWidth: width, clientHeight: height } = containerRef.current;
        const centerScreenX = width / 2;
        const centerScreenY = height / 2;

        // Check if screen2GraphCoords method exists
        if (typeof fgRef.current.screen2GraphCoords !== 'function') {
            console.warn('ForceGraph screen2GraphCoords not available');
            console.log('Available methods:', Object.getOwnPropertyNames(fgRef.current));
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

        console.log('Setting new graph data:', { nodesCount: nodes.length, linksCount: links.length });
        console.log('Sample nodes:', nodes.slice(0, 3));
        console.log('Sample links:', links.slice(0, 3));

        fgRef.current.graphData({ nodes, links });
    }, [allNodes, edgeData, getNodeColor, focusedNodeId]);

    // Add after the updateGraph definition
    const toggleQuery = (queryValue: string) => {
        setSelectedQueries(prev =>
            prev.includes(queryValue)
                ? prev.filter(q => q !== queryValue)
                : [...prev, queryValue]
        );
    };

    // Update graph when focused changes or when graph becomes ready
    useEffect(() => {
        if (graphReady) {
            updateGraph();
        }
    }, [focusedNodeId, graphReady, updateGraph]);

    // Update graph when data changes and graph is ready
    useEffect(() => {
        console.log('Data changed effect triggered:', {
            allNodesSize: allNodes.size,
            edgeDataLength: edgeData.length,
            graphReady
        });
        if (graphReady) {
            updateGraph();
        }
    }, [allNodes, edgeData, graphReady, updateGraph]);

    // Configure force simulation
    useEffect(() => {
        if (fgRef.current) {
            fgRef.current.d3Force('charge').strength(-1500);
            fgRef.current.d3Force('link')
                .distance(80)
                .strength(0.6);
            fgRef.current.d3Force('center').strength(0.02);

            // Zoom to fit if this is the first load
            if (!hasZoomedRef.current && !isProgressiveMode) {
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
    }, [focusedNodeId, isProgressiveMode]);

    // Modify executeQueries to use refs and updateGraph
    const executeQueries = async () => {
        if (selectedQueries.length === 0) return;

        setLoading(true);
        setError(null);
        setFocusedNodeId(null);
        setSelectedDoctorNode(null);

        try {
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

            const newNodes = new Map();
            const newEdges: any[] = [];

            results.forEach((result) => {
                if (!result) return;

                const { queryOption, data } = result;

                let dataArray: DataItem[] = [];
                for (const key in data) {
                    if (Array.isArray(data[key])) {
                        dataArray = data[key];
                        break;
                    }
                }
                if (dataArray.length === 0 && Array.isArray(data)) {
                    dataArray = data;
                }

                const limitedData = dataArray.slice(0, topK);

                if (queryOption.value === 'getAllDoctors') {
                    if (loadDoctorsWithPatients) {
                        setDoctorList(limitedData);
                        setCurrentDoctorIndex(0);
                        setIsProgressiveMode(true);
                        setTotalDoctors(limitedData.length);
                    } else {
                        limitedData.forEach(item => {
                            newNodes.set(item.id, { ...item, label: 'Doctor' });
                        });
                    }
                } else if (queryOption.type === 'edge') {
                    newEdges.push(...limitedData);
                } else {
                    limitedData.forEach(item => {
                        newNodes.set(item.id, item);
                    });
                }
            });

            console.log('executeQueries setting data:', {
                newNodesSize: newNodes.size,
                newEdgesLength: newEdges.length,
                graphReady
            });

            setAllNodes(newNodes);
            setEdgeData(newEdges);
            if (graphReady) {
                updateGraph();
            }
        } catch (error) {
            console.error('Failed to execute queries:', error);
            setError(error instanceof Error ? error.message : 'Failed to execute queries');
        } finally {
            setLoading(false);
        }
    };



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

    // Load all doctors and their patients at once
    const handleLoadAllDoctors = async () => {
        if (doctorList.length === 0) return;

        setLoading(true);
        try {
            console.log('Loading all doctors and patients...');

            const allNewNodes = new Map(allNodes);
            const allNewEdges = [...edgeData];

            // Process doctors in batches to avoid overwhelming the API
            const batchSize = 5;
            for (let i = 0; i < doctorList.length; i += batchSize) {
                const batch = doctorList.slice(i, i + batchSize);
                console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(doctorList.length / batchSize)}`);

                const batchPromises = batch.map(async (doctor) => {
                    try {
                        const { patients, edges } = await loadDoctorPatients(doctor.id);
                        return { doctor, patients, edges };
                    } catch (error) {
                        console.error(`Failed to load patients for doctor ${doctor.id}:`, error);
                        return { doctor, patients: [], edges: [] };
                    }
                });

                const batchResults = await Promise.all(batchPromises);

                batchResults.forEach(({ doctor, patients, edges }) => {
                    allNewNodes.set(doctor.id, { ...doctor, label: 'Doctor' });
                    patients.forEach(p => allNewNodes.set(p.id, p));
                    allNewEdges.push(...edges);
                });
            }

            console.log('Setting all data:', {
                newNodesSize: allNewNodes.size,
                newEdgesLength: allNewEdges.length
            });

            setAllNodes(allNewNodes);
            setEdgeData(allNewEdges);
            setCurrentDoctorIndex(doctorList.length);

        } catch (err) {
            console.error('Failed to load all doctors:', err);
            setError('Failed to load all doctors');
        } finally {
            setLoading(false);
        }
    };

    const handleLoadNextDoctor = async () => {
        if (currentDoctorIndex >= totalDoctors) return;

        setLoading(true);
        try {
            const doctor = doctorList[currentDoctorIndex];
            console.log('Loading patients for doctor:', doctor);

            const { patients, edges } = await loadDoctorPatients(doctor.id);
            console.log('Loaded patients and edges:', { patientsCount: patients.length, edgesCount: edges.length });

            const newNodes = new Map(allNodes);
            newNodes.set(doctor.id, { ...doctor, label: 'Doctor' });
            patients.forEach(p => newNodes.set(p.id, p));

            const newEdges = [...edgeData, ...edges];

            console.log('Setting new data:', {
                newNodesSize: newNodes.size,
                newEdgesLength: newEdges.length
            });

            setAllNodes(newNodes);
            setEdgeData(newEdges);

            setCurrentDoctorIndex(prev => prev + 1);
        } catch (err) {
            console.error('Failed to load doctor patients:', err);
            setError('Failed to load doctor patients');
        } finally {
            setLoading(false);
        }
    };

    const clearGraph = () => {
        setSelectedQueries([]);
        setIsProgressiveMode(false);
        setDoctorList([]);
        setCurrentDoctorIndex(0);
        setTotalDoctors(0);
        setLoadDoctorsWithPatients(false);
        setAllNodes(new Map());
        setEdgeData([]);
        updateGraph();
    };

    const fetchConnectedNodes = async (doctorId: string) => {
        setLoadingPatients(true);
        try {
            const response = await fetch(`http://127.0.0.1:8080/api/query/getDoctorTreatsPatientEdgesByDoctor?doctor_id=${doctorId}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data: ApiResponse = await response.json();
            let edgesArray: any[] = [];
            for (const key in data) {
                if (Array.isArray(data[key])) {
                    edgesArray = data[key];
                    break;
                }
            }

            const patientIds = [...new Set(edgesArray.map(edge => edge.to_node))];

            const patientPromises = patientIds.map(async (patientId) => {
                try {
                    const patientResponse = await fetch(`http://127.0.0.1:8080/api/query/getPatient?patient_id=${patientId}`);
                    if (!patientResponse.ok) {
                        console.error(`Failed to fetch patient ${patientId}`);
                        return null;
                    }
                    const patientData = await patientResponse.json();

                    let patient = null;
                    for (const key in patientData) {
                        if (Array.isArray(patientData[key]) && patientData[key].length > 0) {
                            patient = patientData[key][0];
                            break;
                        } else if (typeof patientData[key] === 'object' && patientData[key].id === patientId) {
                            patient = patientData[key];
                            break;
                        }
                    }

                    if (patient) {
                        return {
                            ...patient,
                            id: patientId,
                            label: 'Patient'
                        };
                    }
                    return null;
                } catch (error) {
                    console.error(`Error fetching patient ${patientId}:`, error);
                    return null;
                }
            });

            const patientResults = await Promise.all(patientPromises);
            const patientNodes = patientResults.filter(p => p !== null) as DataItem[];

            const newNodes = new Map(allNodes);
            patientNodes.forEach(patient => {
                newNodes.set(patient.id, patient);
            });

            const newEdges = [...edgeData, ...edgesArray];

            setAllNodes(newNodes);
            setEdgeData(newEdges);

        } catch (error) {
            console.error('Failed to fetch connected nodes:', error);
            setError(error instanceof Error ? error.message : 'Failed to fetch connected nodes');
        } finally {
            setLoadingPatients(false);
        }
    };

    async function loadDoctorPatients(doctorId: string): Promise<{ patients: DataItem[]; edges: any[] }> {
        try {
            const response = await fetch(`http://127.0.0.1:8080/api/query/getDoctorTreatsPatientEdgesByDoctor?doctor_id=${doctorId}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data: ApiResponse = await response.json();
            let edgesArray: any[] = [];
            for (const key in data) {
                if (Array.isArray(data[key])) {
                    edgesArray = data[key];
                    break;
                }
            }

            // Get unique patient IDs but preserve all edges
            const patientIds = [...new Set(edgesArray.map(edge => edge.to_node))];

            const patientPromises = patientIds.map(async (patientId) => {
                try {
                    const patientResponse = await fetch(`http://127.0.0.1:8080/api/query/getPatient?patient_id=${patientId}`);
                    if (!patientResponse.ok) {
                        return null;
                    }
                    const patientData = await patientResponse.json();
                    let patient = null;
                    for (const key in patientData) {
                        if (Array.isArray(patientData[key]) && patientData[key].length > 0) {
                            patient = patientData[key][0];
                            break;
                        } else if (typeof patientData[key] === 'object' && patientData[key].id === patientId) {
                            patient = patientData[key];
                            break;
                        }
                    }
                    if (patient) {
                        return {
                            ...patient,
                            id: patientId,
                            label: 'Patient'
                        };
                    }
                    return null;
                } catch (error) {
                    return null;
                }
            });
            const patientResults = await Promise.all(patientPromises);
            const patients = patientResults.filter(p => p !== null) as DataItem[];

            return { patients, edges: edgesArray };
        } catch (error) {
            throw error;
        }
    }

    // Add onEngineStop to ForceGraph2D
    useEffect(() => {
        if (fgRef.current) {
            fgRef.current.d3Force('charge').strength(-1500);
            fgRef.current.d3Force('link')
                .distance(80)
                .strength(0.6);
            fgRef.current.d3Force('center').strength(0.02);

            if (!hasZoomedRef.current && !isProgressiveMode) {
                fgRef.current.zoomToFit(400, 300);
                hasZoomedRef.current = true;
            }

            setTimeout(() => {
                if (fgRef.current) {
                    fgRef.current.d3Force('charge').strength(-800);
                    fgRef.current.d3Force('link')
                        .distance(100)
                        .strength(0.4);
                    fgRef.current.d3Force('center').strength(0.005);
                }
            }, 5000);
        }
    }, [focusedNodeId, isProgressiveMode]);

    const wasFocusedRef = useRef(false);

    return (
        <div style={{ position: 'relative', height: '100vh', width: '100%' }} ref={containerRef}>
            <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, display: 'flex', gap: 10 }}>
                <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline">
                            {selectedQueries.length === 0 ? (loadingQueries ? 'Loading...' : 'Select queries') : `${selectedQueries.length} selected`}
                            <ChevronDown size={16} />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent style={{ width: 300, maxHeight: 400, overflowY: 'auto' }}>
                        <DropdownMenuLabel>Select queries</DropdownMenuLabel>
                        <div style={{ padding: '0 8px' }}>
                            <Input
                                placeholder="Search..."
                                value={searchTerm}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                                onKeyDown={(e) => {
                                    e.stopPropagation();
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                }}
                            />
                        </div>
                        <DropdownMenuSeparator />
                        {/* Node, Edge, Vector sections similar to existing */}
                        <DropdownMenuLabel>Node Operations</DropdownMenuLabel>
                        {queries.filter(q => q.type === 'node' && q.label.toLowerCase().includes(searchTerm.toLowerCase())).map(q => (
                            <DropdownMenuCheckboxItem
                                key={q.value}
                                checked={selectedQueries.includes(q.value)}
                                onCheckedChange={() => toggleQuery(q.value)}
                                onSelect={(e) => e.preventDefault()}
                            >
                                {q.label}
                            </DropdownMenuCheckboxItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>Edge Operations</DropdownMenuLabel>
                        {queries.filter(q => q.type === 'edge' && q.label.toLowerCase().includes(searchTerm.toLowerCase())).map(q => (
                            <DropdownMenuCheckboxItem
                                key={q.value}
                                checked={selectedQueries.includes(q.value)}
                                onCheckedChange={() => toggleQuery(q.value)}
                                onSelect={(e) => e.preventDefault()}
                            >
                                {q.label}
                            </DropdownMenuCheckboxItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>Vector Operations</DropdownMenuLabel>
                        {queries.filter(q => q.type === 'vector' && q.label.toLowerCase().includes(searchTerm.toLowerCase())).map(q => (
                            <DropdownMenuCheckboxItem
                                key={q.value}
                                checked={selectedQueries.includes(q.value)}
                                onCheckedChange={() => toggleQuery(q.value)}
                                onSelect={(e) => e.preventDefault()}
                            >
                                {q.label}
                            </DropdownMenuCheckboxItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
                <Button onClick={executeQueries} disabled={selectedQueries.length === 0 || loading}>
                    {loading ? 'Loading...' : (<><Plus size={16} /> Add to Graph</>)}
                </Button>
                <Button onClick={clearGraph}>
                    <RotateCcw size={16} /> Clear
                </Button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ color: '#e0e0e0', fontSize: '14px' }}>Top K:</label>
                    <Input
                        type="text"
                        value={topKInput}
                        onChange={(e) => {
                            setTopKInput(e.target.value);
                        }}
                        onBlur={() => {
                            const num = Number(topKInput);
                            if (!isNaN(num) && num > 0) {
                                setTopK(num);
                            } else {
                                setTopKInput('100');
                                setTopK(100);
                            }
                        }}
                        style={{ width: '80px' }}
                    />
                </div>
                {selectedQueries.includes('getAllDoctors') && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ color: '#e0e0e0', fontSize: '14px' }}>Mode:</label>
                        <Button
                            variant={loadDoctorsWithPatients ? "default" : "outline"}
                            size="sm"
                            onClick={() => setLoadDoctorsWithPatients(!loadDoctorsWithPatients)}
                            style={{ fontSize: '12px', padding: '4px 8px' }}
                        >
                            {loadDoctorsWithPatients ? 'With Patients' : 'Doctors Only'}
                        </Button>
                    </div>
                )}
                {isProgressiveMode && (
                    <>
                        <Button
                            onClick={handleLoadNextDoctor}
                            disabled={currentDoctorIndex >= totalDoctors || loading}
                        >
                            {loading ? 'Loading...' : `Next Pair (${currentDoctorIndex} / ${totalDoctors} doctors loaded)`}
                        </Button>
                        <Button
                            onClick={handleLoadAllDoctors}
                            disabled={currentDoctorIndex >= totalDoctors || loading}
                            variant="outline"
                        >
                            {loading ? 'Loading...' : 'Load All'}
                        </Button>
                    </>
                )}
                {error && (
                    <div style={{ color: 'red', background: 'white', padding: '4px 8px', borderRadius: '4px' }}>
                        Error: {error}
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

                    // Get click position relative to canvas
                    const canvas = event.target as HTMLCanvasElement;
                    const rect = canvas.getBoundingClientRect();
                    const canvasX = event.clientX - rect.left;
                    const canvasY = event.clientY - rect.top;

                    // Convert to graph coordinates
                    const graphCoords = fgRef.current?.screen2GraphCoords(canvasX, canvasY);
                    if (graphCoords) {
                        // Check if clicked on "More" text
                        if (node.__moreBounds) {
                            const moreBounds = node.__moreBounds;
                            const relX = graphCoords.x - node.x;
                            const relY = graphCoords.y - node.y;

                            if (relX >= moreBounds.x && relX <= moreBounds.x + moreBounds.width &&
                                relY >= moreBounds.y && relY <= moreBounds.y + moreBounds.height) {
                                // Toggle expanded state
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

                        if (nodeData.label?.toLowerCase() === 'doctor' && focusedNodeId === node.id && node.__buttonBounds) {
                            const bounds = node.__buttonBounds;
                            const relX = graphCoords.x - node.x;
                            const relY = graphCoords.y - node.y;

                            if (relX >= bounds.x && relX <= bounds.x + bounds.width &&
                                relY >= bounds.y && relY <= bounds.y + bounds.height) {
                                event.preventDefault();
                                event.stopPropagation();
                                setLoadingPatients(true);
                                fetchConnectedNodes(nodeData.id);
                                return;
                            }
                        }
                    }

                    if (nodeData.label?.toLowerCase() === 'doctor') {
                        setFocusedNodeId(node.id);
                        setSelectedDoctorNode(nodeData);
                    } else {
                        if (fgRef.current) {
                            // Center the node and zoom to a comfortable level
                            fgRef.current.centerAt(node.x, node.y, 400);
                            // Always zoom to a consistent level for better visibility
                            fgRef.current.zoom(2.5, 400);
                        }
                    }
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
                cooldownTicks={focusedNodeId ? 50 : 100}
                cooldownTime={focusedNodeId ? 5000 : 10000}
                backgroundColor="#1a1a1a"
                d3AlphaDecay={focusedNodeId ? 0.05 : 0.02}
                d3VelocityDecay={0.8}
                d3AlphaMin={0.001}
                warmupTicks={focusedNodeId ? 0 : 50}
                enableNodeDrag={true}
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
                    setSelectedDoctorNode(null);
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
    );
};

export default DataVisualization;
