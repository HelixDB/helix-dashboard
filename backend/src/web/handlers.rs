//! HTTP handlers for the HelixDB dashboard API

use axum::{
    extract::{Path, Query, State},
    response::Json,
};
use helix_rs::HelixDBClient;
use serde_json::{json, Value};
use std::collections::HashMap;

use crate::{
    AppState, DataSource, QUERIES_FILE_PATH, SCHEMA_FILE_PATH,
    core::{query_parser::ApiEndpointInfo, schema_parser::SchemaInfo},
    web::{params::*, errors::ErrorData, utils::{sort_json_object, map_query_to_endpoint}, types::CloudIntrospectData},
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
    let param_types = get_query_param_types(&app_state, &query_name).await;
    
    let params_value = QueryParams::merge_parameters(
        &query_params,
        body.as_ref().map(|json| &json.0),
        &param_types,
    );

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
    Query(params): Query<QueryParams>,
) -> Json<Value> {
    let endpoint = params.to_url("nodes-edges");

    match app_state.helix_client.get::<Value>(&endpoint).await {
        Ok(data) => Json(data),
        Err(e) => {
            eprintln!("Error with nodes-edges request: {e}");
            Json(json!({
                "error": format!("Request failed: {e}"),
                "data": ErrorData::empty()
            }))
        }
    }
}

#[axum_macros::debug_handler]
pub async fn get_node_details_handler(
    State(app_state): State<AppState>,
    Query(params): Query<QueryParams>,
) -> Json<Value> {
    let endpoint = params.to_url("node-details");
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
    Query(params): Query<QueryParams>,
) -> Json<Value> {
    let endpoint = params.to_url("nodes-by-label");

    match app_state.helix_client.get::<Value>(&endpoint).await {
        Ok(data) => Json(data),
        Err(e) => {
            eprintln!("Error with nodes-by-label request: {e}");
            Json(json!({
                "error": format!("Request failed: {e}"),
                "data": ErrorData::empty()
            }))
        }
    }
}

#[axum_macros::debug_handler]
pub async fn get_node_connections_handler(
    State(app_state): State<AppState>,
    Query(params): Query<QueryParams>,
) -> Json<Value> {
    let endpoint = params.to_url("node-connections");

    match app_state.helix_client.get::<Value>(&endpoint).await {
        Ok(data) => Json(data),
        Err(e) => {
            eprintln!("Error with node-connections request: {e}");
            let mut error_response = json!({
                "error": format!("Request failed: {e}")
            });

            if let Value::Object(ref mut map) = error_response {
                if let Value::Object(error_data) = ErrorData::empty_connections()
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
