//! Shared type definitions for the web module

use serde::Deserialize;
use serde_json::Value;
use crate::core::schema_parser::SchemaInfo;

/// Query information from HelixDB introspection
#[derive(Deserialize)]
pub struct IntrospectQuery {
    pub name: String,
    pub parameters: Value,
}

/// Response data structure from HelixDB cloud introspection endpoint
#[derive(Deserialize)]
pub struct CloudIntrospectData {
    pub schema: SchemaInfo,
    pub queries: Vec<IntrospectQuery>,
}
