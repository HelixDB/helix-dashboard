use axum::{
    Router,
    extract::{Path, State},
    response::Json,
    routing::{delete, get, post, put},
};
use clap::{Parser, ValueEnum};
use helix_rs::{HelixDB, HelixDBClient};
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
            let url = "http://localhost:6969".to_string();
            println!("Starting server in local-introspect mode");
            println!(
                "Using local HelixDB introspect endpoint: {}/api/introspect",
                url
            );
            url
        }
        DataSource::LocalFile => {
            println!("Starting server in local-file mode");
            println!("Reading from local helixdb-cfg files");
            "http://localhost:6969".to_string()
        }
        DataSource::Cloud => {
            let url = args
                .cloud_url
                .expect("Cloud URL is required for cloud mode");
            println!("Starting server in cloud mode");
            println!("Using cloud HelixDB endpoint: {}/api/introspect", url);
            url
        }
    };

    let helix_db = Arc::new(HelixDB::new(Some("http://localhost"), Some(6969)));

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
        Ok(result) => Json(result),
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
                Ok(introspect_data) => Json(introspect_data.queries),
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
struct CloudIntrospectData {
    schema: schema_parser::SchemaInfo,
    queries: Vec<query_parser::ApiEndpointInfo>,
}

async fn fetch_cloud_introspect(helix_url: &str) -> anyhow::Result<CloudIntrospectData> {
    let client = reqwest::Client::new();
    let url = format!("{}/api/introspect", helix_url);

    let response = client.get(&url).send().await?;

    if !response.status().is_success() {
        anyhow::bail!("Failed to fetch introspect data: {}", response.status());
    }

    let data = response.json::<CloudIntrospectData>().await?;
    Ok(data)
}
