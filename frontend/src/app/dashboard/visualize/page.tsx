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
        // Create a hash from the node ID for consistent but unique colors
        const id = item.id || '';
        let hash = 0;
        for (let i = 0; i < id.length; i++) {
            const char = id.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }

        const baseGray = 42;
        const variation = Math.abs(hash % 20) - 10;
        const r = baseGray + variation;
        const g = baseGray + variation;
        const b = baseGray + variation + Math.abs((hash >> 8) % 10);

        return `rgba(${r}, ${g}, ${b}, 0.98)`;
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
        const thresholdLow = 0.8;
        const thresholdHigh = 1.3;
        let renderMode: 'simple' | 'detailed' | 'transition' = 'simple';
        let detailOpacity = 0;

        // Determine render mode based on node count and zoom level
        if (nodeCount < 50) {
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
        if (detailOpacity > 0 || nodeCount < 50) {
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
            const size = isHovered ? 8 : 4;
            node.__hitType = 'circle';
            node.__hitSize = size * 1.5;
        }

        // Save context state
        const originalAlpha = ctx.globalAlpha;

        // Draw simple view
        if (renderMode === 'simple' || (renderMode === 'transition' && detailOpacity < 1)) {
            const simpleOpacity = renderMode === 'simple' ? 1 : 1 - detailOpacity;
            ctx.globalAlpha = simpleOpacity;
            const size = isHovered ? 8 : 4;
            ctx.beginPath();
            ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
            ctx.fillStyle = node.color || 'rgba(100, 100, 100, 0.8)';
            ctx.fill();

            if (isHovered && renderMode === 'simple') {
                const label = node.originalData.label || 'Entity';
                ctx.font = '10px monospace';
                ctx.fillStyle = '#ffffff';
                ctx.fillText(label, node.x + size + 4, node.y + 3);
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

            // Background
            ctx.fillStyle = node.color || 'rgba(42, 42, 42, 0.98)';
            ctx.fillRect(node.x - cardWidth! / 2, node.y - cardHeight! / 2, cardWidth!, cardHeight!);

            // Border
            ctx.strokeStyle = isHovered ? '#10b981' : 'rgba(80, 80, 80, 0.6)';
            ctx.lineWidth = 1;
            ctx.strokeRect(node.x - cardWidth! / 2, node.y - cardHeight! / 2, cardWidth!, cardHeight!);

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

                ctx.fillStyle = '#94a3b8';
                ctx.fillText(`${key}:`, node.x - cardWidth! / 2 + padding, yPos + fontSize / 1.5);

                ctx.fillStyle = isId ? '#10b981' : '#e2e8f0';
                ctx.fillText(displayValue, node.x - cardWidth! / 2 + padding + ctx.measureText(`${key}: `).width, yPos + fontSize / 1.5);

                ctx.fillStyle = '#64748b';
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

                ctx.fillStyle = isExpanded ? '#ef4444' : '#10b981';
                ctx.textAlign = 'center';
                ctx.font = `10px monospace`;
                ctx.fillText(toggleText, node.x, toggleY);

                ctx.strokeStyle = isExpanded ? '#ef4444' : '#10b981';
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

                ctx.fillStyle = loadingPatients ? '#64748b' : '#3b82f6';
                ctx.fillRect(buttonX, buttonY, buttonWidth, 22);

                ctx.strokeStyle = loadingPatients ? '#475569' : '#2563eb';
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

    const graphData = useMemo(() => {
        const allNodesList = Array.from(allNodes.values()).map((item, index) => {
            let hash = 0;
            for (let i = 0; i < item.id.length; i++) {
                hash = ((hash << 5) - hash) + item.id.charCodeAt(i);
                hash = hash & hash;
            }
            const angle = (hash % 360) * Math.PI / 180;
            const radius = 200 + (Math.abs(hash) % 200);

            const x = (focusedNodeId && item.id === focusedNodeId) ? 0 : Math.cos(angle) * radius;
            const y = (focusedNodeId && item.id === focusedNodeId) ? 0 : Math.sin(angle) * radius;

            return {
                id: item.id,
                originalData: item,
                color: getNodeColor(item),
                x,
                y,
            };
        });

        // If a node is focused, only show that node and its connected nodes
        const nodes = focusedNodeId
            ? allNodesList.filter(node => {
                if (node.id === focusedNodeId) return true;
                // Also show connected patient nodes if they exist
                return edgeData.some(edge =>
                    (edge.from_node === focusedNodeId && edge.to_node === node.id) ||
                    (edge.to_node === focusedNodeId && edge.from_node === node.id)
                );
            })
            : allNodesList;

        // Group nodes by label/type
        const nodesByType = new Map<string, typeof nodes>();
        nodes.forEach(node => {
            const type = node.originalData.label || 'unknown';
            if (!nodesByType.has(type)) {
                nodesByType.set(type, []);
            }
            nodesByType.get(type)!.push(node);
        });

        // Create virtual edges between nodes of the same type
        const virtualLinks: any[] = [];
        nodesByType.forEach((nodesOfType) => {
            // Connect each node to a few others of the same type to create a mesh
            for (let i = 0; i < nodesOfType.length; i++) {
                // Connect to next 2-3 nodes in a circular pattern
                for (let j = 1; j <= Math.min(3, nodesOfType.length - 1); j++) {
                    const targetIndex = (i + j) % nodesOfType.length;
                    if (i !== targetIndex) {
                        virtualLinks.push({
                            source: nodesOfType[i].id,
                            target: nodesOfType[targetIndex].id,
                            label: 'virtual',
                            isVirtual: true
                        });
                    }
                }
            }
        });

        // Only include edges where both nodes are in the displayed nodes
        const nodeIds = new Set(nodes.map(n => n.id));
        const links = [
            ...edgeData
                .filter(edge => nodeIds.has(edge.from_node) && nodeIds.has(edge.to_node))
                .map(edge => ({
                    source: edge.from_node,
                    target: edge.to_node,
                    label: edge.label,
                    isVirtual: false
                })),
            ...virtualLinks
        ];

        return { nodes, links };
    }, [allNodes, edgeData, getNodeColor, focusedNodeId]);

    const nodeCount = graphData.nodes.length;

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

                // Apply topK limit per query
                const limitedData = dataArray.slice(0, topK);

                if (queryOption.type === 'edge') {
                    newEdges.push(...limitedData);
                } else {
                    limitedData.forEach(item => {
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

    // Track if we're transitioning from focused to unfocused
    const wasFocusedRef = useRef(false);

    useEffect(() => {
        if (fgRef.current && graphData.nodes.length > 0) {
            const isUnfocusing = wasFocusedRef.current && !focusedNodeId;
            wasFocusedRef.current = !!focusedNodeId;

            fgRef.current.d3Force('charge').strength(-1500);
            fgRef.current.d3Force('link')
                .distance((link: any) => link.isVirtual ? 300 : 80)
                .strength((link: any) => link.isVirtual ? 0.02 : 0.4);
            fgRef.current.d3Force('center').strength(0.02);

            if (!focusedNodeId && !hasZoomedRef.current) {
                fgRef.current.zoomToFit(400, 300);
                hasZoomedRef.current = true;
            }

            setTimeout(() => {
                if (fgRef.current) {
                    fgRef.current.d3Force('charge').strength(-400);
                    fgRef.current.d3Force('link')
                        .distance((link: any) => link.isVirtual ? 200 : 60)
                        .strength((link: any) => link.isVirtual ? 0.01 : 0.3);
                    fgRef.current.d3Force('center').strength(0.005);
                }
            }, 5000);

            if (isUnfocusing) {
                setTimeout(() => {
                    if (fgRef.current) {
                        fgRef.current.zoomToFit(400, 100);
                    }
                }, 200);
            }
        }
    }, [graphData, focusedNodeId]);

    const toggleQuery = (queryValue: string) => {
        setSelectedQueries(prev =>
            prev.includes(queryValue)
                ? prev.filter(q => q !== queryValue)
                : [...prev, queryValue]
        );
    };

    const clearGraph = () => {
        setAllNodes(new Map());
        setEdgeData([]);
        setSelectedQueries([]);
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

            // Get unique patient IDs from edges
            const patientIds = [...new Set(edgesArray.map(edge => edge.to_node))];

            // Fetch full patient data for each patient ID
            const patientPromises = patientIds.map(async (patientId) => {
                try {
                    const patientResponse = await fetch(`http://127.0.0.1:8080/api/query/getPatient?patient_id=${patientId}`);
                    if (!patientResponse.ok) {
                        console.error(`Failed to fetch patient ${patientId}`);
                        return null;
                    }
                    const patientData = await patientResponse.json();

                    // Extract patient from response (similar to edge extraction)
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

            // Wait for all patient data to be fetched
            const patientResults = await Promise.all(patientPromises);
            const patientNodes = patientResults.filter(p => p !== null) as DataItem[];

            // Add patient nodes to the graph
            const newNodes = new Map(allNodes);
            patientNodes.forEach(patient => {
                newNodes.set(patient.id, patient);
            });

            // Add edges to the graph
            const newEdges = [...edgeData, ...edgesArray];

            // Update state - this will trigger a re-render without any zoom effects
            setAllNodes(newNodes);
            setEdgeData(newEdges);

        } catch (error) {
            console.error('Failed to fetch connected nodes:', error);
            setError(error instanceof Error ? error.message : 'Failed to fetch connected nodes');
        } finally {
            setLoadingPatients(false);
        }
    };

    if (loading) {
        return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading data...</div>;
    }

    if (error) {
        return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'red' }}>Error: {error}</div>;
    }

    return (
        <div style={{ position: 'relative', height: '100vh', width: '100%' }}>
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
                    <Plus size={16} /> Add to Graph
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
            </div>
            <ForceGraph2D
                ref={fgRef}
                graphData={graphData}
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
                linkColor={(link: any) => link.isVirtual ? 'rgba(100, 100, 100, 0.1)' : 'rgba(100, 181, 246, 0.5)'}
                linkWidth={(link: any) => 0.5}
                linkDirectionalParticles={(link: any) => {
                    if (link.isVirtual) return 0;
                    if (hoveredNodeId && (link.source.id === hoveredNodeId || link.target.id === hoveredNodeId)) return 2;
                    return 0;
                }}
                linkDirectionalParticleWidth={1.5}
                linkDirectionalParticleSpeed={0.005}
                linkDirectionalArrowLength={(link: any) => link.isVirtual ? 0 : 6}
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
                        fgRef.current.d3Force('link').strength((link: any) => link.isVirtual ? 0 : 0.2);
                        fgRef.current.d3Force('charge').strength(-100);
                    }
                    node.fx = node.x;
                    node.fy = node.y;
                }}
                onNodeDragEnd={(node: any) => {
                    isDraggingRef.current = false;
                    fgRef.current.d3Force('link').strength((link: any) => link.isVirtual ? 0.01 : 0.3);
                    fgRef.current.d3Force('charge').strength(-400);
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
