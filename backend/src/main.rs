use axum::{
    Router,
    extract::{Path, Query, State},
    response::Json,
    routing::{delete, get, post, put},
};
use clap::{Parser, ValueEnum};
use helix_rs::{HelixDB, HelixDBClient};
use serde_json::{Map, Value};
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};

mod query_parser;
mod schema_parser;

#[derive(Debug, Clone, ValueEnum)]
enum DataSource {
    #[value(
        name = "local-introspect",
        help = "Use local HelixDB introspect endpoint"
    )]
    LocalIntrospect,
    #[value(name = "local-file", help = "Read from local helixdb-cfg files")]
    LocalFile,
    #[value(name = "cloud", help = "Use cloud HelixDB introspect endpoint")]
    Cloud,
}

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[arg(value_enum, default_value = "local-introspect")]
    source: DataSource,
    #[arg(value_name = "URL", required_if_eq("source", "cloud"))]
    cloud_url: Option<String>,
    #[arg(
        short,
        long,
        default_value = "6969",
        help = "Port for local HelixDB instance"
    )]
    port: u16,
}

#[derive(Clone)]
struct AppState {
    helix_db: Arc<HelixDB>,
    data_source: DataSource,
    helix_url: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();

    let helix_url = match args.source {
        DataSource::LocalIntrospect => {
            let url = format!("http://localhost:{}", args.port);
            println!("Starting server in local-introspect mode");
            println!(
                "Using local HelixDB introspect endpoint: {}/introspect",
                url
            );
            url
        }
        DataSource::LocalFile => {
            println!("Starting server in local-file mode");
            println!("Reading from local helixdb-cfg files");
            format!("http://localhost:{}", args.port)
        }
        DataSource::Cloud => {
            let url = args
                .cloud_url
                .expect("Cloud URL is required for cloud mode");
            println!("Starting server in cloud mode");
            println!("Using cloud HelixDB endpoint: {}/introspect", url);
            url
        }
    };

    let helix_db = Arc::new(HelixDB::new(Some("http://localhost"), Some(args.port)));

