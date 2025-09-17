use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryParameter {
    pub name: String,
    pub param_type: String,
}

impl QueryParameter {
    /// Create a new query parameter
    pub fn new(name: String, param_type: String) -> Self {
        Self {
            name,
            param_type: map_helix_type_to_rust(&param_type),
        }
    }

    /// Parse multiple parameters from a string
    pub fn parse_multiple(params_str: &str) -> Vec<Self> {
        if params_str.trim().is_empty() {
            return Vec::new();
        }

        let mut parameters = Vec::new();

        for param in params_str.split(", ") {
            let param = param.trim();
            if let Some((name, param_type)) = param.split_once(": ") {
                parameters.push(Self::new(
                    name.trim().to_string(),
                    param_type.trim().to_string(),
                ));
            }
        }

        parameters
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryDefinition {
    pub name: String,
    pub parameters: Vec<QueryParameter>,
    pub http_method: String,
    pub endpoint_path: String,
}

impl QueryDefinition {
    /// Parse query definitions from file
    pub fn from_file(file_path: &str) -> anyhow::Result<Vec<Self>> {
        let content = fs::read_to_string(file_path)?;
        let mut queries = Vec::new();

        for line in content.lines() {
            let line = line.trim();
            if line.starts_with("QUERY ") {
                if let Some(query_def) = Self::from_line(line) {
                    queries.push(query_def);
                }
            }
        }

        Ok(queries)
    }

    /// Parse a single query definition from a line
    pub fn from_line(line: &str) -> Option<Self> {
        let parts: Vec<&str> = line.split(" (").collect();
        if parts.len() < 2 {
            return None;
        }

        let name = parts[0].replace("QUERY ", "").trim().to_string();

        let params_section = parts[1].split(") =>").next()?;
        let parameters = QueryParameter::parse_multiple(params_section);

        let (http_method, endpoint_path) = determine_endpoint_info(&name, &parameters);

        Some(Self {
            name,
            parameters,
            http_method,
            endpoint_path,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiEndpointInfo {
    pub path: String,
    pub method: String,
    pub query_name: String,
    pub parameters: Vec<QueryParameter>,
}

impl ApiEndpointInfo {
    /// Create a new API endpoint info
    pub fn new(path: String, method: String, query_name: String, parameters: Vec<QueryParameter>) -> Self {
        Self {
            path,
            method,
            query_name,
            parameters,
        }
    }

    /// Get all API endpoints from queries file
    pub fn from_queries_file(queries_file_path: &str) -> anyhow::Result<Vec<Self>> {
        QueryDefinition::from_file(queries_file_path).map(|query_definitions| {
            query_definitions
                .into_iter()
                .map(|query| Self::new(
                    query.endpoint_path,
                    query.http_method,
                    query.name,
                    query.parameters,
                ))
                .collect()
        })
    }

    /// Convert from query definition
    pub fn from_query_definition(query: QueryDefinition) -> Self {
        Self::new(
            query.endpoint_path,
            query.http_method,
            query.name,
            query.parameters,
        )
    }
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
    let method = match query_name.to_lowercase().as_str() {
        name if name.starts_with("create") || name.starts_with("add") => "POST",
        name if name.starts_with("update") => "PUT",
        name if name.starts_with("delete") || name.starts_with("remove") => "DELETE",
        _ => "GET",
    };

    (
        method.to_string(),
        generate_endpoint_path(query_name, parameters),
    )
}

fn generate_endpoint_path(query_name: &str, parameters: &[QueryParameter]) -> String {
    let base_path = convert_camel_to_kebab(query_name);

    let path_params: Vec<String> = parameters
        .iter()
        .filter(|param| param.name.ends_with("_id") || param.name == "id")
        .map(|param| format!("{{{}}}", param.name))
        .collect();

    match path_params.is_empty() {
        true => format!("/api/query/{base_path}"),
        false => {
            let joined_params = path_params.join("/");
            format!("/api/query/{base_path}/{joined_params}")
        },
    }
}

fn convert_camel_to_kebab(camel_case: &str) -> String {
    camel_case
        .chars()
        .enumerate()
        .fold(String::new(), |mut acc, (i, ch)| {
            if ch.is_uppercase() && i > 0 {
                acc.push('-');
            }
            acc.push(ch.to_lowercase().next().unwrap_or(ch));
            acc
        })
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_map_helix_type_to_rust() {
        assert_eq!(map_helix_type_to_rust("String"), "String");
        assert_eq!(map_helix_type_to_rust("I32"), "i32");
        assert_eq!(map_helix_type_to_rust("I64"), "i64");
        assert_eq!(map_helix_type_to_rust("F64"), "f64");
        assert_eq!(map_helix_type_to_rust("ID"), "String");
        assert_eq!(map_helix_type_to_rust("[F64]"), "Vec<f64>");
        assert_eq!(map_helix_type_to_rust("CustomType"), "CustomType");
    }

    #[test]
    fn test_convert_camel_to_kebab() {
        assert_eq!(convert_camel_to_kebab("getUserById"), "get-user-by-id");
        assert_eq!(convert_camel_to_kebab("createUser"), "create-user");
        assert_eq!(convert_camel_to_kebab("user"), "user");
        assert_eq!(
            convert_camel_to_kebab("getAllUsersFromDB"),
            "get-all-users-from-d-b"
        );
        assert_eq!(convert_camel_to_kebab(""), "");
    }

    #[test]
    fn test_determine_endpoint_info() {
        let params = vec![QueryParameter::new(
            "user_id".to_string(),
            "String".to_string(),
        )];

        let (method, path) = determine_endpoint_info("createUser", &params);
        assert_eq!(method, "POST");
        assert_eq!(path, "/api/query/create-user/{user_id}");

        let (method, _path) = determine_endpoint_info("updateUser", &params);
        assert_eq!(method, "PUT");

        let (method, _path) = determine_endpoint_info("deleteUser", &params);
        assert_eq!(method, "DELETE");

        let (method, _path) = determine_endpoint_info("getUser", &params);
        assert_eq!(method, "GET");
    }

    #[test]
    fn test_generate_endpoint_path_with_id_params() {
        let params = vec![
            QueryParameter::new(
                "user_id".to_string(),
                "String".to_string(),
            ),
            QueryParameter::new(
                "post_id".to_string(),
                "String".to_string(),
            ),
        ];

        let path = generate_endpoint_path("getUserPosts", &params);
        assert_eq!(path, "/api/query/get-user-posts/{user_id}/{post_id}");
    }

    #[test]
    fn test_generate_endpoint_path_without_id_params() {
        let params = vec![
            QueryParameter::new(
                "name".to_string(),
                "String".to_string(),
            ),
            QueryParameter::new(
                "age".to_string(),
                "i32".to_string(),
            ),
        ];

        let path = generate_endpoint_path("getAllUsers", &params);
        assert_eq!(path, "/api/query/get-all-users");
    }

    #[test]
    fn test_generate_endpoint_path_with_id_param() {
        let params = vec![QueryParameter::new(
            "id".to_string(),
            "String".to_string(),
        )];

        let path = generate_endpoint_path("getUser", &params);
        assert_eq!(path, "/api/query/get-user/{id}");
    }

    #[test]
    fn test_parse_parameters_empty() {
        let result = QueryParameter::parse_multiple("");
        assert!(result.is_empty());

        let result = QueryParameter::parse_multiple("   ");
        assert!(result.is_empty());
    }

    #[test]
    fn test_parse_parameters_single() {
        let result = QueryParameter::parse_multiple("name: String");
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "name");
        assert_eq!(result[0].param_type, "String");
    }

    #[test]
    fn test_parse_parameters_multiple() {
        let result = QueryParameter::parse_multiple("user_id: ID, name: String, age: I32");
        assert_eq!(result.len(), 3);

        assert_eq!(result[0].name, "user_id");
        assert_eq!(result[0].param_type, "String");

        assert_eq!(result[1].name, "name");
        assert_eq!(result[1].param_type, "String");

        assert_eq!(result[2].name, "age");
        assert_eq!(result[2].param_type, "i32");
    }

    #[test]
    fn test_parse_query_line_valid() {
        let line = "QUERY getUserById (user_id: ID) => User";
        let result = QueryDefinition::from_line(line);

        assert!(result.is_some());
        let query = result.unwrap();
        assert_eq!(query.name, "getUserById");
        assert_eq!(query.parameters.len(), 1);
        assert_eq!(query.parameters[0].name, "user_id");
        assert_eq!(query.parameters[0].param_type, "String");
        assert_eq!(query.http_method, "GET");
        assert_eq!(query.endpoint_path, "/api/query/get-user-by-id/{user_id}");
    }

    #[test]
    fn test_parse_query_line_no_params() {
        let line = "QUERY getAllUsers () => [User]";
        let result = QueryDefinition::from_line(line);

        assert!(result.is_some());
        let query = result.unwrap();
        assert_eq!(query.name, "getAllUsers");
        assert!(query.parameters.is_empty());
        assert_eq!(query.http_method, "GET");
        assert_eq!(query.endpoint_path, "/api/query/get-all-users");
    }

    #[test]
    fn test_parse_query_line_invalid() {
        let line = "INVALID LINE";
        let result = QueryDefinition::from_line(line);
        assert!(result.is_none());

        let line = "QUERY incomplete";
        let result = QueryDefinition::from_line(line);
        assert!(result.is_none());
    }

    #[test]
    fn test_parse_queries_file_content() {
        let content = r#"
            // Some comment
            QUERY getUserById (user_id: ID) => User
            QUERY createUser (name: String, age: I32) => User
            // Another comment
            QUERY deleteUser (user_id: ID) => Boolean
        "#;

        let mut queries = Vec::new();
        for line in content.lines() {
            let line = line.trim();
            if line.starts_with("QUERY ") {
                if let Some(query_def) = QueryDefinition::from_line(line) {
                    queries.push(query_def);
                }
            }
        }

        assert_eq!(queries.len(), 3);
        assert_eq!(queries[0].name, "getUserById");
        assert_eq!(queries[0].http_method, "GET");
        assert_eq!(queries[1].name, "createUser");
        assert_eq!(queries[1].http_method, "POST");
        assert_eq!(queries[2].name, "deleteUser");
        assert_eq!(queries[2].http_method, "DELETE");
    }
}
