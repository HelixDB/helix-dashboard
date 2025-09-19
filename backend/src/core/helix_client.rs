//! Custom HelixDB client that supports both queries and HTTP requests

use helix_rs::HelixDBClient;
use reqwest::{Client, Method};
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum BackendHelixError {
    #[error("HTTP request failed: {0}")]
    ReqwestError(#[from] reqwest::Error),
    #[error("Server returned error: {status} - {message}")]
    ServerError { status: u16, message: String },
}

#[derive(Clone)]
pub struct BackendHelixClient {
    client: Client,
    base_url: String,
    api_key: Option<String>,
}

impl BackendHelixClient {
    /// Get the base URL for this client
    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    /// Make a request with any HTTP method to a full URL
    pub async fn request<T, R>(
        &self,
        method: Method,
        url: &str,
        data: Option<&T>,
    ) -> Result<R, BackendHelixError>
    where
        T: Serialize + Sync,
        R: for<'de> Deserialize<'de>,
    {
        let mut request = self.client.request(method, url);

        if let Some(api_key) = &self.api_key {
            request = request.header("x-api-key", api_key);
        }

        if let Some(data) = data {
            request = request.json(data);
        }

        let response = request.send().await?;

        if !response.status().is_success() {
            let status = response.status().as_u16();
            let message = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(BackendHelixError::ServerError { status, message });
        }

        let result = response.json().await?;
        Ok(result)
    }

    /// Helper to resolve URL (full URL or relative endpoint)
    fn resolve_url(&self, url_or_endpoint: &str) -> String {
        if url_or_endpoint.starts_with("http://") || url_or_endpoint.starts_with("https://") {
            url_or_endpoint.to_string()
        } else {
            let base = self.base_url.trim_end_matches('/');
            let endpoint = url_or_endpoint.trim_start_matches('/');
            format!("{base}/{endpoint}")
        }
    }

    pub async fn get<R>(&self, url_or_endpoint: &str) -> Result<R, BackendHelixError>
    where
        R: for<'de> Deserialize<'de>,
    {
        let url = self.resolve_url(url_or_endpoint);
        self.request::<(), R>(Method::GET, &url, None).await
    }

    pub async fn post<T, R>(&self, url_or_endpoint: &str, data: &T) -> Result<R, BackendHelixError>
    where
        T: Serialize + Sync,
        R: for<'de> Deserialize<'de>,
    {
        let url = self.resolve_url(url_or_endpoint);
        self.request(Method::POST, &url, Some(data)).await
    }

    pub async fn put<T, R>(&self, url_or_endpoint: &str, data: &T) -> Result<R, BackendHelixError>
    where
        T: Serialize + Sync,
        R: for<'de> Deserialize<'de>,
    {
        let url = self.resolve_url(url_or_endpoint);
        self.request(Method::PUT, &url, Some(data)).await
    }

    pub async fn delete<R>(&self, url_or_endpoint: &str) -> Result<R, BackendHelixError>
    where
        R: for<'de> Deserialize<'de>,
    {
        let url = self.resolve_url(url_or_endpoint);
        self.request::<(), R>(Method::DELETE, &url, None).await
    }
}

/// Implement the HelixDBClient trait for compatibility
impl HelixDBClient for BackendHelixClient {
    type Err = BackendHelixError;

    fn new(endpoint: Option<&str>, port: Option<u16>, api_key: Option<&str>) -> Self {
        let base_url = format!(
            "{}{}",
            endpoint.unwrap_or("http://localhost"),
            port.map(|p| format!(":{p}")).unwrap_or_default()
        );

        Self {
            client: Client::new(),
            base_url,
            api_key: api_key.map(String::from),
        }
    }

    async fn query<T, R>(&self, endpoint: &str, data: &T) -> Result<R, Self::Err>
    where
        T: Serialize + Sync,
        R: for<'de> Deserialize<'de>,
    {
        self.post(endpoint, data).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_url_relative_endpoint() {
        let client = BackendHelixClient::new(Some("http://localhost:6969"), None, None);

        let result = client.resolve_url("introspect");
        assert_eq!(result, "http://localhost:6969/introspect");

        let result = client.resolve_url("nodes-edges");
        assert_eq!(result, "http://localhost:6969/nodes-edges");

        let result = client.resolve_url("node-details?id=123");
        assert_eq!(result, "http://localhost:6969/node-details?id=123");
    }

    #[test]
    fn test_resolve_url_relative_endpoint_with_leading_slash() {
        let client = BackendHelixClient::new(Some("http://localhost:6969"), None, None);

        let result = client.resolve_url("/introspect");
        assert_eq!(result, "http://localhost:6969/introspect");

        let result = client.resolve_url("/nodes-edges");
        assert_eq!(result, "http://localhost:6969/nodes-edges");
    }

    #[test]
    fn test_resolve_url_full_http_url() {
        let client = BackendHelixClient::new(Some("http://localhost:6969"), None, None);

        let result = client.resolve_url("http://example.com/api/data");
        assert_eq!(result, "http://example.com/api/data");
    }

    #[test]
    fn test_resolve_url_full_https_url() {
        let client = BackendHelixClient::new(Some("http://localhost:6969"), None, None);

        let result = client.resolve_url("https://api.helixdb.com/introspect");
        assert_eq!(result, "https://api.helixdb.com/introspect");
    }

    #[test]
    fn test_resolve_url_base_url_with_trailing_slash() {
        let client = BackendHelixClient {
            client: Client::new(),
            base_url: "http://localhost:6969/".to_string(),
            api_key: None,
        };

        let result = client.resolve_url("introspect");
        assert_eq!(result, "http://localhost:6969/introspect");

        let result = client.resolve_url("/introspect");
        assert_eq!(result, "http://localhost:6969/introspect");
    }

    #[test]
    fn test_resolve_url_cloud_endpoint() {
        let client =
            BackendHelixClient::new(Some("https://api.helixdb.com"), None, Some("test-key"));

        let result = client.resolve_url("introspect");
        assert_eq!(result, "https://api.helixdb.com/introspect");

        let result = client.resolve_url("query/get-users");
        assert_eq!(result, "https://api.helixdb.com/query/get-users");
    }
}
