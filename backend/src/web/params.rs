//! Request and response types for web handlers

use serde::{Deserialize, Deserializer, de::Error};
use serde_json::{Map, Value};
use std::collections::HashMap;

use crate::core::helix_types::{HelixType, ToJson};
use crate::{MAX_LIMIT, MAX_SEARCH_LIMIT_CHARS, VALID_SEARCH_CHARS};

/// # Example
/// ```
/// use backend::web::params::QueryParams;
/// use serde_json::json;
///
/// // From URL query: ?limit=10&q=search&custom_param=value
/// let query_data = json!({"limit": 10, "q": "search", "custom_param": "value"});
/// let params: QueryParams = serde_json::from_value(query_data).unwrap();
/// let endpoint = params.to_url("api/search");
/// // Result: "api/search?limit=10&q=search&custom_param=value"
/// ```
#[derive(Deserialize, Clone, Default)]
pub struct QueryParams {
    /// Pagination limit - automatically validated against MAX_LIMIT
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default, deserialize_with = "validate_limit")]
    pub limit: Option<u32>,

    /// Search query - automatically validated for length and content
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(default, deserialize_with = "validate_query")]
    pub q: Option<String>,

    /// Catch-all for any other parameters
    #[serde(flatten)]
    #[serde(skip_serializing_if = "HashMap::is_empty")]
    pub params: HashMap<String, String>,
}

/// Validate limit parameter during deserialization
fn validate_limit<'de, D>(deserializer: D) -> Result<Option<u32>, D::Error>
where
    D: Deserializer<'de>,
{
    let limit: Option<u32> = Option::deserialize(deserializer)?;

    if let Some(limit_value) = limit {
        match limit_value {
            0 => return Err(Error::custom("Limit must be greater than 0")),
            l if l > MAX_LIMIT => {
                return Err(Error::custom(format!(
                    "Limit {l} exceeds maximum allowed value of {MAX_LIMIT}"
                )));
            }
            _ => {}
        }
    }

    Ok(limit)
}

/// Validate query parameter during deserialization
fn validate_query<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: Deserializer<'de>,
{
    let query: Option<String> = Option::deserialize(deserializer)?;

    if let Some(ref q) = query {
        let validation_result = Some(q)
            .filter(|q| q.len() <= MAX_SEARCH_LIMIT_CHARS)
            .ok_or_else(|| Error::custom(format!(
                "Query length {} exceeds maximum allowed length of {}", 
                q.len(),
                MAX_SEARCH_LIMIT_CHARS
            )))
            .and_then(|q| {
                q.chars()
                    .all(|c| VALID_SEARCH_CHARS.contains(c))
                    .then_some(q)
                    .ok_or_else(|| Error::custom(
                        "Query contains invalid characters. Only letters, numbers, spaces, dots, underscores, and hyphens are allowed"
                    ))
            });

        validation_result?;
    }

    Ok(query)
}

impl QueryParams {
    /// Build a complete URL with query parameters appended
    ///
    /// # Example
    /// ```
    /// let params = QueryParams { limit: Some(10), q: Some("search".to_string()), ..Default::default() };
    /// let url = params.to_url("api/search");
    /// // Result: "api/search?limit=10&q=search"
    /// ```
    pub fn to_url(&self, base_url: &str) -> String {
        let query_params: Vec<String> = []
            .into_iter()
            .chain(self.limit.map(|limit| format!("limit={limit}")))
            .chain(self.q.as_ref().map(|q| format!("q={q}")))
            .chain(
                self.params
                    .iter()
                    .map(|(key, value)| format!("{key}={value}")),
            )
            .collect();

        match query_params.is_empty() {
            true => base_url.to_string(),
            false => format!("{}?{}", base_url, query_params.join("&")),
        }
    }

