//! Helix type system with generic conversion traits

use serde_json::{Number, Value, from_str};
use std::fmt::{Display, Formatter, Result as FmtResult};
use std::str::FromStr;
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum HelixType {
    String,
    I32,
    I64,
    U32,
    U64,
    U128,
    F64,
    ID,
    Array(Box<HelixType>),
}

impl Display for HelixType {
    fn fmt(&self, f: &mut Formatter<'_>) -> FmtResult {
        match self {
            HelixType::String => write!(f, "String"),
            HelixType::I32 => write!(f, "I32"),
            HelixType::I64 => write!(f, "I64"),
            HelixType::U32 => write!(f, "U32"),
            HelixType::U64 => write!(f, "U64"),
            HelixType::U128 => write!(f, "U128"),
            HelixType::F64 => write!(f, "F64"),
            HelixType::ID => write!(f, "ID"),
            HelixType::Array(inner) => write!(f, "[{inner}]"),
        }
    }
}

impl FromStr for HelixType {
    type Err = HelixTypeError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "String" => Ok(HelixType::String),
            "I32" => Ok(HelixType::I32),
            "I64" => Ok(HelixType::I64),
            "U32" => Ok(HelixType::U32),
            "U64" => Ok(HelixType::U64),
            "U128" => Ok(HelixType::U128),
            "F64" => Ok(HelixType::F64),
            "ID" => Ok(HelixType::ID),
            s if s.starts_with('[') && s.ends_with(']') => {
                let inner = &s[1..s.len() - 1];
                let inner_type = HelixType::from_str(inner)?;
                Ok(HelixType::Array(Box::new(inner_type)))
            }
            // Support legacy Array(T) syntax
            s if s.starts_with("Array(") && s.ends_with(')') => {
                let inner = &s[6..s.len() - 1];
                let inner_type = HelixType::from_str(inner)?;
                Ok(HelixType::Array(Box::new(inner_type)))
            }
            _ => Err(HelixTypeError::ParseType(format!("Unknown type: {s}"))),
        }
    }
}

impl HelixType {
    pub fn to_rust_type(&self) -> String {
        match self {
            HelixType::String => "String".to_string(),
            HelixType::I32 => "i32".to_string(),
            HelixType::I64 => "i64".to_string(),
            HelixType::U32 => "u32".to_string(),
            HelixType::U64 => "u64".to_string(),
            HelixType::U128 => "u128".to_string(),
            HelixType::F64 => "f64".to_string(),
            HelixType::ID => "String".to_string(),
            HelixType::Array(inner) => format!("Vec<{}>", inner.to_rust_type()),
        }
    }
}

#[derive(Debug, Clone, Error)]
pub enum HelixTypeError {
    #[error("Parse error: {0}")]
    ParseType(String),

    #[error("Failed to convert '{value}' to {expected_type}: {error}")]
    Conversion {
        value: String,
        expected_type: HelixType,
        error: String,
    },
}

/// Trait for converting values to JSON based on Helix types.
/// This trait allows for extensible conversion implementations - while currently
/// only implemented for `str`, it can be extended to support other types like
/// `String`, `&[u8]`, or custom types in the future.
pub trait ToJson {
    fn to_json(&self, helix_type: &HelixType) -> Result<Value, HelixTypeError>;
}

