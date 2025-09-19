//! Error response utilities for web handlers

use serde_json::{json, Value};

pub struct ErrorData;

impl ErrorData {
    pub fn empty() -> Value {
        json!({
            "nodes": [],
            "edges": [],
            "vectors": []
        })
    }

    pub fn empty_connections() -> Value {
        json!({
            "connected_nodes": {"values": []},
            "incoming_edges": {"values": []},
            "outgoing_edges": {"values": []}
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_data() {
        let data = ErrorData::empty();
        assert_eq!(data, json!({
            "nodes": [],
            "edges": [],
            "vectors": []
        }));
    }

    #[test]
    fn test_empty_connections_data() {
        let data = ErrorData::empty_connections();
        assert_eq!(data, json!({
            "connected_nodes": {"values": []},
            "incoming_edges": {"values": []},
            "outgoing_edges": {"values": []}
        }));
    }
}