import { useState, useEffect, useRef, useCallback } from "react";
import {
  Heading,
  Text,
  TextInput,
  FormControl,
  Radio,
  RadioGroup,
  Button,
} from "@primer/react";
import { getSetting, setSetting, testConnection } from "../api";
import { PROVIDERS, Provider } from "../providers";
import CalendarSettings from "./CalendarSettings";

function Settings() {
  const [selectedProvider, setSelectedProvider] = useState<Provider>('anthropic');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState<string>('');
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    loadSettings();
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout);
    };
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);

      const provider = await getSetting("api_provider");
      if (provider && (provider === 'anthropic' || provider === 'litellm')) {
        setSelectedProvider(provider as Provider);
      }

      const loadedSettings: Record<string, string> = {};
      for (const provider of PROVIDERS) {
        for (const field of provider.settingsFields) {
          try {
            const value = await getSetting(field.key);
            if (value) {
              loadedSettings[field.key] = value;
            }
          } catch {
            // Setting doesn't exist yet
          }
        }
      }

      setSettings(loadedSettings);
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveField = useCallback(async (key: string, value: string) => {
    const field = PROVIDERS.flatMap(p => p.settingsFields).find(f => f.key === key);
    if (!field) return;

    if (field.required && !value.trim()) {
      setFieldErrors(prev => ({ ...prev, [key]: `${field.label} is required` }));
      return;
    }

    if (field.validate && value.trim()) {
      const validationError = field.validate(value);
      if (validationError) {
        setFieldErrors(prev => ({ ...prev, [key]: validationError }));
        return;
      }
    }

    setFieldErrors(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

    try {
      setSaveStatus('saving');
      if (value.trim()) {
        await setSetting(key, value.trim());
      }
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  }, []);

  const updateSetting = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));

    if (debounceTimers.current[key]) {
      clearTimeout(debounceTimers.current[key]);
    }

    debounceTimers.current[key] = setTimeout(() => {
      saveField(key, value);
    }, 800);
  };

  const handleProviderChange = async (value: string) => {
    const provider = value as Provider;
    setSelectedProvider(provider);
    setFieldErrors({});
    setTestStatus('idle');
    setTestMessage('');

    try {
      setSaveStatus('saving');
      await setSetting("api_provider", provider);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  };

  const handleTestConnection = async () => {
    setTestStatus('testing');
    setTestMessage('');
    try {
      const msg = await testConnection();
      setTestStatus('success');
      setTestMessage(msg);
    } catch (error) {
      setTestStatus('error');
      setTestMessage(typeof error === 'string' ? error : 'Connection failed');
    }
  };

  const currentProvider = PROVIDERS.find(p => p.id === selectedProvider);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', width: '100%', flexDirection: 'column' }}>
      <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
        {isLoading ? (
          <Text sx={{ fontSize: 1, color: "fg.muted" }}>Loading...</Text>
        ) : (
          <>
            {/* Provider Selection */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Heading sx={{ fontSize: 2 }}>API Provider</Heading>
                {saveStatus === 'saving' && (
                  <Text sx={{ fontSize: 0, color: "fg.muted" }}>Saving...</Text>
                )}
                {saveStatus === 'saved' && (
                  <Text sx={{ fontSize: 0, color: "success.fg" }}>Saved</Text>
                )}
                {saveStatus === 'error' && (
                  <Text sx={{ fontSize: 0, color: "danger.fg" }}>Save failed</Text>
                )}
              </div>
              <Text sx={{ fontSize: 1, color: "fg.muted", display: "block", marginBottom: '12px' }}>
                Choose how you want to access models
              </Text>

              <RadioGroup
                name="provider"
                onChange={(value) => handleProviderChange(value as string)}
              >
                {PROVIDERS.map((provider) => (
                  <div key={provider.id} style={{ marginBottom: '12px' }}>
                    <FormControl>
                      <Radio
                        value={provider.id}
                        checked={selectedProvider === provider.id}
                      />
                      <FormControl.Label sx={{ fontWeight: 'semibold' }}>
                        {provider.name}
                      </FormControl.Label>
                    </FormControl>
                    <Text sx={{ fontSize: 0, color: "fg.muted", ml: 4, display: "block" }}>
                      {provider.description}
                    </Text>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Provider-Specific Settings */}
            {currentProvider && (
              <div style={{ marginBottom: '24px' }}>
                <Heading sx={{ fontSize: 2, mb: 2 }}>
                  {currentProvider.name} Configuration
                </Heading>

                {currentProvider.settingsFields.map((field) => (
                  <div key={field.key} style={{ marginBottom: '12px' }}>
                    <Text
                      sx={{
                        fontSize: 1,
                        fontWeight: "semibold",
                        mb: 2,
                        display: "block",
                      }}
                    >
                      {field.label}
                      {field.required && (
                        <Text as="span" sx={{ color: "danger.fg", ml: 1 }}>
                          *
                        </Text>
                      )}
                    </Text>

                    <TextInput
                      type={field.type === 'password' ? 'password' : 'text'}
                      value={settings[field.key] || ''}
                      onChange={(e) => updateSetting(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      sx={{ width: "100%", maxWidth: 500 }}
                      validationStatus={fieldErrors[field.key] ? 'error' : undefined}
                    />

                    {fieldErrors[field.key] && (
                      <Text sx={{ fontSize: 0, color: "danger.fg", mt: 1, display: "block" }}>
                        {fieldErrors[field.key]}
                      </Text>
                    )}

                    {field.helpText && !fieldErrors[field.key] && (
                      <Text sx={{ fontSize: 0, color: "fg.muted", mt: 1, display: "block" }}>
                        {field.helpText}
                      </Text>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Test Connection */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Button
                  onClick={handleTestConnection}
                  disabled={testStatus === 'testing'}
                  variant="default"
                  size="small"
                >
                  {testStatus === 'testing' ? 'Testing…' : 'Test Connection'}
                </Button>
                {testStatus === 'success' && (
                  <Text sx={{ fontSize: 1, color: 'success.fg' }}>
                    ✓ {testMessage}
                  </Text>
                )}
                {testStatus === 'error' && (
                  <Text sx={{ fontSize: 1, color: 'danger.fg' }}>
                    ✗ {testMessage}
                  </Text>
                )}
              </div>
            </div>

            {/* Calendar Settings Section */}
            <div
              style={{
                marginBottom: '24px',
                paddingTop: '24px',
                borderTop: '1px solid var(--borderColor-default)',
              }}
            >
              <CalendarSettings />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Settings;