    /// Merge query parameters with request body, applying type conversions
    ///
    /// # Example
    /// ```
    /// let query_params = [("limit", "10"), ("filter", "active")].into_iter()
    ///     .map(|(k, v)| (k.to_string(), v.to_string())).collect();
    /// let body = Some(json!({"user_id": "123"}));
    /// let param_types = [("limit", "U32")].into_iter()
    ///     .map(|(k, v)| (k.to_string(), v.to_string())).collect();
    /// let result = QueryParams::merge_parameters(&query_params, body.as_ref(), &param_types);
    /// ```
    pub fn merge_parameters(
        query_params: &HashMap<String, String>,
        body: Option<&Value>,
        param_types: &HashMap<String, String>,
    ) -> Value {
        // Start with body parameters
        let mut params = match body {
            Some(Value::Object(map)) => map.clone(),
            Some(other) if !other.is_null() => {
                let mut map = Map::new();
                map.insert("body".to_string(), other.to_owned());
                map
            }
            _ => Map::new(),
        };

        // Add query parameters (only if not already present in body)
        let new_params: Vec<(String, Value)> = query_params
            .iter()
            .filter(|(key, _)| !params.contains_key(*key))
            .map(|(key, value)| {
                let converted_value = param_types
                    .get(key)
                    .and_then(|param_type| {
                        let helix_type = param_type.parse::<HelixType>().ok()?;
                        value.to_json(&helix_type).ok()
                    })
                    .unwrap_or_else(|| Value::String(value.to_string()));
                (key.to_string(), converted_value)
            })
            .collect();

        // Insert all new parameters
        for (key, value) in new_params {
            params.insert(key, value);
        }

        Value::Object(params)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_endpoint_building() {
        let mut params_map = HashMap::new();
        params_map.insert("user_id".to_string(), "123".to_string());
        params_map.insert("status".to_string(), "active".to_string());

        let params = QueryParams {
            limit: Some(50),
            q: Some("search".to_string()),
            params: params_map,
        };

        let endpoint = params.to_url("test-endpoint");
        assert!(endpoint.contains("test-endpoint?"));
        assert!(endpoint.contains("limit=50"));
        assert!(endpoint.contains("q=search"));
        assert!(endpoint.contains("user_id=123"));
        assert!(endpoint.contains("status=active"));
    }

    #[test]
    fn test_extra_params() {
        let mut params_map = HashMap::new();
        params_map.insert("custom_param".to_string(), "custom_value".to_string());
        params_map.insert("numeric_param".to_string(), "42".to_string());

        let params = QueryParams {
            limit: None,
            q: None,
            params: params_map,
        };

        let endpoint = params.to_url("test");
        assert!(endpoint.contains("custom_param=custom_value"));
        assert!(endpoint.contains("numeric_param=42"));
    }

    #[test]
    fn test_merge_parameters() {
        let mut param_types = HashMap::new();
        param_types.insert("limit".to_string(), "U32".to_string());
        param_types.insert("active".to_string(), "String".to_string());

        // Test with body and query params
        let mut query_params = HashMap::new();
        query_params.insert("limit".to_string(), "50".to_string());
        query_params.insert("filter".to_string(), "test".to_string());

        let body = Some(json!({
            "user_id": "123",
            "active": true
        }));

        let result = QueryParams::merge_parameters(&query_params, body.as_ref(), &param_types);

        if let Value::Object(map) = result {
            // Body parameters should be preserved
            assert_eq!(map.get("user_id"), Some(&json!("123")));
            assert_eq!(map.get("active"), Some(&json!(true)));

            // Query params should be added if not in body
            assert_eq!(map.get("limit"), Some(&json!(50u32))); // Converted to U32
            assert_eq!(map.get("filter"), Some(&json!("test")));
        } else {
            panic!("Expected object");
        }
    }

    #[test]
    fn test_merge_parameters_body_priority() {
        let param_types = HashMap::new();

        let mut query_params = HashMap::new();
        query_params.insert("name".to_string(), "from_query".to_string());

        let body = Some(json!({
            "name": "from_body"
        }));

        let result = QueryParams::merge_parameters(&query_params, body.as_ref(), &param_types);

        if let Value::Object(map) = result {
            // Body should take priority over query params
            assert_eq!(map.get("name"), Some(&json!("from_body")));
        } else {
            panic!("Expected object");
        }
    }

    #[test]
    fn test_merge_parameters_non_object_body() {
        let param_types = HashMap::new();
        let query_params = HashMap::new();

        // Test with non-object body
        let body = Some(json!("simple_string"));
        let result = QueryParams::merge_parameters(&query_params, body.as_ref(), &param_types);

        if let Value::Object(map) = result {
            assert_eq!(map.get("body"), Some(&json!("simple_string")));
        } else {
            panic!("Expected object");
        }
    }

    #[test]
    fn test_limit_validation() {
        // Valid limit
        let valid_json = json!({"limit": 100});
        let result: Result<QueryParams, _> = serde_json::from_value(valid_json);
        if let Err(e) = &result {
            println!("Validation error: {e}");
        }
        assert!(result.is_ok());

        // Limit too high
        let invalid_json = json!({"limit": 500});
        let result: Result<QueryParams, _> = serde_json::from_value(invalid_json);
        assert!(result.is_err());

        // Zero limit
        let zero_json = json!({"limit": 0});
        let result: Result<QueryParams, _> = serde_json::from_value(zero_json);
        assert!(result.is_err());
    }

    #[test]
    fn test_validation_failures_correctly_reject() {
        // Test that validation actually works - should fail
        let invalid_cases = vec![
            json!({"limit": 500}),                       // Exceeds MAX_LIMIT
            json!({"limit": 0}),                         // Zero not allowed
            json!({"q": "search'; DROP TABLE users--"}), // SQL injection
            json!({"q": "a".repeat(600)}),               // Too long
        ];

        for (i, case) in invalid_cases.iter().enumerate() {
            let result: Result<QueryParams, _> = serde_json::from_value(case.clone());
            assert!(
                result.is_err(),
                "Case {i} should have failed but didn't: {case:?}"
            );
        }

        // Ensure valid case still works
        let valid = json!({"limit": 100, "q": "normal search"});
        let result: Result<QueryParams, _> = serde_json::from_value(valid);
        assert!(result.is_ok(), "Valid case should succeed");
    }
}
