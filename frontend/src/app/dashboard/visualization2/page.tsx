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
    const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
    const [selectedDoctorNode, setSelectedDoctorNode] = useState<DataItem | null>(null);
    const [loadingPatients, setLoadingPatients] = useState(false);
    const hasZoomedRef = useRef(false);
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!fgRef.current) return;

        // Reset zoom flag when focus changes
        hasZoomedRef.current = false;

        if (focusedNodeId) {
            setTimeout(() => {
                if (!fgRef.current) return;
                let currentGraphData: any;
                const graphDataAccessor: any = fgRef.current.graphData;
                if (typeof graphDataAccessor === 'function') {
                    currentGraphData = graphDataAccessor();
                } else {
                    currentGraphData = graphDataAccessor;
                }
                const focusedNode = currentGraphData?.nodes?.find((n: any) => n.id === focusedNodeId);
                if (focusedNode) {
                    fgRef.current.centerAt(focusedNode.x, focusedNode.y, 1000);
                    if (!hasZoomedRef.current) {
                        fgRef.current.zoom(3, 1000);
                        hasZoomedRef.current = true; // mark that we've zoomed for this focus
                    }
                }
            }, 100);
        } else {
            // No action needed here; zoom fitting is handled by the graphData effect
        }
    }, [focusedNodeId]);

    const getNodeColor = useCallback((item: DataItem): string => {
        const label = item.label?.toLowerCase() || '';
        const hash = label.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#14b8a6', '#f97316', '#a855f7'];
        return colors[hash % colors.length] || '#6b7280';
    }, []);

    const formatFieldType = (key: string, value: any): string => {
        if (key === 'id' || key.endsWith('_id')) return 'ID';
        if (typeof value === 'number') return Number.isInteger(value) ? 'I32' : 'F64';
        if (typeof value === 'string') return 'String';
        if (typeof value === 'boolean') return 'Bool';
        if (Array.isArray(value)) return '[F64]';
        return 'String';
    };

    const drawNode = (node: any, ctx: CanvasRenderingContext2D, _globalScale: number, isHovered: boolean) => {
        const data = node.originalData as DataItem;
        const label = data.label || 'Entity';
        const allFields = Object.entries(data).filter(([key]) => key !== 'label' && key !== 'id');
        const isExpanded = expandedNodes.has(node.id);
        const fields = isExpanded ? allFields : allFields.slice(0, 5);
        const isDoctor = label.toLowerCase() === 'doctor';
        const isFocused = focusedNodeId === node.id;

        const padding = 12;
        const fontSize = 11;
        const headerFontSize = 14;
        const typeFontSize = 9;
        const buttonHeight = isDoctor && isFocused ? 26 : 0;

        ctx.font = `${headerFontSize}px monospace bold`;
        let maxWidth = ctx.measureText(label).width;

        ctx.font = `${fontSize}px monospace`;
        fields.forEach(([key, value]) => {
            const displayValue = typeof value === 'string' && value.length > 20 ? value.substring(0, 20) + '...' : value;
            const text = `${key}: ${displayValue}`;
            maxWidth = Math.max(maxWidth, ctx.measureText(text).width + ctx.measureText(' I32').width);
        });

        const cardWidth = maxWidth + padding * 3;
        const fieldHeight = fontSize * 1.2;
        let cardHeight = headerFontSize + padding * 2 + fields.length * fieldHeight + buttonHeight;
        // Always add space for expand/collapse text if there are more than 5 fields
        if (allFields.length > 5) cardHeight += fieldHeight;
        if (isDoctor && isFocused) cardHeight += padding;

        // Background
        ctx.fillStyle = 'rgba(42, 42, 42, 0.98)';
        ctx.fillRect(node.x - cardWidth / 2, node.y - cardHeight / 2, cardWidth, cardHeight);

        // Border
        ctx.strokeStyle = isHovered ? '#10b981' : 'rgba(80, 80, 80, 0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(node.x - cardWidth / 2, node.y - cardHeight / 2, cardWidth, cardHeight);

        // Header
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.font = `${headerFontSize}px monospace bold`;
        ctx.fillText(label, node.x, node.y - cardHeight / 2 + headerFontSize + padding / 2);

        // Fields
        let yPos = node.y - cardHeight / 2 + headerFontSize + padding * 1.5;
        ctx.textAlign = 'left';
        ctx.font = `${fontSize}px monospace`;
        fields.forEach(([key, value]) => {
            const fieldType = formatFieldType(key, value);
            const displayValue = typeof value === 'string' && value.length > 20 ? value.substring(0, 20) + '...' : String(value);
            const isId = key === 'id';

            ctx.fillStyle = '#94a3b8';
            ctx.fillText(`${key}:`, node.x - cardWidth / 2 + padding, yPos + fontSize / 1.5);

            ctx.fillStyle = isId ? '#10b981' : '#e2e8f0';
            ctx.fillText(displayValue, node.x - cardWidth / 2 + padding + ctx.measureText(`${key}: `).width, yPos + fontSize / 1.5);

            ctx.fillStyle = '#64748b';
            ctx.font = `${typeFontSize}px monospace`;
            ctx.fillText(fieldType, node.x + cardWidth / 2 - padding - ctx.measureText(fieldType).width, yPos + fontSize / 1.5);
            ctx.font = `${fontSize}px monospace`;

            yPos += fieldHeight;
        });

        // Show expand/collapse option if there are more than 5 fields
        if (allFields.length > 5) {
            const toggleText = isExpanded ? '- Show Less' : `+ ${allFields.length - 5} More`;
            const toggleY = yPos + fontSize / 1.5;
            
            // Create clickable area for toggle text
            const toggleWidth = ctx.measureText(toggleText).width;
            const toggleX = -toggleWidth / 2; // Relative to node center
            node.__moreBounds = {
                x: toggleX,
                y: yPos - node.y, // Make it relative to node center
                width: toggleWidth,
                height: fieldHeight
            };
            
            // Draw toggle text
            ctx.fillStyle = isExpanded ? '#ef4444' : '#10b981'; // Red for collapse, green for expand
            ctx.textAlign = 'center';
            ctx.font = `10px monospace`;
            ctx.fillText(toggleText, node.x, toggleY);
            
            // Add subtle underline to indicate clickable
            ctx.strokeStyle = isExpanded ? '#ef4444' : '#10b981';
            ctx.lineWidth = 0.5;
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(node.x - toggleWidth/2, toggleY + 2);
            ctx.lineTo(node.x + toggleWidth/2, toggleY + 2);
            ctx.stroke();
            ctx.setLineDash([]);
            yPos += fieldHeight;
        }

        // Draw button for focused doctor nodes
        if (isDoctor && isFocused) {
            yPos += padding / 2;
            const buttonWidth = cardWidth - padding * 2;
            const buttonX = node.x - buttonWidth / 2;
            const buttonY = yPos;

            // Button background (change color if loading)
            ctx.fillStyle = loadingPatients ? 'rgba(75, 85, 99, 0.9)' : 'rgba(16, 185, 129, 0.9)';

            // Button border
            ctx.strokeStyle = loadingPatients ? 'rgba(75, 85, 99, 0.6)' : 'rgba(16, 185, 129, 0.6)';

            // Button text
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.font = `10px monospace`;
            ctx.fillText(loadingPatients ? 'Loading...' : 'View Patients', node.x, buttonY + 14);

            // Store button bounds for click detection
            node.__buttonBounds = {
                x: buttonX,
                y: buttonY,
                width: buttonWidth,
                height: 22
            };
        }

        node.__cardDimensions = [cardWidth, cardHeight];
    };

    const graphData = useMemo(() => {
        const allNodesList = Array.from(allNodes.values()).map(item => ({
            id: item.id,
            originalData: item,
            color: getNodeColor(item),
            x: (Math.random() - 0.5) * 500,
            y: (Math.random() - 0.5) * 500,
        }));

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

            const newNodes = new Map(allNodes);
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

    useEffect(() => {
        if (fgRef.current && graphData.nodes.length > 0) {
            // Configure forces for initial spacing with stronger repulsion
            fgRef.current.d3Force('charge').strength(-5000);
            fgRef.current.d3Force('link')
                .distance((link: any) => link.isVirtual ? 500 : 300)
                .strength((link: any) => link.isVirtual ? 0.05 : 0.3);
            fgRef.current.d3Force('center').strength(0.05);

            // Only zoom to fit if no node is focused (meaning we're not in expanded view)
            if (!focusedNodeId) {
                fgRef.current.zoomToFit(400, 300);
            }

            setTimeout(() => {
                if (fgRef.current) {
                    // Reduce forces after initial layout for less movement
                    fgRef.current.d3Force('charge').strength(-1000);
                    fgRef.current.d3Force('link')
                        .distance((link: any) => link.isVirtual ? 400 : 250)
                        .strength((link: any) => link.isVirtual ? 0.05 : 0.2);
                    fgRef.current.d3Force('center').strength(0.01);
                }
            }, 5000);
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
                        type="number"
                        value={topK}
                        onChange={(e) => setTopK(Number(e.target.value) || 100)}
                        style={{ width: '80px' }}
                        min={1}
                        max={1000}
                    />
                </div>
            </div>
            <ForceGraph2D
                ref={fgRef}
                graphData={graphData}
                nodeCanvasObject={(node, ctx, globalScale) => drawNode(node, ctx, globalScale, node.id === hoveredNodeId)}
                nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
                    if (node.__cardDimensions) {
                        const [w, h] = node.__cardDimensions;
                        ctx.fillStyle = color;
                        ctx.fillRect(node.x - w / 2, node.y - h / 2, w, h);
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
                            fgRef.current.centerAt(node.x, node.y, 400);
                            const currentZoom = fgRef.current.zoom();
                            if (currentZoom < 1.5) {
                                fgRef.current.zoom(1.5, 400);
                            }
                        }
                    }
                }}
                linkColor={(link: any) => link.isVirtual ? 'rgba(100, 100, 100, 0.1)' : 'rgba(150, 150, 150, 0.6)'}
                linkWidth={(link: any) => link.isVirtual ? 0.5 : 2}
                linkDirectionalParticles={(link: any) => {
                    if (link.isVirtual) return 0;
                    if (hoveredNodeId && (link.source.id === hoveredNodeId || link.target.id === hoveredNodeId)) return 2;
                    return 0;
                }}
                linkDirectionalParticleWidth={1.5}
                linkDirectionalParticleSpeed={0.005}
                linkDirectionalArrowLength={(link: any) => link.isVirtual ? 0 : 6}
                linkDirectionalArrowRelPos={1}
                cooldownTicks={100}
                cooldownTime={10000}
                backgroundColor="#1a1a1a"
                d3AlphaDecay={0.02}
                d3VelocityDecay={0.8}
                d3AlphaMin={0.001}
                warmupTicks={50}
                enableNodeDrag={true}
                onNodeDrag={(node: any) => {
                    node.fx = node.x;
                    node.fy = node.y;   
                }}
                onNodeDragEnd={(node: any) => {
                    // Let the node be free to move again after drag
                    node.fx = undefined;
                    node.fy = undefined;
                }}
                onBackgroundClick={() => {
                    // Click off to restore all nodes
                    setFocusedNodeId(null);
                    setSelectedDoctorNode(null);
                }}
            />
            <div style={{
                position: 'absolute',
                bottom: 10,
                left: 10,
                zIndex: 10,
                color: '#e0e0e0',
                background: 'rgba(40, 40, 40, 0.9)',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid rgba(80, 80, 80, 0.4)'
            }}>
                {allNodes.size > 0
                    ? `Displaying ${allNodes.size} nodes (${graphData.links.filter((l: any) => !l.isVirtual).length} connections) - Top ${topK} per query`
                    : 'Select queries and click "Add to Graph" to start visualizing'
                }
            </div>

        </div>
    );
};

export default DataVisualization;