impl ToJson for str {
    fn to_json(&self, helix_type: &HelixType) -> Result<Value, HelixTypeError> {
        match helix_type {
            HelixType::String | HelixType::ID => Ok(Value::String(self.to_string())),
            HelixType::I32 => self
                .parse::<i32>()
                .map(|n| Value::Number(Number::from(n)))
                .map_err(|e| HelixTypeError::Conversion {
                    value: self.to_string(),
                    expected_type: helix_type.clone(),
                    error: e.to_string(),
                }),
            HelixType::I64 => self
                .parse::<i64>()
                .map(|n| Value::Number(Number::from(n)))
                .map_err(|e| HelixTypeError::Conversion {
                    value: self.to_string(),
                    expected_type: helix_type.clone(),
                    error: e.to_string(),
                }),
            HelixType::U32 => self
                .parse::<u32>()
                .map(|n| Value::Number(Number::from(n)))
                .map_err(|e| HelixTypeError::Conversion {
                    value: self.to_string(),
                    expected_type: helix_type.clone(),
                    error: e.to_string(),
                }),
            HelixType::U64 => self
                .parse::<u64>()
                .map(|n| Value::Number(Number::from(n)))
                .map_err(|e| HelixTypeError::Conversion {
                    value: self.to_string(),
                    expected_type: helix_type.clone(),
                    error: e.to_string(),
                }),
            HelixType::U128 => self
                .parse::<u128>()
                .map_err(|e| HelixTypeError::Conversion {
                    value: self.to_string(),
                    expected_type: helix_type.clone(),
                    error: e.to_string(),
                })
                .and_then(|n| {
                    Number::from_f64(n as f64)
                        .map(Value::Number)
                        .ok_or_else(|| HelixTypeError::Conversion {
                            value: self.to_string(),
                            expected_type: helix_type.clone(),
                            error: "Number too large for JSON representation".to_string(),
                        })
                }),
            HelixType::F64 => self
                .parse::<f64>()
                .map_err(|e| HelixTypeError::Conversion {
                    value: self.to_string(),
                    expected_type: helix_type.clone(),
                    error: e.to_string(),
                })
                .and_then(|n| {
                    Number::from_f64(n).map(Value::Number).ok_or_else(|| {
                        HelixTypeError::Conversion {
                            value: self.to_string(),
                            expected_type: helix_type.clone(),
                            error: "Invalid float value for JSON".to_string(),
                        }
                    })
                }),
            HelixType::Array(inner_type) => match inner_type.as_ref() {
                HelixType::F64 => parse_f64_array(self).map_err(|e| HelixTypeError::Conversion {
                    value: self.to_string(),
                    expected_type: helix_type.clone(),
                    error: e,
                }),
                _ => Err(HelixTypeError::Conversion {
                    value: self.to_string(),
                    expected_type: helix_type.clone(),
                    error: "Array type not yet supported".to_string(),
                }),
            },
        }
    }
}

fn parse_f64_array(value: &str) -> Result<Value, String> {
    from_str::<Vec<f64>>(value)
        .or_else(|_| {
            value
                .split(',')
                .map(|s| s.trim().parse::<f64>())
                .collect::<Result<Vec<_>, _>>()
        })
        .map(|numbers| {
            Value::Array(
                numbers
                    .into_iter()
                    .filter_map(Number::from_f64)
                    .map(Value::Number)
                    .collect(),
            )
        })
        .map_err(|e| format!("Failed to parse array: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_helix_type_display() {
        assert_eq!(HelixType::String.to_string(), "String");
        assert_eq!(HelixType::I32.to_string(), "I32");
        assert_eq!(
            HelixType::Array(Box::new(HelixType::F64)).to_string(),
            "[F64]"
        );
    }

    #[test]
    fn test_helix_type_from_str() {
        assert_eq!("String".parse::<HelixType>().unwrap(), HelixType::String);
        assert_eq!("I32".parse::<HelixType>().unwrap(), HelixType::I32);
        assert_eq!(
            "[F64]".parse::<HelixType>().unwrap(),
            HelixType::Array(Box::new(HelixType::F64))
        );
        assert_eq!(
            "Array(F64)".parse::<HelixType>().unwrap(),
            HelixType::Array(Box::new(HelixType::F64))
        );
    }

    #[test]
    fn test_to_rust_type() {
        assert_eq!(HelixType::String.to_rust_type(), "String");
        assert_eq!(HelixType::I32.to_rust_type(), "i32");
        assert_eq!(
            HelixType::Array(Box::new(HelixType::F64)).to_rust_type(),
            "Vec<f64>"
        );
    }

    #[test]
    fn test_to_json_string() {
        let result = "hello".to_json(&HelixType::String).unwrap();
        assert_eq!(result, json!("hello"));

        let result = "123".to_json(&HelixType::ID).unwrap();
        assert_eq!(result, json!("123"));
    }

    #[test]
    fn test_to_json_numbers() {
        let result = "42".to_json(&HelixType::I32).unwrap();
        assert_eq!(result, json!(42));

        let result = "3.14".to_json(&HelixType::F64).unwrap();
        if let Value::Number(num) = result {
            assert_eq!(num.as_f64(), Some(3.14));
        } else {
            panic!("Expected number");
        }
    }

    #[test]
    fn test_to_json_array() {
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
    }

    #[test]
    fn test_conversion_errors() {
        let result = "invalid".to_json(&HelixType::I32);
        assert!(result.is_err());

        let err = result.unwrap_err();
        match err {
            HelixTypeError::Conversion {
                value,
                expected_type,
                ..
            } => {
                assert_eq!(value, "invalid");
                assert_eq!(expected_type, HelixType::I32);
            }
            _ => panic!("Expected conversion error"),
        }
    }
}
