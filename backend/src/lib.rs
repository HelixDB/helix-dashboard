//! HelixDB Dashboard Backend Library
//!
//! This library provides the core functionality for the HelixDB dashboard backend,
//! including schema parsing, query handling, and web API endpoints.

use clap::{Parser, ValueEnum};
use dotenv::dotenv;
use helix_rs::HelixDBClient;
use std::env;
use core::helix_client::BackendHelixClient;

pub mod core;
pub mod web;

/// Constants used throughout the application
pub const DEFAULT_BACKEND_PORT: u16 = 8080;
pub const DEFAULT_HOST: &str = "localhost";
pub const MAX_LIMIT: u32 = 300;
pub const SCHEMA_FILE_PATH: &str = "helixdb-cfg/schema.hx";
pub const QUERIES_FILE_PATH: &str = "helixdb-cfg/queries.hx";

/// Environment variable names
const ENV_API_KEY: &str = "HELIX_API_KEY";
const ENV_DOCKER_HOST: &str = "DOCKER_HOST_INTERNAL";
const ENV_BACKEND_PORT: &str = "BACKEND_PORT";

/// Application configuration and state
#[derive(Debug, Clone, ValueEnum)]
pub enum DataSource {
    #[value(
        name = "local-introspect",
        help = "Connect to local HelixDB instance via HTTP introspection endpoint (requires running HelixDB service)"
    )]
    LocalIntrospect,
    #[value(
        name = "local-file", 
        help = "Load configuration directly from helixdb-cfg directory (no HelixDB service required)"
    )]
    LocalFile,
    #[value(
        name = "cloud", 
        help = "Connect to remote HelixDB instance (requires URL and optional API key via HELIX_API_KEY)"
    )]
    Cloud,
}

#[derive(Parser, Debug)]
#[command(
    name = "helix-dashboard-backend",
    author = "HelixDB Team",
    version,
    about = "HelixDB Dashboard Backend Server",
    long_about = "A high-performance backend server for the HelixDB dashboard interface.\n\
                  Supports multiple data sources including local development instances,\n\
                  file-based configuration, and cloud deployments with authentication.\n\n\
                  Examples:\n  \
                    helix-dashboard-backend local-introspect\n  \
                    helix-dashboard-backend local-file\n  \
                    helix-dashboard-backend cloud https://api.helixdb.com",
    after_help = "Environment Variables:\n  \
                  HELIX_API_KEY        API key for cloud authentication\n  \
                  DOCKER_HOST_INTERNAL Docker host override (default: localhost)\n  \
                  BACKEND_PORT         Web server port (default: 8080)"
)]
pub struct Args {
    #[arg(
        value_enum, 
        default_value = "local-introspect",
        help = "Data source configuration mode"
    )]
    pub source: DataSource,
    
    #[arg(
        value_name = "URL", 
        required_if_eq("source", "cloud"),
        help = "HelixDB cloud endpoint URL (required for cloud mode)"
    )]
    pub cloud_url: Option<String>,
    
    #[arg(
        short = 'p',
        long = "port",
        default_value = "6969",
        value_name = "PORT",
        help = "Local HelixDB service port (used with local-introspect mode)"
    )]
    pub helix_port: u16,
}

#[derive(Clone)]
pub struct AppState {
    pub helix_client: BackendHelixClient,
    pub data_source: DataSource,
    pub api_key: Option<String>,
    pub backend_port: u16,  // Backend web server port  
}

impl AppState {
    /// Create a new AppState from command-line arguments
    pub fn new() -> Self {
        dotenv().ok();
        let args = Args::parse();
        let Args { source: data_source, cloud_url, helix_port } = args;
        
        let api_key = env::var(ENV_API_KEY).ok();
        let host = env::var(ENV_DOCKER_HOST).unwrap_or_else(|_| DEFAULT_HOST.to_string());
        let helix_url = match data_source {
            DataSource::LocalIntrospect => {
                let url = format!("http://{}:{}", host, helix_port);
                println!("Starting server in local-introspect mode");
                println!("Using local HelixDB introspect endpoint: {url}/introspect");
                url
            }
            DataSource::LocalFile => {
                println!("Starting server in local-file mode");
                println!("Reading from local helixdb-cfg files");
                format!("http://{}:{}", host, helix_port)
            }
            DataSource::Cloud => {
                let url = cloud_url
                    .clone()
                    .expect("Cloud URL is required for cloud mode");
                println!("Starting server in cloud mode");
                println!("Using cloud HelixDB endpoint: {url}/introspect");
                match api_key.as_ref() {
                    Some(_) => println!(
                        "Authentication: Using API key from HELIX_API_KEY environment variable"
                    ),
                    None => println!("Authentication: No API key found, connecting without authentication"),
                }
                url
            }
        };

        let helix_client = BackendHelixClient::new(
            Some(&helix_url),
            None,
            api_key.as_deref(),
        );

        let backend_port = env::var(ENV_BACKEND_PORT)
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(DEFAULT_BACKEND_PORT);

        Self {
            helix_client,
            data_source,
            api_key,
            backend_port,
        }
    }

}


