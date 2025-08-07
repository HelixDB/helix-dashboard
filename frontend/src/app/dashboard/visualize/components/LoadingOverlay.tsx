import React from 'react';

interface LoadingOverlayProps {
    loading: boolean;
    loadingConnections: boolean;
    loadingSchema: boolean;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
    loading,
    loadingConnections,
    loadingSchema
}) => {
    if (!loading && !loadingConnections && !loadingSchema) {
        return null;
    }

    return (
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
    );
};