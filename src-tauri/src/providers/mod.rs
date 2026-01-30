use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use url::Url;

// Model information returned from providers
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,            // Full snapshot ID: "claude-sonnet-4-20250514"
    pub display_name: String,  // Friendly name: "claude-sonnet-4"
    pub display_label: String, // Human label: "Claude Sonnet 4"
}

// Derive friendly name by stripping date suffix
// Handles both formats:
//   claude-sonnet-4-20250514 -> claude-sonnet-4
//   claude-sonnet-4-5-20251012 -> claude-sonnet-4-5
fn derive_friendly_name(model_id: &str) -> String {
    let re = Regex::new(r"-(\d{8})$").unwrap();
    re.replace(model_id, "").to_string()
}

// Extensible provider enum
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Provider {
    Anthropic,
    LiteLLM,
    // Future providers - just add here:
    // AzureOpenAI,
    // AWSBedrock,
    // GoogleVertexAI,
}

impl Provider {
    pub fn from_str(s: &str) -> Result<Self, String> {
        match s.to_lowercase().as_str() {
            "anthropic" => Ok(Provider::Anthropic),
            "litellm" => Ok(Provider::LiteLLM),
            // Future: add more cases
            _ => Err(format!("Unknown provider: {}", s)),
        }
    }
}

// Provider configuration trait
pub trait ProviderConfig: Send + Sync {
    fn get_endpoint(&self) -> String;
    fn get_headers(&self) -> HashMap<String, String>;
    fn validate(&self) -> Result<(), String>;
    fn get_models_endpoint(&self) -> String;
}

// Anthropic Direct implementation
pub struct AnthropicConfig {
    pub api_key: String,
}

impl ProviderConfig for AnthropicConfig {
    fn get_endpoint(&self) -> String {
        "https://api.anthropic.com/v1/messages".to_string()
    }

    fn get_models_endpoint(&self) -> String {
        "https://api.anthropic.com/v1/models".to_string()
    }

    fn get_headers(&self) -> HashMap<String, String> {
        let mut headers = HashMap::new();
        headers.insert("x-api-key".to_string(), self.api_key.clone());
        headers.insert("anthropic-version".to_string(), "2023-06-01".to_string());
        headers
    }

    fn validate(&self) -> Result<(), String> {
        if self.api_key.trim().is_empty() {
            return Err("Anthropic API key cannot be empty".to_string());
        }
        Ok(())
    }
}

// LiteLLM Gateway implementation
pub struct LiteLLMConfig {
    pub base_url: String,
    pub api_key: String,
}

impl ProviderConfig for LiteLLMConfig {
    fn get_endpoint(&self) -> String {
        let base = self.base_url.trim_end_matches('/');
        format!("{}/v1/messages", base)
    }

    fn get_models_endpoint(&self) -> String {
        let base = self.base_url.trim_end_matches('/');
        format!("{}/v1/models", base)
    }

    fn get_headers(&self) -> HashMap<String, String> {
        let mut headers = HashMap::new();
        headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", self.api_key)
        );
        headers
    }

    fn validate(&self) -> Result<(), String> {
        if self.base_url.trim().is_empty() {
            return Err("LiteLLM base URL cannot be empty".to_string());
        }
        if self.api_key.trim().is_empty() {
            return Err("LiteLLM API key cannot be empty".to_string());
        }

        // Validate URL format
        Url::parse(&self.base_url)
            .map_err(|e| format!("Invalid URL format: {}", e))?;

        Ok(())
    }
}

