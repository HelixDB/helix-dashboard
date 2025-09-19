//! Web utility functions for response formatting

use serde_json::Value;
use crate::core::query_parser::{ApiEndpointInfo, QueryParameter};
use crate::web::types::IntrospectQuery;

/// Determine HTTP method based on query name patterns
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

/// Sort JSON object keys for consistent API response formatting
/// 
/// Orders keys as: numeric keys (sorted numerically), "id" key, then other keys.
/// Recursively processes nested objects and arrays.
pub fn sort_json_object(value: Value) -> Value {
    match value {
        Value::Object(map) => {
            let (numeric, non_numeric): (Vec<_>, Vec<_>) = map
                .into_iter()
                .map(|(key, val)| (key, sort_json_object(val)))
                .partition(|(key, _)| key.chars().all(|c| c.is_ascii_digit()));

            let (id_keys, other_keys): (Vec<_>, Vec<_>) =
                non_numeric.into_iter().partition(|(key, _)| key == "id");

            let mut sorted_numeric = numeric;
            sorted_numeric.sort_by(|(a, _), (b, _)| {
                let a_num = a.parse::<u64>().unwrap_or(0);
                let b_num = b.parse::<u64>().unwrap_or(0);
                a_num.cmp(&b_num)
            });

            [sorted_numeric, id_keys, other_keys]
                .into_iter()
                .flatten()
                .collect::<serde_json::Map<_, _>>()
                .into()
        }
        Value::Array(arr) => {
            Value::Array(arr.into_iter().map(sort_json_object).collect())
        }
        other => other,
    }
}

/// Convert IntrospectQuery to ApiEndpointInfo
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


#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

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
    fn test_sort_json_object_basic() {
        let input = json!({
            "name": "John",
            "id": "123",
            "2": "second",
            "1": "first"
        });

        let result = sort_json_object(input);
        let Value::Object(map) = result else {
            panic!("Expected object");
        };
        
        let keys: Vec<_> = map.keys().collect();
        assert_eq!(keys, vec!["1", "2", "id", "name"]);
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
        let Value::Object(map) = result else {
            panic!("Expected object");
        };
        
        let Some(Value::Object(nested)) = map.get("data") else {
            panic!("Expected nested object");
        };
        
        let keys: Vec<_> = nested.keys().collect();
        assert_eq!(keys, vec!["1", "3", "name"]);
    }

    #[test]
    fn test_sort_json_object_array() {
        let input = json!([
            {"name": "B", "1": "first"},
            {"name": "A", "2": "second"}
        ]);

        let result = sort_json_object(input);
        let Value::Array(arr) = result else {
            panic!("Expected array");
        };
        
        assert_eq!(arr.len(), 2);
        for item in arr {
            let Value::Object(obj) = item else { continue; };
            let keys: Vec<_> = obj.keys().collect();
            if keys.iter().any(|k| *k == "1") {
                assert_eq!(keys, vec!["1", "name"]);
            } else {
                assert_eq!(keys, vec!["2", "name"]);
            }
        }
    }

    // Type conversion tests using ToJson trait directly
    #[test]
    fn test_typed_conversion_string() {
        let result = "hello".to_json(&HelixType::String).unwrap();
        assert_eq!(result, json!("hello"));

        let result = "123".to_json(&HelixType::ID).unwrap();
        assert_eq!(result, json!("123"));
    }

    #[test]
    fn test_typed_conversion_integers() {
        let result = "42".to_json(&HelixType::I32).unwrap();
        assert_eq!(result, json!(42));

        let result = "invalid".to_json(&HelixType::I32);
        assert!(result.is_err());

        let result = "123".to_json(&HelixType::I64).unwrap();
        assert_eq!(result, json!(123i64));
    }

    #[test]
    fn test_typed_conversion_unsigned() {
        let result = "42".to_json(&HelixType::U32).unwrap();
        assert_eq!(result, json!(42u32));

        let result = "invalid".to_json(&HelixType::U32);
        assert!(result.is_err());

        let result = "123".to_json(&HelixType::U64).unwrap();
        assert_eq!(result, json!(123u64));
    }

    #[test]
    fn test_typed_conversion_float() {
        let result = "3.14".to_json(&HelixType::F64).unwrap();
        if let Value::Number(num) = result {
            assert_eq!(num.as_f64(), Some(3.14));
        } else {
            panic!("Expected number");
        }

        let result = "invalid".to_json(&HelixType::F64);
        assert!(result.is_err());
    }

    #[test]
    fn test_typed_conversion_array_f64() {
        let array_type = HelixType::Array(Box::new(HelixType::F64));
        let result = "[1.0, 2.0, 3.0]".to_json(&array_type).unwrap();
        if let Value::Array(arr) = result {
            assert_eq!(arr.len(), 3);
            assert_eq!(arr[0].as_f64(), Some(1.0));
            assert_eq!(arr[1].as_f64(), Some(2.0));
            assert_eq!(arr[2].as_f64(), Some(3.0));
        } else {
            panic!("Expected array");
        }

        let result = "1.0, 2.0, 3.0".to_json(&array_type).unwrap();
        if let Value::Array(arr) = result {
            assert_eq!(arr.len(), 3);
        } else {
            panic!("Expected array");
        }

        let result = "invalid".to_json(&array_type);
        assert!(result.is_err());
    }

    #[test]
    fn test_typed_conversion_unknown() {
        let result = "UnknownType".parse::<HelixType>();
        assert!(result.is_err()); // Unknown types fail to parse
    }

}