//! Utility functions used throughout the application

use serde_json::{Number, Value, json};
use reqwest::Client as HttpClient;
use crate::{schema_parser, MAX_LIMIT};

/// Create an empty schema structure
pub fn create_empty_schema() -> schema_parser::SchemaInfo {
    schema_parser::SchemaInfo {
        nodes: vec![],
        edges: vec![],
        vectors: vec![],
    }
}

/// Create default error data structure
pub fn create_default_error_data() -> serde_json::Value {
    json!({
        "nodes": [],
        "edges": [],
        "vectors": []
    })
}

/// Create error data structure for node connections
pub fn create_node_connections_error_data() -> serde_json::Value {
    json!({
        "connected_nodes": {"values": []},
        "incoming_edges": {"values": []},
        "outgoing_edges": {"values": []}
    })
}

/// Make HTTP request with optional authentication
pub async fn make_http_request_with_auth(
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

/// Validate limit parameter against maximum allowed
pub fn validate_limit(limit: Option<u32>) -> Option<u32> {
    limit.filter(|&l| l <= MAX_LIMIT)
}

/// Convert string value to appropriate JSON type based on parameter type
pub fn convert_string_to_type(value: &str, param_type: &str) -> serde_json::Value {
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

/// Parse F64 array from string representation
pub fn parse_f64_array(value: &str) -> serde_json::Value {
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

/// Sort JSON object with numeric keys first, then 'id', then others
pub fn sort_json_object(value: Value) -> Value {
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

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