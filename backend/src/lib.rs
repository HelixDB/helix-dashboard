//! HelixDB Dashboard Backend Library
//!
//! This library provides the core functionality for the HelixDB dashboard backend,
//! including schema parsing, query handling, and web API endpoints.

use clap::{Parser, ValueEnum};
use helix_rs::{HelixDB, HelixDBClient};
use std::sync::Arc;

pub mod core;
pub mod web;

/// Application configuration and state
#[derive(Debug, Clone, ValueEnum)]
pub enum DataSource {
    #[value(
        name = "local-introspect",
        help = "Use local HelixDB introspect endpoint"
    )]
    LocalIntrospect,
    #[value(name = "local-file", help = "Read from local helixdb-cfg files")]
    LocalFile,
    #[value(name = "cloud", help = "Use cloud HelixDB introspect endpoint")]
    Cloud,
}

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
pub struct Args {
    #[arg(value_enum, default_value = "local-introspect")]
    pub source: DataSource,
    #[arg(value_name = "URL", required_if_eq("source", "cloud"))]
    pub cloud_url: Option<String>,
    #[arg(
        short,
        long,
        default_value = "6969",
        help = "Port for local HelixDB instance"
    )]
    pub port: u16,
}

#[derive(Clone)]
pub struct AppState {
    pub helix_db: Arc<HelixDB>,
    pub data_source: DataSource,
    pub helix_url: String,
    pub api_key: Option<String>,
}

impl AppState {
    /// Create a new AppState from command-line arguments
    pub fn new(args: Args) -> Self {
        let host =
            std::env::var("DOCKER_HOST_INTERNAL").unwrap_or_else(|_| "localhost".to_string());

        let helix_url = match args.source {
            DataSource::LocalIntrospect => {
                let url = format!("http://{}:{}", host, args.port);
                println!("Starting server in local-introspect mode");
                println!("Using local HelixDB introspect endpoint: {url}/introspect");
                url
            }
            DataSource::LocalFile => {
                println!("Starting server in local-file mode");
                println!("Reading from local helixdb-cfg files");
                format!("http://{}:{}", host, args.port)
            }
            DataSource::Cloud => {
                let url = args
                    .cloud_url
                    .clone()
                    .expect("Cloud URL is required for cloud mode");
                let has_api_key = std::env::var("HELIX_API_KEY")
                    .ok()
                    .filter(|key| !key.trim().is_empty())
                    .is_some();
                println!("Starting server in cloud mode");
                println!("Using cloud HelixDB endpoint: {url}/introspect");
                if has_api_key {
                    println!(
                        "Authentication: Using API key from HELIX_API_KEY environment variable"
                    );
                } else {
                    println!("Authentication: No API key found, connecting without authentication");
                }
                url
            }
        };

        let helix_db = Self::create_helix_db(&args, &host);

        Self {
            helix_db: helix_db.clone(),
            data_source: args.source.clone(),
            helix_url,
            api_key: std::env::var("HELIX_API_KEY").ok(),
        }
    }

    /// Initialize the HelixDB instance based on configuration
    fn create_helix_db(args: &Args, host: &str) -> Arc<HelixDB> {
        match args.source {
            DataSource::Cloud => {
                let cloud_api_url = args
                    .cloud_url
                    .as_ref()
                    .expect("Cloud URL is required for cloud mode");
                let api_key = std::env::var("HELIX_API_KEY")
                    .ok()
                    .filter(|key| !key.trim().is_empty());

                Arc::new(HelixDB::new(
                    Some(cloud_api_url.as_str()),
                    None,
                    api_key.as_deref(),
                ))
            }
            DataSource::LocalIntrospect | DataSource::LocalFile => Arc::new(HelixDB::new(
                Some(&format!("http://{host}")),
                Some(args.port),
                None,
            )),
        }
    }
}

/// Constants used throughout the application
pub const DEFAULT_PORT: u16 = 8080;
pub const MAX_LIMIT: u32 = 300;
pub const SCHEMA_FILE_PATH: &str = "helixdb-cfg/schema.hx";
pub const QUERIES_FILE_PATH: &str = "helixdb-cfg/queries.hx";