    let app_state = AppState {
        helix_db: helix_db.clone(),
        data_source: args.source.clone(),
        helix_url,
    };

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
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .with_state(app_state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:8080").await?;

    println!("Server running on http://127.0.0.1:8080");
    axum::serve(listener, app).await?;

    Ok(())
}

#[axum_macros::debug_handler]
async fn get_schema_handler(State(app_state): State<AppState>) -> Json<schema_parser::SchemaInfo> {
    match app_state.data_source {
        DataSource::LocalFile => {
            let schema_path = "helixdb-cfg/schema.hx";
            match schema_parser::parse_schema_file(schema_path) {
                Ok(schema_info) => Json(schema_info),
                Err(e) => {
                    eprintln!("Error parsing schema: {}", e);
                    Json(schema_parser::SchemaInfo {
                        nodes: vec![],
                        edges: vec![],
                    })
                }
            }
        }
        DataSource::LocalIntrospect | DataSource::Cloud => {
            match fetch_cloud_introspect(&app_state.helix_url).await {
                Ok(introspect_data) => Json(introspect_data.schema),
                Err(e) => {
                    eprintln!("Error fetching schema from {}: {}", app_state.helix_url, e);
                    Json(schema_parser::SchemaInfo {
                        nodes: vec![],
                        edges: vec![],
                    })
                }
            }
        }
    }
}

#[axum_macros::debug_handler]
async fn execute_query_handler(
    State(app_state): State<AppState>,
    Path(query_name): Path<String>,
    axum::extract::Query(query_params): axum::extract::Query<
        std::collections::HashMap<String, String>,
    >,
    body: Option<Json<serde_json::Value>>,
) -> Json<serde_json::Value> {
    let mut params = match body {
        Some(Json(serde_json::Value::Object(map))) => map,
        Some(Json(other)) if !other.is_null() => {
            let mut map = serde_json::Map::new();
            map.insert("body".to_string(), other);
            map
        }
        _ => serde_json::Map::new(),
    };
    for (key, value) in query_params {
        params.insert(key, serde_json::Value::String(value));
    }

    let params_value = serde_json::Value::Object(params);

    match app_state.helix_db.query(&query_name, &params_value).await {
        Ok(result) => Json(sort_json_object(result)),
        Err(e) => {
            eprintln!("Error executing query '{}': {}", query_name, e);
            Json(serde_json::json!({
                "error": format!("Failed to execute query: {}", e),
                "query": query_name
            }))
        }
    }
}

#[axum_macros::debug_handler]
async fn get_endpoints_handler(
    State(app_state): State<AppState>,
) -> Json<Vec<query_parser::ApiEndpointInfo>> {
    match app_state.data_source {
        DataSource::LocalFile => {
            let queries_file = "helixdb-cfg/queries.hx";
            match query_parser::get_all_api_endpoints(queries_file) {
                Ok(endpoints) => Json(endpoints),
                Err(e) => {
                    eprintln!("Error getting endpoints: {}", e);
                    Json(vec![])
                }
            }
        }
        DataSource::LocalIntrospect | DataSource::Cloud => {
            match fetch_cloud_introspect(&app_state.helix_url).await {
                Ok(introspect_data) => {
                    let endpoints = introspect_data
                        .queries
                        .into_iter()
                        .map(|query| {
                            let parameters =
                                if let serde_json::Value::Object(params) = query.parameters {
                                    params
                                        .into_iter()
                                        .map(|(name, type_val)| query_parser::QueryParameter {
                                            name,
                                            param_type: type_val
                                                .as_str()
                                                .unwrap_or("String")
                                                .to_string(),
                                        })
                                        .collect()
                                } else {
                                    vec![]
                                };

                            let method = if query.name.starts_with("create")
                                || query.name.starts_with("add")
                                || query.name.starts_with("assign")
                            {
                                "POST"
                            } else if query.name.starts_with("update") {
                                "PUT"
                            } else if query.name.starts_with("delete")
                                || query.name.starts_with("remove")
                            {
                                "DELETE"
                            } else {
                                "GET"
                            };

                            query_parser::ApiEndpointInfo {
                                path: format!("/api/query/{}", query.name),
                                method: method.to_string(),
                                query_name: query.name,
                                parameters,
                            }
                        })
                        .collect();
                    Json(endpoints)
                }
                Err(e) => {
                    eprintln!(
                        "Error fetching endpoints from {}: {}",
                        app_state.helix_url, e
                    );
                    Json(vec![])
                }
            }
        }
    }
}

#[derive(serde::Deserialize)]
struct IntrospectQuery {
    name: String,
    parameters: serde_json::Value,
}

#[derive(serde::Deserialize)]
struct CloudIntrospectData {
    schema: schema_parser::SchemaInfo,
    queries: Vec<IntrospectQuery>,
}

async fn fetch_cloud_introspect(helix_url: &str) -> anyhow::Result<CloudIntrospectData> {
    let client = reqwest::Client::new();
    let url = format!("{}/introspect", helix_url);

    let response = client.get(&url).send().await?;

    if !response.status().is_success() {
        anyhow::bail!("Failed to fetch introspect data: {}", response.status());
    }

    let text = response.text().await?;
    match serde_json::from_str::<CloudIntrospectData>(&text) {
        Ok(data) => Ok(data),
        Err(e) => {
            eprintln!("Failed to parse introspect response: {}", e);
            eprintln!("Response text: {}", text);
            anyhow::bail!("Failed to parse introspect response: {}", e)
        }
    }
}

fn sort_json_object(value: Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut sorted_map = Map::new();

            let mut numeric_keys: Vec<(String, Value)> = vec![];
            let mut id_key: Option<(String, Value)> = None;
            let mut other_keys: Vec<(String, Value)> = vec![];

            for (key, val) in map {
                let sorted_val = sort_json_object(val);

                if key.chars().all(|c| c.is_numeric()) {
                    numeric_keys.push((key, sorted_val));
                } else if key == "id" {
                    id_key = Some((key, sorted_val));
                } else {
                    other_keys.push((key, sorted_val));
                }
            }

            numeric_keys.sort_by(|(a, _), (b, _)| {
                a.parse::<u64>()
                    .unwrap_or(0)
                    .cmp(&b.parse::<u64>().unwrap_or(0))
            });

            // Insert in order: numeric keys, id, then others
            for (k, v) in numeric_keys {
                sorted_map.insert(k, v);
            }
            if let Some((k, v)) = id_key {
                sorted_map.insert(k, v);
            }
            for (k, v) in other_keys {
                sorted_map.insert(k, v);
            }

            Value::Object(sorted_map)
        }
        Value::Array(arr) => Value::Array(arr.into_iter().map(sort_json_object).collect()),
        other => other,
    }
}

#[derive(serde::Deserialize)]
struct NodesEdgesQuery {
    limit: Option<u32>,
    node_label: Option<String>,
}

#[derive(serde::Deserialize)]
struct NodeDetailsQuery {
    id: String,
}

