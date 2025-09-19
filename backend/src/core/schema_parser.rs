use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NodeType {
    pub name: String,
    #[serde(default = "default_node_type")]
    pub node_type: String,
    pub properties: HashMap<String, String>,
}

impl NodeType {
    /// Parse a node definition from schema lines
    pub fn parse_from_lines(lines: &[&str], index: &mut usize) -> anyhow::Result<Option<Self>> {
        let line = lines[*index].trim();

        let node_type = if line.starts_with("N::") { "N" } else { "V" };
        let name_part = line
            .strip_prefix("N::")
            .or_else(|| line.strip_prefix("V::"))
            .ok_or_else(|| anyhow::anyhow!("Invalid node definition"))?;

        let name = name_part.trim_end_matches(" {").trim();
        let mut properties = HashMap::new();

        *index += 1;

        while *index < lines.len() {
            let prop_line = lines[*index].trim();

            if prop_line == "}" {
                *index += 1;
                break;
            }

            if prop_line.is_empty() || prop_line.starts_with("//") {
                *index += 1;
                continue;
            }

            if let Some((prop_name, prop_type)) = parse_property_line(prop_line) {
                properties.insert(prop_name, prop_type);
            }

            *index += 1;
        }

        Ok(Some(Self {
            name: name.to_string(),
            node_type: node_type.to_string(),
            properties,
        }))
    }
}

