use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryParameter {
    pub name: String,
    pub param_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryDefinition {
    pub name: String,
    pub parameters: Vec<QueryParameter>,
    pub http_method: String,
    pub endpoint_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiEndpointInfo {
    pub path: String,
    pub method: String,
    pub query_name: String,
    pub parameters: Vec<QueryParameter>,
}

pub fn parse_queries_file(file_path: &str) -> anyhow::Result<Vec<QueryDefinition>> {
    let content = fs::read_to_string(file_path)?;
    let mut queries = Vec::new();

    for line in content.lines() {
        let line = line.trim();
        if line.starts_with("QUERY ") {
            if let Some(query_def) = parse_query_line(line) {
                queries.push(query_def);
            }
        }
    }

    Ok(queries)
}

fn parse_query_line(line: &str) -> Option<QueryDefinition> {
    let parts: Vec<&str> = line.split(" (").collect();
    if parts.len() < 2 {
        return None;
    }

    let name = parts[0].replace("QUERY ", "").trim().to_string();

    let params_section = parts[1].split(") =>").next()?;
    let parameters = parse_parameters(params_section);

    let (http_method, endpoint_path) = determine_endpoint_info(&name, &parameters);

    Some(QueryDefinition {
        name,
        parameters,
        http_method,
        endpoint_path,
    })
}

fn parse_parameters(params_str: &str) -> Vec<QueryParameter> {
    if params_str.trim().is_empty() {
        return Vec::new();
    }

    let mut parameters = Vec::new();

    for param in params_str.split(", ") {
        let param = param.trim();
        if let Some((name, param_type)) = param.split_once(": ") {
            parameters.push(QueryParameter {
                name: name.trim().to_string(),
                param_type: map_helix_type_to_rust(param_type.trim()),
            });
        }
    }

    parameters
}

fn map_helix_type_to_rust(helix_type: &str) -> String {
    match helix_type {
        "String" => "String".to_string(),
        "I32" => "i32".to_string(),
        "I64" => "i64".to_string(),
        "F64" => "f64".to_string(),
        "ID" => "String".to_string(),
        "[F64]" => "Vec<f64>".to_string(),
        _ => helix_type.to_string(),
    }
}

fn determine_endpoint_info(query_name: &str, parameters: &[QueryParameter]) -> (String, String) {
    let lower_name = query_name.to_lowercase();

    let method = if lower_name.starts_with("create") || lower_name.starts_with("add") {
        "POST"
    } else if lower_name.starts_with("update") {
        "PUT"
    } else if lower_name.starts_with("delete") || lower_name.starts_with("remove") {
        "DELETE"
    } else {
        "GET"
    };

    let path = generate_endpoint_path(query_name, parameters);

    (method.to_string(), path)
}

fn generate_endpoint_path(query_name: &str, parameters: &[QueryParameter]) -> String {
    let base_path = convert_camel_to_kebab(query_name);

    let mut path_params = Vec::new();
    for param in parameters {
        if param.name.ends_with("_id") || param.name == "id" {
            path_params.push(format!("{{{}}}", param.name));
        }
    }

    if path_params.is_empty() {
        format!("/api/query/{}", base_path)
    } else {
        format!("/api/query/{}/{}", base_path, path_params.join("/"))
    }
}

fn convert_camel_to_kebab(camel_case: &str) -> String {
    let mut result = String::new();
    let mut chars = camel_case.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch.is_uppercase() && !result.is_empty() {
            result.push('-');
        }
        result.push(ch.to_lowercase().next().unwrap());
    }

    result
}

pub fn get_all_api_endpoints(queries_file_path: &str) -> anyhow::Result<Vec<ApiEndpointInfo>> {
    let query_definitions = parse_queries_file(queries_file_path)?;

    let endpoints = query_definitions
        .into_iter()
        .map(|query| ApiEndpointInfo {
            path: query.endpoint_path,
            method: query.http_method,
            query_name: query.name,
            parameters: query.parameters,
        })
        .collect();

    Ok(endpoints)
}