#[derive(serde::Deserialize)]
struct NodesByLabelQuery {
    label: String,
    limit: Option<u32>,
}

#[axum_macros::debug_handler]
async fn get_nodes_edges_handler(
    State(app_state): State<AppState>,
    Query(params): Query<NodesEdgesQuery>,
) -> Json<serde_json::Value> {
    let mut url = format!("{}/nodes-edges", app_state.helix_url);
    let mut query_params = vec![];

    if let Some(limit) = params.limit {
        let capped_limit = limit.min(300);
        query_params.push(format!("limit={}", capped_limit));
    }

    if let Some(node_label) = params.node_label {
        query_params.push(format!("node_label={}", node_label));
    }

    if !query_params.is_empty() {
        url.push('?');
        url.push_str(&query_params.join("&"));
    }

    match reqwest::get(&url).await {
        Ok(response) => {
            if response.status().is_success() {
                match response.json::<serde_json::Value>().await {
                    Ok(data) => Json(data),
                    Err(e) => {
                        eprintln!("Error parsing nodes-edges response: {}", e);
                        Json(serde_json::json!({
                            "error": format!("Failed to parse response: {}", e),
                            "data": { "nodes": [], "edges": [], "vectors": [] }
                        }))
                    }
                }
            } else {
                eprintln!("Error from HelixDB nodes-edges: {}", response.status());
                Json(serde_json::json!({
                    "error": format!("HelixDB error: {}", response.status()),
                    "data": { "nodes": [], "edges": [], "vectors": [] }
                }))
            }
        }
        Err(e) => {
            eprintln!("Error connecting to HelixDB nodes-edges: {}", e);
            Json(serde_json::json!({
                "error": format!("Connection error: {}", e),
                "data": { "nodes": [], "edges": [], "vectors": [] }
            }))
        }
    }
}

#[axum_macros::debug_handler]
async fn get_node_details_handler(
    State(app_state): State<AppState>,
    Query(params): Query<NodeDetailsQuery>,
) -> Json<serde_json::Value> {
    let url = format!("{}/node-details?id={}", app_state.helix_url, params.id);

    match reqwest::get(&url).await {
        Ok(response) => {
            if response.status().is_success() {
                match response.json::<serde_json::Value>().await {
                    Ok(data) => Json(data),
                    Err(e) => {
                        eprintln!("Error parsing node-details response: {}", e);
                        Json(serde_json::json!({
                            "error": format!("Failed to parse response: {}", e),
                            "data": {}
                        }))
                    }
                }
            } else {
                eprintln!("Error from HelixDB node-details: {}", response.status());
                Json(serde_json::json!({
                    "error": format!("HelixDB error: {}", response.status()),
                    "data": {}
                }))
            }
        }
        Err(e) => {
            eprintln!("Error connecting to HelixDB node-details: {}", e);
            Json(serde_json::json!({
                "error": format!("Connection error: {}", e),
                "data": {}
            }))
        }
    }
}

#[axum_macros::debug_handler]
async fn get_nodes_by_label_handler(
    State(app_state): State<AppState>,
    Query(params): Query<NodesByLabelQuery>,
) -> Json<serde_json::Value> {
    let mut url = format!("{}/nodes-by-label", app_state.helix_url);
    let mut query_params = vec![];

    query_params.push(format!("label={}", params.label));

    if let Some(limit) = params.limit {
        let capped_limit = limit.min(300);
        query_params.push(format!("limit={}", capped_limit));
    }

    if !query_params.is_empty() {
        url.push('?');
        url.push_str(&query_params.join("&"));
    }

    match reqwest::get(&url).await {
        Ok(response) => {
            if response.status().is_success() {
                match response.json::<serde_json::Value>().await {
                    Ok(data) => Json(data),
                    Err(e) => {
                        eprintln!("Error parsing nodes-by-label response: {}", e);
                        Json(serde_json::json!({
                            "error": format!("Failed to parse response: {}", e),
                            "data": { "nodes": [], "edges": [], "vectors": [] }
                        }))
                    }
                }
            } else {
                eprintln!("Error from HelixDB nodes-by-label: {}", response.status());
                Json(serde_json::json!({
                    "error": format!("HelixDB error: {}", response.status()),
                    "data": { "nodes": [], "edges": [], "vectors": [] }
                }))
            }
        }
        Err(e) => {
            eprintln!("Error connecting to HelixDB nodes-by-label: {}", e);
            Json(serde_json::json!({
                "error": format!("Connection error: {}", e),
                "data": { "nodes": [], "edges": [], "vectors": [] }
            }))
        }
    }
}