fn default_node_type() -> String {
    "N".to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EdgeType {
    pub name: String,
    #[serde(alias = "from")]
    pub from_node: String,
    #[serde(alias = "to")]
    pub to_node: String,
    pub properties: HashMap<String, String>,
}

impl EdgeType {
    /// Parse an edge definition from schema lines
    pub fn parse_from_lines(lines: &[&str], index: &mut usize) -> anyhow::Result<Option<Self>> {
        let line = lines[*index].trim();

        let name = line
            .strip_prefix("E::")
            .ok_or_else(|| anyhow::anyhow!("Invalid edge definition"))?
            .trim_end_matches(" {")
            .trim();

        let mut from_node = String::new();
        let mut to_node = String::new();
        let mut properties = HashMap::new();
        let mut in_properties_section = false;

        *index += 1;

        while *index < lines.len() {
            let edge_line = lines[*index].trim();

            if edge_line == "}" {
                *index += 1;
                break;
            }

            if edge_line.is_empty() || edge_line.starts_with("//") {
                *index += 1;
                continue;
            }

            match edge_line {
                l if l.starts_with("From:") => {
                    from_node = l
                        .strip_prefix("From:")
                        .unwrap_or("")
                        .trim()
                        .trim_end_matches(",")
                        .to_string();
                }
                l if l.starts_with("To:") => {
                    to_node = l
                        .strip_prefix("To:")
                        .unwrap_or("")
                        .trim()
                        .trim_end_matches(",")
                        .to_string();
                }
                "Properties: {" => in_properties_section = true,
                "}" if in_properties_section => in_properties_section = false,
                l if in_properties_section => {
                    if let Some((prop_name, prop_type)) = parse_property_line(l) {
                        properties.insert(prop_name, prop_type);
                    }
                }
                _ => {}
            }

            *index += 1;
        }

        Ok(Some(Self {
            name: name.to_string(),
            from_node,
            to_node,
            properties,
        }))
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VectorType {
    pub name: String,
    #[serde(default = "default_vector_type")]
    pub vector_type: String,
    pub properties: HashMap<String, String>,
}

impl VectorType {
    /// Parse a vector definition from schema lines
    pub fn parse_from_lines(lines: &[&str], index: &mut usize) -> anyhow::Result<Option<Self>> {
        let line = lines[*index].trim();

        let vector_type = if line.starts_with("V::") { "V" } else { "N" };
        let name_part = line
            .strip_prefix("V::")
            .or_else(|| line.strip_prefix("N::"))
            .ok_or_else(|| anyhow::anyhow!("Invalid vector definition"))?;

        let name = name_part.trim_end_matches(" {").trim();
        let mut properties = HashMap::new();

        *index += 1;

        while *index < lines.len() {
            let prop_line = lines[*index].trim();

            if prop_line == "}" {
                *index += 1;
                break;
            }

            if prop_line.is_empty() || prop_line.starts_with("//") {
                *index += 1;
                continue;
            }

            if let Some((prop_name, prop_type)) = parse_property_line(prop_line) {
                properties.insert(prop_name, prop_type);
            }

            *index += 1;
        }

        Ok(Some(Self {
            name: name.to_string(),
            vector_type: vector_type.to_string(),
            properties,
        }))
    }
}

fn default_vector_type() -> String {
    "V".to_string()
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SchemaInfo {
    pub nodes: Vec<NodeType>,
    pub edges: Vec<EdgeType>,
    pub vectors: Vec<VectorType>,
}

impl SchemaInfo {
    /// Create an empty schema
    pub fn new() -> Self {
        Self {
            nodes: vec![],
            edges: vec![],
            vectors: vec![],
        }
    }

    /// Parse schema from file
    pub fn from_file(file_path: &str) -> anyhow::Result<Self> {
        let content = fs::read_to_string(file_path)?;
        Self::from_content(&content)
    }

    /// Parse schema from content string
    pub fn from_content(content: &str) -> anyhow::Result<Self> {
        let mut nodes = Vec::new();
        let mut edges = Vec::new();
        let mut vectors = Vec::new();

        let lines: Vec<&str> = content.lines().collect();
        let mut i = 0;

        while i < lines.len() {
            let line = lines[i].trim();

            if line.is_empty() || line.starts_with("//") {
                i += 1;
                continue;
            }

            match line {
                l if l.starts_with("N::") => {
                    if let Some(node) = NodeType::parse_from_lines(&lines, &mut i)? {
                        nodes.push(node);
                    }
                }
                l if l.starts_with("V::") => {
                    if let Some(vector) = VectorType::parse_from_lines(&lines, &mut i)? {
                        vectors.push(vector);
                    }
                }
                l if l.starts_with("E::") => {
                    if let Some(edge) = EdgeType::parse_from_lines(&lines, &mut i)? {
                        edges.push(edge);
                    }
                }
                _ => i += 1,
            }
        }

        Ok(Self {
            nodes,
            edges,
            vectors,
        })
    }
}

impl Default for SchemaInfo {
    fn default() -> Self {
        Self::new()
    }
}

fn parse_property_line(line: &str) -> Option<(String, String)> {
    let clean_line = line.trim().trim_end_matches(",");

    clean_line.find(':').map(|colon_pos| {
        let prop_name = clean_line[..colon_pos].trim();
        let prop_type = clean_line[colon_pos + 1..].trim();

        let normalized_type = match prop_type.starts_with('[') && prop_type.ends_with(']') {
            true => format!("Array<{}>", &prop_type[1..prop_type.len() - 1]),
            false => prop_type.to_string(),
        };

        (prop_name.to_string(), normalized_type)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_property_line_basic() {
        let result = parse_property_line("name: String");
        assert_eq!(result, Some(("name".to_string(), "String".to_string())));
    }

    #[test]
    fn test_parse_property_line_with_comma() {
        let result = parse_property_line("age: I32,");
        assert_eq!(result, Some(("age".to_string(), "I32".to_string())));
    }

    #[test]
    fn test_parse_property_line_array_type() {
        let result = parse_property_line("scores: [F64]");
        assert_eq!(
            result,
            Some(("scores".to_string(), "Array<F64>".to_string()))
        );
    }

    #[test]
    fn test_parse_property_line_invalid() {
        let result = parse_property_line("invalid line");
        assert_eq!(result, None);
    }

    #[test]
    fn test_parse_property_line_empty() {
        let result = parse_property_line("");
        assert_eq!(result, None);
    }

    #[test]
    fn test_default_node_type() {
        assert_eq!(default_node_type(), "N");
    }

    #[test]
    fn test_default_vector_type() {
        assert_eq!(default_vector_type(), "V");
    }

    #[test]
    fn test_parse_schema_content_empty() {
        let content = "";
        let result = SchemaInfo::from_content(content).unwrap();
        assert!(result.nodes.is_empty());
        assert!(result.edges.is_empty());
        assert!(result.vectors.is_empty());
    }

    #[test]
    fn test_parse_schema_content_with_comments() {
        let content = r#"
            // This is a comment
            // Another comment
        "#;
        let result = SchemaInfo::from_content(content).unwrap();
        assert!(result.nodes.is_empty());
        assert!(result.edges.is_empty());
        assert!(result.vectors.is_empty());
    }

    #[test]
    fn test_parse_schema_content_node() {
        let content = r#"
            N::User {
                name: String,
                age: I32
            }
        "#;
        let result = SchemaInfo::from_content(content).unwrap();
        assert_eq!(result.nodes.len(), 1);

        let node = &result.nodes[0];
        assert_eq!(node.name, "User");
        assert_eq!(node.node_type, "N");
        assert_eq!(node.properties.get("name"), Some(&"String".to_string()));
        assert_eq!(node.properties.get("age"), Some(&"I32".to_string()));
    }

    #[test]
    fn test_parse_schema_content_vector() {
        let content = r#"
            V::Embedding {
                vector: [F64],
                dimension: I32
            }
        "#;
        let result = SchemaInfo::from_content(content).unwrap();
        assert_eq!(result.vectors.len(), 1);

        let vector = &result.vectors[0];
        assert_eq!(vector.name, "Embedding");
        assert_eq!(vector.vector_type, "V");
        assert_eq!(
            vector.properties.get("vector"),
            Some(&"Array<F64>".to_string())
        );
        assert_eq!(vector.properties.get("dimension"), Some(&"I32".to_string()));
    }

    #[test]
    fn test_parse_schema_content_edge() {
        let content = r#"
            E::Follows {
                From: User,
                To: User,
                Properties: {
                    since: String,
                    weight: F64
                }
            }
        "#;
        let result = SchemaInfo::from_content(content).unwrap();
        assert_eq!(result.edges.len(), 1);

        let edge = &result.edges[0];
        assert_eq!(edge.name, "Follows");
        assert_eq!(edge.from_node, "User");
        assert_eq!(edge.to_node, "User");
        assert_eq!(edge.properties.get("since"), Some(&"String".to_string()));
        assert_eq!(edge.properties.get("weight"), Some(&"F64".to_string()));
    }

    #[test]
    fn test_parse_schema_content_mixed() {
        let content = r#"
            N::User {
                name: String
            }
            
            E::Likes {
                From: User,
                To: Post
            }
            
            V::TextEmbedding {
                content: String
            }
        "#;
        let result = SchemaInfo::from_content(content).unwrap();
        assert_eq!(result.nodes.len(), 1);
        assert_eq!(result.edges.len(), 1);
        assert_eq!(result.vectors.len(), 1);
    }
}
