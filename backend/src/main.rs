use axum::{
    Router,
    routing::{delete, get, post, put},
};
use clap::Parser;
use dotenv::dotenv;
use tower_http::cors::{Any, CorsLayer};

use backend::{
    Args, create_app_state, DEFAULT_PORT,
    web::{
        get_schema_handler, get_endpoints_handler, execute_query_handler,
        get_nodes_edges_handler, get_nodes_by_label_handler, 
        get_node_details_handler, get_node_connections_handler
    }
};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenv().ok();
    let args = Args::parse();
    let app_state = create_app_state(args);

    let app = Router::new()
        .route("/api/schema", get(get_schema_handler))
        .route("/api/endpoints", get(get_endpoints_handler))
        .route("/api/query/{query_name}", get(execute_query_handler))
        .route("/api/query/{query_name}", post(execute_query_handler))
        .route("/api/query/{query_name}", put(execute_query_handler))
        .route("/api/query/{query_name}", delete(execute_query_handler))
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

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{DEFAULT_PORT}")).await?;

    println!("Server running on http://0.0.0.0:{DEFAULT_PORT}");
    axum::serve(listener, app).await?;

    Ok(())
}