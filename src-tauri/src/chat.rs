use serde::{Deserialize, Serialize};
use crate::providers::{load_provider_config, resolve_model_name};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: serde_json::Value,
}

#[tauri::command]
pub async fn send_chat_message(
    app: tauri::AppHandle,
    model: String,
    messages: Vec<ChatMessage>,
    system: Option<String>,
    max_tokens: u32,
    tools: Option<Vec<serde_json::Value>>,
    _api_key: Option<String>, // DEPRECATED: kept for backward compat during migration
) -> Result<String, String> {
    println!("Sending chat message with model: {}", model);

    // Resolve friendly model name to full snapshot ID
    let resolved_model = resolve_model_name(app.clone(), &model).await?;
    println!("Resolved model '{}' to '{}'", model, resolved_model);

    // Load provider configuration
    let config = load_provider_config(app).await?;

    // Get endpoint and headers from provider config
    let endpoint = config.get_endpoint();
    let headers = config.get_headers();

    println!("Using provider endpoint: {}", endpoint);

    // Build request body with resolved model
    let mut body = serde_json::json!({
        "model": resolved_model,
        "messages": messages,
        "max_tokens": max_tokens,
    });

    if let Some(sys) = system {
        body["system"] = serde_json::json!(sys);
    }

    if let Some(t) = tools {
        if !t.is_empty() {
            println!("Including {} tools in request for model '{}'", t.len(), resolved_model);
            body["tools"] = serde_json::json!(t);
        }
    }

    // Make HTTP request
    let client = reqwest::Client::new();
    let mut request = client
        .post(&endpoint)
        .header("content-type", "application/json");

    // Apply provider-specific headers
    for (key, value) in headers {
        request = request.header(&key, &value);
    }

    let response = request
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("API error ({}): {}", status, error_text));
    }

    let result = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    Ok(result)
}

#[tauri::command]
pub async fn test_connection(app: tauri::AppHandle) -> Result<String, String> {
    // Load and validate provider config (fails fast if credentials are missing)
    let config = load_provider_config(app).await?;

    let endpoint = config.get_models_endpoint();
    let headers = config.get_headers();

    let client = reqwest::Client::new();
    let mut request = client.get(&endpoint);

    for (key, value) in headers {
        request = request.header(&key, &value);
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        // Surface a human-friendly message for common HTTP errors
        let msg = match status.as_u16() {
            401 => "Authentication failed. Check your API key.".to_string(),
            403 => "Access denied. Your API key may lack the required permissions.".to_string(),
            404 => "Endpoint not found. Check the base URL for your provider.".to_string(),
            _ => format!("API returned an error (HTTP {}): {}", status, error_text),
        };
        return Err(msg);
    }

    Ok("Connection successful".to_string())
}
