interface ForceConfig {
    linkStrength: number;
    chargeStrength: number;
    centerStrength: number;
    linkDistance: number;
}

const CONNECTED_CONFIG: ForceConfig = {
    linkStrength: 0.7,
    chargeStrength: -1500,
    centerStrength: 0.1,
    linkDistance: 300
};

const INITIAL_CONFIG: ForceConfig = {
    linkStrength: 0.3,
    chargeStrength: -800,
    centerStrength: 0.02,
    linkDistance: 200
};

const FOCUSED_CONFIG: ForceConfig = {
    linkStrength: 0.8,
    chargeStrength: -400,
    centerStrength: 0.05,
    linkDistance: 80
};

export const getForceConfig = (nodeCount: number, hasConnections: boolean, focusedNodeId: string | null): ForceConfig => {
    if (focusedNodeId) return FOCUSED_CONFIG;
    if (hasConnections) return CONNECTED_CONFIG;
    return INITIAL_CONFIG;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const getConnectionForceConfig = (nodeCount: number): ForceConfig => {
    return CONNECTED_CONFIG;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const getInitialForceConfig = (nodeCount: number): ForceConfig => {
    return INITIAL_CONFIG;
};

export const getSettledForceConfig = (config: ForceConfig): ForceConfig => {
    return {
        chargeStrength: config.chargeStrength * 0.7,
        linkDistance: config.linkDistance * 1.2,
        linkStrength: config.linkStrength * 0.7,
        centerStrength: config.centerStrength * 0.3
    };
};

export const getDragForceConfig = () => {
    return {
        linkStrength: 0.8,
        chargeStrength: -150
    };
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const getZoomPadding = (nodeCount: number): number => {
    return 200;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const getSettleTime = (nodeCount: number): number => {
    return 1500;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const getCooldownConfig = (focusedNodeId: string | null, showConnections: boolean, nodeCount: number) => {
    return {
        cooldownTicks: focusedNodeId ? 30 : showConnections ? 100 : 50,
        cooldownTime: focusedNodeId ? 3000 : showConnections ? 8000 : 5000,
        d3AlphaDecay: 0.02,
        d3VelocityDecay: 0.8,
        d3AlphaMin: 0.001,
        warmupTicks: focusedNodeId ? 0 : 50
    };
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const getGraphLimits = (nodeCount: number) => {
    return {
        minZoom: 0.01,
        maxZoom: 100
    };
};