import { useState, useEffect, useCallback } from 'react';
import {
    DataItem,
    SchemaInfo
} from '../types';
import {
    fetchSchema,
    fetchNodesByLabel,
    fetchNodesAndEdges,
    fetchNodeConnections,
    fetchNodeDetailsForNodes,
    discoverNodeTypesFromData
} from '../utils/api';

export const useGraphData = () => {
    const [allNodes, setAllNodes] = useState<Map<string, DataItem>>(new Map());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [edgeData, setEdgeData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [schema, setSchema] = useState<SchemaInfo>({ nodes: [], edges: [] });
    const [selectedNodeLabel, setSelectedNodeLabel] = useState<string>('');
    const [loadingSchema, setLoadingSchema] = useState(true);
    const [showAllNodes, setShowAllNodes] = useState(false);
    const [loadingConnections, setLoadingConnections] = useState(false);
    const [showConnections, setShowConnections] = useState(false);
    const [topK, setTopK] = useState<number>(100);
    const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
    const [isClearing, setIsClearing] = useState(false);

    const loadSchema = useCallback(async () => {
        try {
            const data = await fetchSchema();
            if (!data.nodes || data.nodes.length === 0) {
                const discoveredSchema = await discoverNodeTypesFromData();
                setSchema(discoveredSchema);
            } else {
                setSchema(data);
            }
            setLoadingSchema(false);
        } catch {
            const discoveredSchema = await discoverNodeTypesFromData();
            setSchema(discoveredSchema);
            setLoadingSchema(false);
        }
    }, []);

    const loadNodes = useCallback(async (overrideLabel?: string, overrideShowAll?: boolean, overrideTopK?: number) => {
        setLoading(true);
        setError(null);
        setFocusedNodeId(null);
        setShowConnections(false);

        try {
            let nodes: DataItem[] = [];
            const currentLabel = overrideLabel !== undefined ? overrideLabel : selectedNodeLabel;
            const currentShowAll = overrideShowAll !== undefined ? overrideShowAll : showAllNodes;
            const currentTopK = overrideTopK !== undefined ? overrideTopK : topK;
            const limit = currentShowAll ? undefined : currentTopK;

            if (currentLabel) {
                const result = await fetchNodesByLabel(currentLabel, limit);
                nodes = result.nodes || [];
            } else {
                const result = await fetchNodesAndEdges(limit);
                nodes = result.data?.nodes || [];
            }
            const newNodes = new Map<string, DataItem>();
            nodes.forEach((node: DataItem) => {
                newNodes.set(node.id, node);
            });

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
    }, [selectedNodeLabel, showAllNodes, topK]);

    const expandNodeConnections = useCallback(async (nodeId: string) => {
        if (!nodeId || loadingConnections) return;

        setLoadingConnections(true);
        setError(null);

        try {
            const connections = await fetchNodeConnections(nodeId);
            const currentNodes = new Map(allNodes);
            const currentEdges = [...edgeData];
            const existingEdgeIds = new Set(currentEdges.map(edge => edge.id));

            const connectedNodesData = connections.connected_nodes || [];
            if (Array.isArray(connectedNodesData)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                connectedNodesData.forEach((node: any) => {
                    if (node.id && !currentNodes.has(node.id)) {
                        currentNodes.set(node.id, node);
                    }
                });
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const processEdges = (edges: any[], isIncoming: boolean) => {
                if (Array.isArray(edges)) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    edges.forEach((edge: any) => {
                        if (edge.id && !existingEdgeIds.has(edge.id)) {
                            const processedEdge = {
                                from_node: isIncoming
                                    ? (edge.from_node || edge.from)
                                    : (edge.from_node || edge.from || nodeId),
                                to_node: isIncoming
                                    ? (edge.to_node || edge.to || nodeId)
                                    : (edge.to_node || edge.to),
                                label: edge.label || edge.title || 'Edge',
                                id: edge.id
                            };
                            currentEdges.push(processedEdge);
                            existingEdgeIds.add(edge.id);
                        }
                    });
                }
            };

            processEdges(connections.incoming_edges || [], true);
            processEdges(connections.outgoing_edges || [], false);

            setAllNodes(currentNodes);
            setEdgeData(currentEdges);
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Failed to expand connections');
        } finally {
            setLoadingConnections(false);
        }
    }, [allNodes, edgeData, loadingConnections]);

    const loadConnections = useCallback(async () => {
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const allEdges: any[] = [];
            const connectedNodes = new Map(allNodes);
            const newNodeIds = new Set<string>();

            const batchSize = 10;
            for (let i = 0; i < existingNodeIds.length; i += batchSize) {
                const batch = existingNodeIds.slice(i, i + batchSize);

                const batchPromises = batch.map(async (nodeId) => {
                    try {
                        const connections = await fetchNodeConnections(nodeId);
                        return { nodeId, connections };
                    } catch {
                        return null;
                    }
                });

                const batchResults = await Promise.all(batchPromises);

                batchResults.forEach((result) => {
                    if (!result || !result.connections) return;

                    const { connections } = result;
                    const connectedNodesData = connections.connected_nodes || [];

                    if (Array.isArray(connectedNodesData)) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        connectedNodesData.forEach((node: any) => {
                            if (node.id && !connectedNodes.has(node.id)) {
                                connectedNodes.set(node.id, node);
                                newNodeIds.add(node.id);
                            }
                        });
                    }

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const processEdges = (edges: any[], isIncoming: boolean) => {
                        if (Array.isArray(edges)) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            edges.forEach((edge: any) => {
                                const processedEdge = {
                                    from_node: isIncoming
                                        ? (edge.from_node || edge.from)
                                        : (edge.from_node || edge.from || result.nodeId),
                                    to_node: isIncoming
                                        ? (edge.to_node || edge.to || result.nodeId)
                                        : (edge.to_node || edge.to),
                                    label: edge.label || edge.title || 'Edge',
                                    id: edge.id
                                };
                                allEdges.push(processedEdge);
                            });
                        }
                    };

                    processEdges(connections.incoming_edges || [], true);
                    processEdges(connections.outgoing_edges || [], false);
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
    }, [allNodes, showConnections]);

    const clearGraph = useCallback(() => {
        setIsClearing(true);
        setSelectedNodeLabel('');
        setShowAllNodes(false);
        setShowConnections(false);
        setAllNodes(new Map());
        setEdgeData([]);
        setFocusedNodeId(null);

        // Call loadNodes with explicit empty values to ensure we load "All Types"
        setTimeout(() => {
            loadNodes('', false, topK); // Empty label = All Types, false = not all nodes, use current topK
            setIsClearing(false);
        }, 0);
    }, [loadNodes, topK]);

    // Initial load
    useEffect(() => {
        loadSchema();
    }, [loadSchema]);

    // Load nodes when dependencies change
    useEffect(() => {
        if (schema.nodes.length >= 0 && !isClearing) { // Only load once schema is loaded and not clearing
            loadNodes(); // This will use the current state values
        }
    }, [selectedNodeLabel, showAllNodes, topK, schema.nodes.length, isClearing, loadNodes]);

    return {
        allNodes,
        edgeData,
        loading,
        error,
        schema,
        selectedNodeLabel,
        setSelectedNodeLabel,
        loadingSchema,
        showAllNodes,
        setShowAllNodes,
        loadingConnections,
        showConnections,
        topK,
        setTopK,
        focusedNodeId,
        setFocusedNodeId,
        expandNodeConnections,
        loadConnections,
        clearGraph,
        loadNodes,
        setError
    };
};