export type Provider = 'anthropic' | 'litellm';
// Future: | 'azure-openai' | 'aws-bedrock' | 'google-vertexai';

export interface ProviderSettingField {
  key: string;              // Database key, e.g., 'litellm_base_url'
  label: string;            // Display label
  type: 'text' | 'password' | 'url';
  placeholder?: string;
  helpText?: string;
  required: boolean;
  validate?: (value: string) => string | null;
}

export interface ProviderMetadata {
  id: Provider;
  name: string;
  description: string;
  icon?: string;           // Future: emoji or icon
  settingsFields: ProviderSettingField[];
  documentationUrl?: string;
}

// PROVIDER REGISTRY - Add new providers here
export const PROVIDERS: ProviderMetadata[] = [
  {
    id: 'anthropic',
    name: 'Anthropic API',
    description: 'Direct connection to Anthropic. Simple setup with just an API key.',
    settingsFields: [
      {
        key: 'anthropic_api_key',
        label: 'API Key',
        type: 'password',
        placeholder: 'sk-ant-...',
        helpText: 'Get your API key from console.anthropic.com',
        required: true,
      }
    ],
    documentationUrl: 'https://console.anthropic.com',
  },
  {
    id: 'litellm',
    name: 'LiteLLM Gateway',
    description: 'Advanced features: cost tracking, multiple providers, load balancing, and guardrails.',
    settingsFields: [
      {
        key: 'litellm_base_url',
        label: 'Base URL',
        type: 'url',
        placeholder: 'https://your-gateway.com',
        helpText: 'Your LiteLLM Gateway endpoint (without /v1/messages)',
        required: true,
        validate: (value: string) => {
          try {
            new URL(value);
            if (!value.startsWith('http://') && !value.startsWith('https://')) {
              return 'URL must start with http:// or https://';
            }
            return null;
          } catch {
            return 'Invalid URL format';
          }
        }
      },
      {
        key: 'litellm_api_key',
        label: 'API Key',
        type: 'password',
        placeholder: 'sk-...',
        helpText: 'Your LiteLLM Gateway API key',
        required: true,
      }
    ],
    documentationUrl: 'https://docs.litellm.ai',
  },

  /*
   * ADDING A NEW PROVIDER - Template:
   *
   * {
   *   id: 'provider-name',
   *   name: 'Display Name',
   *   description: 'Brief description of the provider',
   *   settingsFields: [
   *     {
   *       key: 'provider_setting_key',
   *       label: 'Setting Label',
   *       type: 'text' | 'password' | 'url',
   *       placeholder: 'Example value',
   *       helpText: 'Help text for users',
   *       required: true | false,
   *       validate: (value) => { ... return error or null }
   *     }
   *   ],
   *   documentationUrl: 'https://...',
   * }
   */
];

