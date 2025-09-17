//! Request and response types for web handlers

use serde::Deserialize;

#[derive(Deserialize)]
pub struct NodesEdgesQuery {
    pub limit: Option<u32>,
    pub node_label: Option<String>,
}

#[derive(Deserialize)]
pub struct NodeDetailsQuery {
    pub id: String,
}

#[derive(Deserialize)]
pub struct NodesByLabelQuery {
    pub label: String,
    pub limit: Option<u32>,
}

#[derive(Deserialize)]
pub struct NodeConnectionsQuery {
    pub node_id: String,
}

#[derive(Deserialize)]
pub struct IntrospectQuery {
    pub name: String,
    pub parameters: serde_json::Value,
}

#[derive(Deserialize)]
pub struct CloudIntrospectData {
    pub schema: crate::core::schema_parser::SchemaInfo,
    pub queries: Vec<IntrospectQuery>,
}
