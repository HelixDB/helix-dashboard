//! Web-related modules for HTTP handlers, parameters, errors, and utilities

pub mod errors;
pub mod handlers;
pub mod params;
pub mod types;
pub mod utils;

pub use errors::*;
pub use handlers::*;
pub use params::*;
pub use types::*;
pub use utils::*;
