use axum::{
    Router,
    extract::{Path, Query, State},
    response::Json,
    routing::{delete, get, post, put},
};
use clap::{Parser, ValueEnum};
use dotenv::dotenv;
use helix_rs::{HelixDB, HelixDBClient};
use reqwest::Client as HttpClient;
use serde::Deserialize;
use serde_json::{Number, Value, json};
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};

mod query_parser;
mod schema_parser;

const DEFAULT_PORT: u16 = 8080;
const MAX_LIMIT: u32 = 300;
const SCHEMA_FILE_PATH: &str = "helixdb-cfg/schema.hx";
const QUERIES_FILE_PATH: &str = "helixdb-cfg/queries.hx";

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
    api_key: Option<String>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenv().ok();
    let args = Args::parse();

    // Use host.docker.internal when running in Docker, localhost otherwise
    let host = std::env::var("DOCKER_HOST_INTERNAL").unwrap_or_else(|_| "localhost".to_string());

    let helix_url = match args.source {
        DataSource::LocalIntrospect => {
            let url = format!("http://{}:{}", host, args.port);
            println!("Starting server in local-introspect mode");
            println!("Using local HelixDB introspect endpoint: {url}/introspect");
            url
        }
        DataSource::LocalFile => {
            println!("Starting server in local-file mode");
            println!("Reading from local helixdb-cfg files");
            format!("http://{}:{}", host, args.port)
        }
        DataSource::Cloud => {
            let url = args
                .cloud_url
                .clone()
                .expect("Cloud URL is required for cloud mode");
            let has_api_key = std::env::var("HELIX_API_KEY")
                .ok()
                .filter(|key| !key.trim().is_empty())
                .is_some();
            println!("Starting server in cloud mode");
            println!("Using cloud HelixDB endpoint: {url}/introspect");
            if has_api_key {
                println!("Authentication: Using API key from HELIX_API_KEY environment variable");
            } else {
                println!("Authentication: No API key found, connecting without authentication");
            }
            url
        }
    };

    let helix_db = match args.source {
        DataSource::Cloud => {
            let cloud_api_url = args
                .cloud_url
                .as_ref()
                .expect("Cloud URL is required for cloud mode");
            let api_key = std::env::var("HELIX_API_KEY")
                .ok()
                .filter(|key| !key.trim().is_empty());

            Arc::new(HelixDB::new(
                Some(cloud_api_url.as_str()),
                None,
                api_key.as_deref(),
            ))
        }
        DataSource::LocalIntrospect | DataSource::LocalFile => Arc::new(HelixDB::new(
            Some(&format!("http://{host}")),
            Some(args.port),
            None,
        )),
    };

    let app_state = AppState {
        helix_db: helix_db.clone(),
        data_source: args.source.clone(),
        helix_url,
        api_key: std::env::var("HELIX_API_KEY").ok(),
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

fn create_empty_schema() -> schema_parser::SchemaInfo {
    schema_parser::SchemaInfo {
        nodes: vec![],
        edges: vec![],
        vectors: vec![],
    }
}

fn create_default_error_data() -> serde_json::Value {
    json!({
        "nodes": [],
        "edges": [],
        "vectors": []
    })
}

fn create_node_connections_error_data() -> serde_json::Value {
    json!({
        "connected_nodes": {"values": []},
        "incoming_edges": {"values": []},
        "outgoing_edges": {"values": []}
    })
}

async fn make_http_request_with_auth(
    client: &HttpClient,
    url: &str,
    api_key: Option<&str>,
) -> Result<serde_json::Value, Box<dyn std::error::Error + Send + Sync>> {
    let mut request = client.get(url);

    if let Some(key) = api_key {
        request = request.header("x-api-key", key);
    }

    let response = request.send().await?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()).into());
    }

    let value: serde_json::Value = response.json().await?;
    Ok(value)
}

