//! Error types and handling for web handlers

use axum::{Json as AxumJson, http::StatusCode, response::IntoResponse};
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
#[serde(tag = "type", content = "message")]
pub enum ApiError {
    #[error("Database connection failed: {0}")]
    DatabaseError(String),

    #[error("Invalid query parameters: {0}")]
    InvalidQuery(String),

    #[error("Validation failed: {0}")]
    ValidationError(String),

    #[error("Resource not found: {0}")]
    NotFound(String),

    #[error("Authentication required")]
    Unauthorized,

    #[error("Internal server error: {0}")]
    Internal(String),
}

impl ApiError {
    fn status_code(&self) -> StatusCode {
        match self {
            ApiError::DatabaseError(_) => StatusCode::SERVICE_UNAVAILABLE,
            ApiError::InvalidQuery(_) => StatusCode::BAD_REQUEST,
            ApiError::ValidationError(_) => StatusCode::BAD_REQUEST,
            ApiError::NotFound(_) => StatusCode::NOT_FOUND,
            ApiError::Unauthorized => StatusCode::UNAUTHORIZED,
            ApiError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        let status = self.status_code();
        let body = AxumJson(serde_json::json!({
            "status": status.as_u16(),
            "message": self.to_string()
        }));

        (status, body).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::StatusCode;

    #[test]
    fn test_database_error_status_code() {
        let error = ApiError::DatabaseError("Connection timeout".to_string());
        assert_eq!(error.status_code(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[test]
    fn test_invalid_query_status_code() {
        let error = ApiError::InvalidQuery("Missing required parameter".to_string());
        assert_eq!(error.status_code(), StatusCode::BAD_REQUEST);
    }

    #[test]
    fn test_not_found_status_code() {
        let error = ApiError::NotFound("User not found".to_string());
        assert_eq!(error.status_code(), StatusCode::NOT_FOUND);
    }

    #[test]
    fn test_unauthorized_status_code() {
        let error = ApiError::Unauthorized;
        assert_eq!(error.status_code(), StatusCode::UNAUTHORIZED);
    }

    #[test]
    fn test_validation_error_status_code() {
        let error = ApiError::ValidationError("Invalid input".to_string());
        assert_eq!(error.status_code(), StatusCode::BAD_REQUEST);
    }

    #[test]
    fn test_internal_status_code() {
        let error = ApiError::Internal("Something went wrong".to_string());
        assert_eq!(error.status_code(), StatusCode::INTERNAL_SERVER_ERROR);
    }
}
