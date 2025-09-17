use axum::{
    Router,
    routing::{any, get},
};
use tower_http::cors::{Any, CorsLayer};
use anyhow::Result;
use tokio::net::TcpListener;

use backend::{
    AppState,
    web::*  
};

#[tokio::main]
async fn main() -> Result<()> {
    let app_state = AppState::new();
    let backend_port = app_state.backend_port;
    let listener = TcpListener::bind(format!("0.0.0.0:{backend_port}")).await?;

    println!("Server running on http://0.0.0.0:{backend_port}");

    let app = Router::new()
        .route("/api/schema", get(get_schema_handler))
        .route("/api/endpoints", get(get_endpoints_handler))
        .route("/api/query/{query_name}", any(execute_query_handler))
        .route("/nodes-edges", get(get_nodes_edges_handler))
        .route("/nodes-by-label", get(get_nodes_by_label_handler))
        .route("/node-details", get(get_node_details_handler))
        .route("/node-connections", get(get_node_connections_handler))
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .with_state(app_state);
    axum::serve(listener, app).await?;

    Ok(())
}