fn validate_limit(limit: Option<u32>) -> Option<u32> {
    limit.filter(|&l| l <= MAX_LIMIT)
}

#[axum_macros::debug_handler]
async fn get_schema_handler(State(app_state): State<AppState>) -> Json<schema_parser::SchemaInfo> {
    match app_state.data_source {
        DataSource::LocalFile => match schema_parser::parse_schema_file(SCHEMA_FILE_PATH) {
            Ok(schema_info) => Json(schema_info),
            Err(e) => {
                eprintln!("Error parsing schema: {e}");
                Json(create_empty_schema())
            }
        },
        DataSource::LocalIntrospect => {
            match fetch_cloud_introspect(&app_state.helix_url, None).await {
                Ok(introspect_data) => Json(introspect_data.schema),
                Err(e) => {
                    eprintln!("Error fetching schema from {}: {}", app_state.helix_url, e);
                    Json(create_empty_schema())
                }
            }
        }
        DataSource::Cloud => {
            match fetch_cloud_introspect(&app_state.helix_url, app_state.api_key.as_deref()).await {
                Ok(introspect_data) => Json(introspect_data.schema),
                Err(e) => {
                    eprintln!("Error fetching schema from {}: {}", app_state.helix_url, e);
                    Json(create_empty_schema())
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

    let param_types =
        get_query_param_types(&app_state, &query_name, app_state.api_key.as_deref()).await;
    for (key, value) in query_params {
        if !params.contains_key(&key) {
            let converted_value = if let Some(param_type) = param_types.get(&key) {
                convert_string_to_type(&value, param_type)
            } else {
                serde_json::Value::String(value)
            };
            params.insert(key, converted_value);
        }
    }

    let params_value = serde_json::Value::Object(params);

    match app_state.helix_db.query(&query_name, &params_value).await {
        Ok(result) => Json(sort_json_object(result)),
        Err(e) => {
            eprintln!("Error executing query '{query_name}': {e}");
            Json(json!({
                "error": format!("Failed to execute query: {e}"),
                "query": query_name
            }))
        }
    }
}

async fn get_query_param_types(
    app_state: &AppState,
    query_name: &str,
    api_key: Option<&str>,
) -> std::collections::HashMap<String, String> {
    let mut param_types = std::collections::HashMap::new();

    match fetch_cloud_introspect(&app_state.helix_url, api_key).await {
        Ok(introspect_data) => {
            for query in introspect_data.queries {
                if query.name == query_name {
                    if let serde_json::Value::Object(params) = query.parameters {
                        for (param_name, param_type_val) in params {
                            if let Some(param_type_str) = param_type_val.as_str() {
                                param_types.insert(param_name, param_type_str.to_string());
                            }
                        }
                    }
                    break;
                }
            }
        }
        Err(e) => {
            eprintln!("Warning: Could not fetch introspect data for parameter types: {e}");
        }
    }

    param_types
}

fn convert_string_to_type(value: &str, param_type: &str) -> serde_json::Value {
    let parse_number = |v: &str| -> Option<Number> {
        Number::from_f64(v.parse().ok()?).or_else(|| Some(Number::from(0)))
    };

    match param_type {
        "String" | "ID" => Value::String(value.to_string()),
        "I32" => value
            .parse::<i32>()
            .map(|n| Value::Number(Number::from(n)))
            .unwrap_or_else(|_| Value::String(value.to_string())),
        "I64" => value
            .parse::<i64>()
            .map(|n| Value::Number(Number::from(n)))
            .unwrap_or_else(|_| Value::String(value.to_string())),
        "U32" => value
            .parse::<u32>()
            .map(|n| Value::Number(Number::from(n)))
            .unwrap_or_else(|_| Value::Number(Number::from(0u32))),
        "U64" => value
            .parse::<u64>()
            .map(|n| Value::Number(Number::from(n)))
            .unwrap_or_else(|_| Value::Number(Number::from(0u64))),
        "U128" => value
            .parse::<u128>()
            .ok()
            .and_then(|n| parse_number(&(n as f64).to_string()))
            .map(Value::Number)
            .unwrap_or_else(|| Value::Number(Number::from(0))),
        "F64" => value
            .parse::<f64>()
            .ok()
            .and_then(|n| parse_number(&n.to_string()))
            .map(Value::Number)
            .unwrap_or_else(|| Value::String(value.to_string())),
        "Array(F64)" => parse_f64_array(value),
        _ => Value::String(value.to_string()),
    }
}

fn parse_f64_array(value: &str) -> serde_json::Value {
    serde_json::from_str::<Vec<f64>>(value)
        .or_else(|_| {
            value
                .split(',')
                .map(|s| s.trim().parse::<f64>())
                .collect::<Result<Vec<_>, _>>()
        })
        .map(|numbers| {
            serde_json::Value::Array(
                numbers
                    .into_iter()
                    .filter_map(serde_json::Number::from_f64)
                    .map(serde_json::Value::Number)
                    .collect(),
            )
        })
        .unwrap_or_else(|_| serde_json::Value::String(value.to_string()))
}

#[axum_macros::debug_handler]
async fn get_endpoints_handler(
    State(app_state): State<AppState>,
) -> Json<Vec<query_parser::ApiEndpointInfo>> {
    match app_state.data_source {
        DataSource::LocalFile => match query_parser::get_all_api_endpoints(QUERIES_FILE_PATH) {
            Ok(endpoints) => Json(endpoints),
            Err(e) => {
                eprintln!("Error getting endpoints: {e}");
                Json(vec![])
            }
        },
        DataSource::LocalIntrospect | DataSource::Cloud => {
            match fetch_cloud_introspect(&app_state.helix_url, app_state.api_key.as_deref()).await {
                Ok(introspect_data) => {
                    let endpoints = introspect_data
                        .queries
                        .into_iter()
                        .map(map_query_to_endpoint)
                        .collect::<Vec<_>>();
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

fn map_query_to_endpoint(query: IntrospectQuery) -> query_parser::ApiEndpointInfo {
    let parameters = if let serde_json::Value::Object(params) = query.parameters {
        params
            .into_iter()
            .map(|(name, type_val)| query_parser::QueryParameter {
                name,
                param_type: type_val.as_str().unwrap_or("String").to_string(),
            })
            .collect()
    } else {
        vec![]
    };

    let method = determine_http_method(&query.name);

    query_parser::ApiEndpointInfo {
        path: format!("/api/query/{}", query.name),
        method: method.to_string(),
        query_name: query.name,
        parameters,
    }
}

fn determine_http_method(query_name: &str) -> &'static str {
    match query_name {
        name if name.starts_with("create")
            || name.starts_with("add")
            || name.starts_with("assign") =>
        {
            "POST"
        }
        name if name.starts_with("update") => "PUT",
        name if name.starts_with("delete") || name.starts_with("remove") => "DELETE",
        _ => "GET",
    }
}

#[derive(Deserialize)]
struct IntrospectQuery {
    name: String,
    parameters: serde_json::Value,
}

#[derive(Deserialize)]
struct CloudIntrospectData {
    schema: schema_parser::SchemaInfo,
    queries: Vec<IntrospectQuery>,
}

async fn fetch_cloud_introspect(
    helix_url: &str,
    api_key: Option<&str>,
) -> anyhow::Result<CloudIntrospectData> {
    let client = reqwest::Client::new();
    let url = format!("{helix_url}/introspect");
    let mut request = client.get(&url);

    if let Some(api_key) = api_key {
        request = request.header("x-api-key", api_key);
    }

    let response = request.send().await?;

    if !response.status().is_success() {
        anyhow::bail!("Failed to fetch introspect data: {}", response.status());
    }

    let data: CloudIntrospectData = response.json().await?;
    Ok(data)
}

fn sort_json_object(value: Value) -> Value {
    match value {
        Value::Object(map) => {
            let (numeric, non_numeric): (Vec<_>, Vec<_>) = map
                .into_iter()
                .map(|(key, val)| (key, sort_json_object(val)))
                .partition(|(key, _)| key.chars().all(|c| c.is_numeric()));

            let (id, other): (Vec<_>, Vec<_>) =
                non_numeric.into_iter().partition(|(key, _)| key == "id");

            let mut sorted_numeric = numeric;
            sorted_numeric.sort_by(|(a, _), (b, _)| {
                a.parse::<u64>()
                    .unwrap_or(0)
                    .cmp(&b.parse::<u64>().unwrap_or(0))
            });

            [sorted_numeric, id, other]
                .into_iter()
                .flatten()
                .collect::<serde_json::Map<_, _>>()
                .into()
        }
        Value::Array(arr) => Value::Array(arr.into_iter().map(sort_json_object).collect()),
        other => other,
    }
}

#[derive(Deserialize)]
struct NodesEdgesQuery {
    limit: Option<u32>,
    node_label: Option<String>,
}

#[derive(Deserialize)]
struct NodeDetailsQuery {
    id: String,
}

#[derive(Deserialize)]
struct NodesByLabelQuery {
    label: String,
    limit: Option<u32>,
}

#[derive(Deserialize)]
struct NodeConnectionsQuery {
    node_id: String,
}

#[axum_macros::debug_handler]
async fn get_nodes_edges_handler(
    State(app_state): State<AppState>,
    Query(params): Query<NodesEdgesQuery>,
) -> Json<serde_json::Value> {
    let mut url = format!("{}/nodes-edges", app_state.helix_url);
    let mut query_params = vec![];

    if let Some(limit) = validate_limit(params.limit) {
        query_params.push(format!("limit={limit}"));
    }

    if let Some(node_label) = params.node_label {
        query_params.push(format!("node_label={node_label}"));
    }

    if !query_params.is_empty() {
        url.push('?');
        url.push_str(&query_params.join("&"));
    }

    let client = HttpClient::new();
    let api_key = if matches!(app_state.data_source, DataSource::Cloud) {
        app_state.api_key.as_deref()
    } else {
        None
    };

    match make_http_request_with_auth(&client, &url, api_key).await {
        Ok(data) => Json(data),
        Err(e) => {
            eprintln!("Error with nodes-edges request: {e}");
            Json(json!({
                "error": format!("Request failed: {e}"),
                "data": create_default_error_data()
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
    let client = HttpClient::new();
    let api_key = if matches!(app_state.data_source, DataSource::Cloud) {
        app_state.api_key.as_deref()
    } else {
        None
    };

    match make_http_request_with_auth(&client, &url, api_key).await {
        Ok(data) => Json(data),
        Err(e) => {
            eprintln!("Error with node-details request: {e}");
            Json(json!({
                "error": format!("Request failed: {e}"),
                "data": json!({})
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

    if let Some(limit) = validate_limit(params.limit) {
        query_params.push(format!("limit={limit}"));
    }

    if !query_params.is_empty() {
        url.push('?');
        url.push_str(&query_params.join("&"));
    }

    let client = HttpClient::new();
    let api_key = if matches!(app_state.data_source, DataSource::Cloud) {
        app_state.api_key.as_deref()
    } else {
        None
    };

    match make_http_request_with_auth(&client, &url, api_key).await {
        Ok(data) => Json(data),
        Err(e) => {
            eprintln!("Error with nodes-by-label request: {e}");
            Json(json!({
                "error": format!("Request failed: {e}"),
                "data": create_default_error_data()
            }))
        }
    }
}

#[axum_macros::debug_handler]
async fn get_node_connections_handler(
    State(app_state): State<AppState>,
    Query(params): Query<NodeConnectionsQuery>,
) -> Json<serde_json::Value> {
    let url = format!(
        "{}/node-connections?node_id={}",
        app_state.helix_url, params.node_id
    );

    let client = HttpClient::new();
    let api_key = if matches!(app_state.data_source, DataSource::Cloud) {
        app_state.api_key.as_deref()
    } else {
        None
    };

    match make_http_request_with_auth(&client, &url, api_key).await {
        Ok(data) => Json(data),
        Err(e) => {
            eprintln!("Error with node-connections request: {e}");
            let mut error_response = json!({
                "error": format!("Request failed: {e}")
            });

            if let serde_json::Value::Object(ref mut map) = error_response {
                if let serde_json::Value::Object(error_data) = create_node_connections_error_data()
                {
                    for (key, value) in error_data {
                        map.insert(key, value);
                    }
                }
            }

            Json(error_response)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_limit_valid() {
        assert_eq!(validate_limit(Some(100)), Some(100));
        assert_eq!(validate_limit(Some(300)), Some(300));
        assert_eq!(validate_limit(Some(1)), Some(1));
    }

    #[test]
    fn test_validate_limit_exceeds_max() {
        assert_eq!(validate_limit(Some(301)), None);
        assert_eq!(validate_limit(Some(1000)), None);
    }

    #[test]
    fn test_validate_limit_none() {
        assert_eq!(validate_limit(None), None);
    }

    #[test]
    fn test_determine_http_method() {
        assert_eq!(determine_http_method("createUser"), "POST");
        assert_eq!(determine_http_method("addUser"), "POST");
        assert_eq!(determine_http_method("assignRole"), "POST");

        assert_eq!(determine_http_method("updateUser"), "PUT");

        assert_eq!(determine_http_method("deleteUser"), "DELETE");
        assert_eq!(determine_http_method("removeUser"), "DELETE");

        assert_eq!(determine_http_method("getUser"), "GET");
        assert_eq!(determine_http_method("findUser"), "GET");
        assert_eq!(determine_http_method("listUsers"), "GET");
    }

    #[test]
    fn test_convert_string_to_type_string() {
        let result = convert_string_to_type("hello", "String");
        assert_eq!(result, serde_json::Value::String("hello".to_string()));

        let result = convert_string_to_type("123", "ID");
        assert_eq!(result, serde_json::Value::String("123".to_string()));
    }

    #[test]
    fn test_convert_string_to_type_integers() {
        let result = convert_string_to_type("42", "I32");
        assert_eq!(
            result,
            serde_json::Value::Number(serde_json::Number::from(42))
        );

        let result = convert_string_to_type("invalid", "I32");
        assert_eq!(result, serde_json::Value::String("invalid".to_string()));

        let result = convert_string_to_type("123", "I64");
        assert_eq!(
            result,
            serde_json::Value::Number(serde_json::Number::from(123i64))
        );
    }

    #[test]
    fn test_convert_string_to_type_unsigned() {
        let result = convert_string_to_type("42", "U32");
        assert_eq!(
            result,
            serde_json::Value::Number(serde_json::Number::from(42u32))
        );

        let result = convert_string_to_type("invalid", "U32");
        assert_eq!(
            result,
            serde_json::Value::Number(serde_json::Number::from(0u32))
        );

        let result = convert_string_to_type("123", "U64");
        assert_eq!(
            result,
            serde_json::Value::Number(serde_json::Number::from(123u64))
        );
    }

    #[test]
    fn test_convert_string_to_type_float() {
        let result = convert_string_to_type("3.14", "F64");
        if let serde_json::Value::Number(num) = result {
            assert_eq!(num.as_f64(), Some(3.14));
        } else {
            panic!("Expected number");
        }

        let result = convert_string_to_type("invalid", "F64");
        assert_eq!(result, serde_json::Value::String("invalid".to_string()));
    }

    #[test]
    fn test_convert_string_to_type_array_f64() {
        let result = convert_string_to_type("[1.0, 2.0, 3.0]", "Array(F64)");
        if let serde_json::Value::Array(arr) = result {
            assert_eq!(arr.len(), 3);
            assert_eq!(arr[0].as_f64(), Some(1.0));
            assert_eq!(arr[1].as_f64(), Some(2.0));
            assert_eq!(arr[2].as_f64(), Some(3.0));
        } else {
            panic!("Expected array");
        }

        let result = convert_string_to_type("1.0, 2.0, 3.0", "Array(F64)");
        if let serde_json::Value::Array(arr) = result {
            assert_eq!(arr.len(), 3);
        } else {
            panic!("Expected array");
        }

        let result = convert_string_to_type("invalid", "Array(F64)");
        assert_eq!(result, serde_json::Value::String("invalid".to_string()));
    }

    #[test]
    fn test_convert_string_to_type_unknown() {
        let result = convert_string_to_type("value", "UnknownType");
        assert_eq!(result, serde_json::Value::String("value".to_string()));
    }

    #[test]
    fn test_sort_json_object_basic() {
        let input = json!({
            "name": "John",
            "id": "123",
            "2": "second",
            "1": "first"
        });

        let result = sort_json_object(input);
        if let serde_json::Value::Object(map) = result {
            let keys: Vec<_> = map.keys().collect();
            assert_eq!(keys, vec!["1", "2", "id", "name"]);
        } else {
            panic!("Expected object");
        }
    }

    #[test]
    fn test_sort_json_object_nested() {
        let input = json!({
            "data": {
                "3": "third",
                "1": "first",
                "name": "test"
            },
            "id": "main"
        });

        let result = sort_json_object(input);
        if let serde_json::Value::Object(map) = result {
            if let Some(serde_json::Value::Object(nested)) = map.get("data") {
                let keys: Vec<_> = nested.keys().collect();
                assert_eq!(keys, vec!["1", "3", "name"]);
            } else {
                panic!("Expected nested object");
            }
        } else {
            panic!("Expected object");
        }
    }

    #[test]
    fn test_sort_json_object_array() {
        let input = json!([
            {"name": "B", "1": "first"},
            {"name": "A", "2": "second"}
        ]);

        let result = sort_json_object(input);
        if let serde_json::Value::Array(arr) = result {
            assert_eq!(arr.len(), 2);
            for item in arr {
                if let serde_json::Value::Object(obj) = item {
                    let keys: Vec<_> = obj.keys().collect();
                    if keys.iter().any(|k| *k == "1") {
                        assert_eq!(keys, vec!["1", "name"]);
                    } else {
                        assert_eq!(keys, vec!["2", "name"]);
                    }
                }
            }
        } else {
            panic!("Expected array");
        }
    }

    #[test]
    fn test_create_empty_schema() {
        let schema = create_empty_schema();
        assert!(schema.nodes.is_empty());
        assert!(schema.edges.is_empty());
        assert!(schema.vectors.is_empty());
    }

    #[test]
    fn test_create_default_error_data() {
        let error_data = create_default_error_data();
        if let serde_json::Value::Object(map) = error_data {
            assert!(map.contains_key("nodes"));
            assert!(map.contains_key("edges"));
            assert!(map.contains_key("vectors"));

            if let Some(serde_json::Value::Array(nodes)) = map.get("nodes") {
                assert!(nodes.is_empty());
            }
        } else {
            panic!("Expected object");
        }
    }

    #[test]
    fn test_create_node_connections_error_data() {
        let error_data = create_node_connections_error_data();
        if let serde_json::Value::Object(map) = error_data {
            assert!(map.contains_key("connected_nodes"));
            assert!(map.contains_key("incoming_edges"));
            assert!(map.contains_key("outgoing_edges"));
        } else {
            panic!("Expected object");
        }
    }
}