// Configuration loader
pub async fn load_provider_config(
    app: tauri::AppHandle,
) -> Result<Box<dyn ProviderConfig>, String> {
    use crate::settings::get_setting;

    // Get selected provider (default to Anthropic)
    let provider_str = get_setting(app.clone(), "api_provider".to_string())
        .await
        .unwrap_or_else(|_| "anthropic".to_string());

    let provider = Provider::from_str(&provider_str)?;

    match provider {
        Provider::Anthropic => {
            // Try saved key first, then env var
            let api_key = get_setting(app.clone(), "anthropic_api_key".to_string())
                .await
                .or_else(|_| env::var("ANTHROPIC_API_KEY"))
                .map_err(|_| {
                    "Anthropic API key not configured. Please set it in Settings.".to_string()
                })?;

            let config = AnthropicConfig { api_key };
            config.validate()?;
            Ok(Box::new(config))
        }

        Provider::LiteLLM => {
            let base_url = get_setting(app.clone(), "litellm_base_url".to_string())
                .await
                .map_err(|_| {
                    "LiteLLM base URL not configured. Please set it in Settings.".to_string()
                })?;

            let api_key = get_setting(app.clone(), "litellm_api_key".to_string())
                .await
                .map_err(|_| {
                    "LiteLLM API key not configured. Please set it in Settings.".to_string()
                })?;

            let config = LiteLLMConfig { base_url, api_key };
            config.validate()?;
            Ok(Box::new(config))
        }

        // Future providers - just add new match arms:
        // Provider::AzureOpenAI => { ... }
    }
}

// Response structures for Anthropic models API
#[derive(Debug, Deserialize)]
struct AnthropicModelsResponse {
    data: Vec<AnthropicModel>,
}

#[derive(Debug, Deserialize)]
struct AnthropicModel {
    id: String,
    display_name: String,
}

// Response structures for LiteLLM/OpenAI models API
#[derive(Debug, Deserialize)]
struct OpenAIModelsResponse {
    data: Vec<OpenAIModel>,
}

#[derive(Debug, Deserialize)]
struct OpenAIModel {
    id: String,
}

// Fetch available models from the configured provider
pub async fn fetch_models(
    app: tauri::AppHandle,
) -> Result<Vec<ModelInfo>, String> {
    use crate::settings::get_setting;

    // Get selected provider (default to Anthropic)
    let provider_str = get_setting(app.clone(), "api_provider".to_string())
        .await
        .unwrap_or_else(|_| "anthropic".to_string());

    let provider = Provider::from_str(&provider_str)?;
    let config = load_provider_config(app).await?;

    let endpoint = config.get_models_endpoint();
    let headers = config.get_headers();

    println!("Fetching models from: {}", endpoint);

    // Make HTTP request
    let client = reqwest::Client::new();
    let mut request = client.get(&endpoint);

    // Apply provider-specific headers
    for (key, value) in headers {
        request = request.header(&key, &value);
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("Failed to fetch models: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Models API error ({}): {}", status, error_text));
    }

    let response_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read models response: {}", e))?;

    // Parse response based on provider
    let models: Vec<ModelInfo> = match provider {
        Provider::Anthropic => {
            let parsed: AnthropicModelsResponse = serde_json::from_str(&response_text)
                .map_err(|e| format!("Failed to parse Anthropic models response: {}", e))?;

            parsed
                .data
                .into_iter()
                .map(|m| ModelInfo {
                    display_name: derive_friendly_name(&m.id),
                    display_label: m.display_name,
                    id: m.id,
                })
                .collect()
        }
        Provider::LiteLLM => {
            let parsed: OpenAIModelsResponse = serde_json::from_str(&response_text)
                .map_err(|e| format!("Failed to parse LiteLLM models response: {}", e))?;

            parsed
                .data
                .into_iter()
                .map(|m| {
                    let friendly = derive_friendly_name(&m.id);
                    // For LiteLLM, derive the label from friendly name since API doesn't provide it
                    let label = friendly
                        .replace("-", " ")
                        .split_whitespace()
                        .map(|w| {
                            let mut c = w.chars();
                            match c.next() {
                                None => String::new(),
                                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                            }
                        })
                        .collect::<Vec<_>>()
                        .join(" ");
                    ModelInfo {
                        display_name: friendly,
                        display_label: label,
                        id: m.id,
                    }
                })
                .collect()
        }
    };

    println!("Fetched {} models", models.len());
    Ok(models)
}

// Resolve a friendly model name to its full snapshot ID
pub async fn resolve_model_name(
    app: tauri::AppHandle,
    friendly_name: &str,
) -> Result<String, String> {
    let models = fetch_models(app).await?;

    // Find a model whose display_name matches the friendly name
    for model in &models {
        if model.display_name == friendly_name {
            return Ok(model.id.clone());
        }
    }

    // If not found, assume the input is already a full model ID
    // (backward compatibility for existing agents)
    Ok(friendly_name.to_string())
}
