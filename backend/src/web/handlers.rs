//! HTTP handlers for the HelixDB dashboard API

use axum::{
    extract::{Path, Query, State},
    response::Json,
};
use helix_rs::HelixDBClient;
use serde_json::json;
use std::collections::HashMap;

use crate::{
    schema_parser, query_parser, utils::*, web::types::*, AppState, 
    SCHEMA_FILE_PATH, QUERIES_FILE_PATH, DataSource
};

#[axum_macros::debug_handler]
pub async fn get_schema_handler(State(app_state): State<AppState>) -> Json<schema_parser::SchemaInfo> {
    match app_state.data_source {
        DataSource::LocalFile => match schema_parser::SchemaInfo::from_file(SCHEMA_FILE_PATH) {
            Ok(schema_info) => Json(schema_info),
            Err(e) => {
                eprintln!("Error parsing schema: {e}");
                Json(schema_parser::SchemaInfo::new())
            }
        },
        DataSource::LocalIntrospect => {
            match fetch_cloud_introspect(&app_state.helix_url, None).await {
                Ok(introspect_data) => Json(introspect_data.schema),
                Err(e) => {
                    eprintln!("Error fetching schema from {}: {}", app_state.helix_url, e);
                    Json(schema_parser::SchemaInfo::new())
                }
            }
        }
        DataSource::Cloud => {
            match fetch_cloud_introspect(&app_state.helix_url, app_state.api_key.as_deref()).await {
                Ok(introspect_data) => Json(introspect_data.schema),
                Err(e) => {
                    eprintln!("Error fetching schema from {}: {}", app_state.helix_url, e);
                    Json(schema_parser::SchemaInfo::new())
                }
            }
        }
    }
}

#[axum_macros::debug_handler]
pub async fn execute_query_handler(
    State(app_state): State<AppState>,
    Path(query_name): Path<String>,
    axum::extract::Query(query_params): axum::extract::Query<HashMap<String, String>>,
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

#[axum_macros::debug_handler]
pub async fn get_endpoints_handler(
    State(app_state): State<AppState>,
) -> Json<Vec<query_parser::ApiEndpointInfo>> {
    match app_state.data_source {
        DataSource::LocalFile => match query_parser::ApiEndpointInfo::from_queries_file(QUERIES_FILE_PATH) {
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

#[axum_macros::debug_handler]
pub async fn get_nodes_edges_handler(
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

    let client = reqwest::Client::new();
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
pub async fn get_node_details_handler(
    State(app_state): State<AppState>,
    Query(params): Query<NodeDetailsQuery>,
) -> Json<serde_json::Value> {
    let url = format!("{}/node-details?id={}", app_state.helix_url, params.id);
    let client = reqwest::Client::new();
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
pub async fn get_nodes_by_label_handler(
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

    let client = reqwest::Client::new();
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
pub async fn get_node_connections_handler(
    State(app_state): State<AppState>,
    Query(params): Query<NodeConnectionsQuery>,
) -> Json<serde_json::Value> {
    let url = format!(
        "{}/node-connections?node_id={}",
        app_state.helix_url, params.node_id
    );

    let client = reqwest::Client::new();
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

async fn get_query_param_types(
    app_state: &AppState,
    query_name: &str,
    api_key: Option<&str>,
) -> HashMap<String, String> {
    let mut param_types = HashMap::new();

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

pub async fn fetch_cloud_introspect(
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

pub fn map_query_to_endpoint(query: IntrospectQuery) -> query_parser::ApiEndpointInfo {
    let parameters = if let serde_json::Value::Object(params) = query.parameters {
        params
            .into_iter()
            .map(|(name, type_val)| query_parser::QueryParameter::new(
                name,
                type_val.as_str().unwrap_or("String").to_string(),
            ))
            .collect()
    } else {
        vec![]
    };

    let method = determine_http_method(&query.name);

    query_parser::ApiEndpointInfo::new(
        format!("/api/query/{}", query.name),
        method.to_string(),
        query.name,
        parameters,
    )
}

pub fn determine_http_method(query_name: &str) -> &'static str {
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

#[cfg(test)]
mod tests {
    use super::*;

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
}