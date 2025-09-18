//! HTTP handlers for the HelixDB dashboard API

use axum::{
    extract::{Path, Query, State},
    response::Json,
};
use helix_rs::HelixDBClient;
use serde_json::{json, Map, Value};
use std::collections::HashMap;

use crate::{
    AppState, DataSource, QUERIES_FILE_PATH, SCHEMA_FILE_PATH,
    core::{query_parser::{ApiEndpointInfo, QueryParameter}, schema_parser::SchemaInfo, utils::{create_default_error_data, create_node_connections_error_data, convert_string_to_type, sort_json_object, validate_limit}},
    web::types::*,
};


#[axum_macros::debug_handler]
pub async fn get_schema_handler(
    State(app_state): State<AppState>,
) -> Json<SchemaInfo> {
    match app_state.data_source {
        DataSource::LocalFile => match SchemaInfo::from_file(SCHEMA_FILE_PATH) {
            Ok(schema_info) => Json(schema_info),
            Err(e) => {
                eprintln!("Error parsing schema: {e}");
                Json(SchemaInfo::new())
            }
        },
        DataSource::LocalIntrospect => {
            match app_state.helix_client.get::<CloudIntrospectData>("introspect").await {
                Ok(introspect_data) => Json(introspect_data.schema),
                Err(e) => {
                    eprintln!("Error fetching schema from {}: {}", app_state.helix_client.base_url(), e);
                    Json(SchemaInfo::new())
                }
            }
        }
        DataSource::Cloud => {
            match app_state.helix_client.get::<CloudIntrospectData>("introspect").await {
                Ok(introspect_data) => Json(introspect_data.schema),
                Err(e) => {
                    eprintln!("Error fetching schema from {}: {}", app_state.helix_client.base_url(), e);
                    Json(SchemaInfo::new())
                }
            }
        }
    }
}

#[axum_macros::debug_handler]
pub async fn execute_query_handler(
    State(app_state): State<AppState>,
    Path(query_name): Path<String>,
    Query(query_params): Query<HashMap<String, String>>,
    body: Option<Json<Value>>,
) -> Json<Value> {
    let mut params = match body {
        Some(Json(Value::Object(map))) => map,
        Some(Json(other)) if !other.is_null() => {
            let mut map = Map::new();
            map.insert("body".to_string(), other);
            map
        }
        _ => Map::new(),
    };

    let param_types = get_query_param_types(&app_state, &query_name).await;
    for (key, value) in query_params {
        if !params.contains_key(&key) {
            let converted_value = if let Some(param_type) = param_types.get(&key) {
                convert_string_to_type(&value, param_type)
            } else {
                Value::String(value)
            };
            params.insert(key, converted_value);
        }
    }

    let params_value = Value::Object(params);

    match app_state.helix_client.query(&query_name, &params_value).await {
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
) -> Json<Vec<ApiEndpointInfo>> {
    match app_state.data_source {
        DataSource::LocalFile => {
            match ApiEndpointInfo::from_queries_file(QUERIES_FILE_PATH) {
                Ok(endpoints) => Json(endpoints),
                Err(e) => {
                    eprintln!("Error getting endpoints: {e}");
                    Json(vec![])
                }
            }
        }
        DataSource::LocalIntrospect | DataSource::Cloud => {
            match app_state.helix_client.get::<CloudIntrospectData>("introspect").await {
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
                        app_state.helix_client.base_url(), e
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
) -> Json<Value> {
    let mut endpoint = "nodes-edges".to_string();
    let mut query_params = vec![];

    if let Some(limit) = validate_limit(params.limit) {
        query_params.push(format!("limit={limit}"));
    }

    if let Some(node_label) = params.node_label {
        query_params.push(format!("node_label={node_label}"));
    }

    if !query_params.is_empty() {
        endpoint.push('?');
        endpoint.push_str(&query_params.join("&"));
    }

    match app_state.helix_client.get::<Value>(&endpoint).await {
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
) -> Json<Value> {
    let endpoint = format!("node-details?id={}", params.id);
    match app_state.helix_client.get::<Value>(&endpoint).await {
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
) -> Json<Value> {
    let mut endpoint = "nodes-by-label".to_string();
    let mut query_params = vec![];

    query_params.push(format!("label={}", params.label));

    if let Some(limit) = validate_limit(params.limit) {
        query_params.push(format!("limit={limit}"));
    }

    if !query_params.is_empty() {
        endpoint.push('?');
        endpoint.push_str(&query_params.join("&"));
    }

    match app_state.helix_client.get::<Value>(&endpoint).await {
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
) -> Json<Value> {
    let endpoint = format!("node-connections?node_id={}", params.node_id);

    match app_state.helix_client.get::<Value>(&endpoint).await {
        Ok(data) => Json(data),
        Err(e) => {
            eprintln!("Error with node-connections request: {e}");
            let mut error_response = json!({
                "error": format!("Request failed: {e}")
            });

            if let Value::Object(ref mut map) = error_response {
                if let Value::Object(error_data) = create_node_connections_error_data()
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
) -> HashMap<String, String> {
    let mut param_types = HashMap::new();

    match app_state.helix_client.get::<CloudIntrospectData>("introspect").await {
        Ok(introspect_data) => {
            for query in introspect_data.queries {
                if query.name == query_name {
                    if let Value::Object(params) = query.parameters {
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


pub fn map_query_to_endpoint(query: IntrospectQuery) -> ApiEndpointInfo {
    let parameters = if let Value::Object(params) = query.parameters {
        params
            .into_iter()
            .map(|(name, type_val)| {
                QueryParameter::new(
                    name,
                    type_val.as_str().unwrap_or("String").to_string(),
                )
            })
            .collect()
    } else {
        vec![]
    };

    let method = determine_http_method(&query.name);

    ApiEndpointInfo::new(
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
