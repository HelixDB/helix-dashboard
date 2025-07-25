use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NodeType {
    pub name: String,
    pub node_type: String,
    pub properties: HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EdgeType {
    pub name: String,
    pub from_node: String,
    pub to_node: String,
    pub properties: HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SchemaInfo {
    pub nodes: Vec<NodeType>,
    pub edges: Vec<EdgeType>,
}

pub fn parse_schema_file(file_path: &str) -> anyhow::Result<SchemaInfo> {
    let content = fs::read_to_string(file_path)?;
    parse_schema_content(&content)
}

pub fn parse_schema_content(content: &str) -> anyhow::Result<SchemaInfo> {
    let mut nodes = Vec::new();
    let mut edges = Vec::new();

    let lines: Vec<&str> = content.lines().collect();
    let mut i = 0;

    while i < lines.len() {
        let line = lines[i].trim();

        if line.is_empty() || line.starts_with("//") {
            i += 1;
            continue;
        }

        if line.starts_with("N::") || line.starts_with("V::") {
            if let Some(node) = parse_node_definition(&lines, &mut i)? {
                nodes.push(node);
            }
        } else if line.starts_with("E::") {
            if let Some(edge) = parse_edge_definition(&lines, &mut i)? {
                edges.push(edge);
            }
        } else {
            i += 1;
        }
    }

    Ok(SchemaInfo { nodes, edges })
}

fn parse_node_definition(lines: &[&str], index: &mut usize) -> anyhow::Result<Option<NodeType>> {
    let line = lines[*index].trim();

    let node_type = if line.starts_with("N::") { "N" } else { "V" };
    let name_part = line
        .strip_prefix("N::")
        .or_else(|| line.strip_prefix("V::"))
        .ok_or_else(|| anyhow::anyhow!("Invalid node definition"))?;

    let name = name_part.trim_end_matches(" {").trim().to_string();
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

    Ok(Some(NodeType {
        name,
        node_type: node_type.to_string(),
        properties,
    }))
}

fn parse_edge_definition(lines: &[&str], index: &mut usize) -> anyhow::Result<Option<EdgeType>> {
    let line = lines[*index].trim();

    let name = line
        .strip_prefix("E::")
        .ok_or_else(|| anyhow::anyhow!("Invalid edge definition"))?
        .trim_end_matches(" {")
        .trim()
        .to_string();

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

        if edge_line.starts_with("From:") {
            from_node = edge_line
                .strip_prefix("From:")
                .unwrap_or("")
                .trim()
                .trim_end_matches(",")
                .to_string();
        } else if edge_line.starts_with("To:") {
            to_node = edge_line
                .strip_prefix("To:")
                .unwrap_or("")
                .trim()
                .trim_end_matches(",")
                .to_string();
        } else if edge_line.starts_with("Properties: {") {
            in_properties_section = true;
        } else if in_properties_section && edge_line == "}" {
            in_properties_section = false;
        } else if in_properties_section {
            if let Some((prop_name, prop_type)) = parse_property_line(edge_line) {
                properties.insert(prop_name, prop_type);
            }
        }

        *index += 1;
    }

    Ok(Some(EdgeType {
        name,
        from_node,
        to_node,
        properties,
    }))
}

fn parse_property_line(line: &str) -> Option<(String, String)> {
    let clean_line = line.trim().trim_end_matches(",");

    if let Some(colon_pos) = clean_line.find(':') {
        let prop_name = clean_line[..colon_pos].trim().to_string();
        let prop_type = clean_line[colon_pos + 1..].trim().to_string();

        let normalized_type = if prop_type.starts_with('[') && prop_type.ends_with(']') {
            format!("Array<{}>", &prop_type[1..prop_type.len() - 1])
        } else {
            prop_type
        };

        return Some((prop_name, normalized_type));
    }

    None
}
