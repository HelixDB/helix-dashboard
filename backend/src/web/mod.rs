//! Web-related modules for HTTP handlers, parameters, errors, and utilities

pub mod handlers;
pub mod params;
pub mod errors;
pub mod utils;
pub mod types;

pub use handlers::*;
pub use params::*;
pub use errors::*;
pub use utils::*;
pub use types::*;
