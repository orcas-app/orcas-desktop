import { useState, useEffect } from "react";
import {
  Box,
  Heading,
  Text,
  TextInput,
  Button,
  Flash,
  FormControl,
  Radio,
  RadioGroup,
} from "@primer/react";
import { getSetting, setSetting } from "../api";
import { PROVIDERS, Provider } from "../providers";
import CalendarSettings from "./CalendarSettings";

interface SettingsProps {
  onBack: () => void;
}

function Settings({ onBack }: SettingsProps) {
  const [selectedProvider, setSelectedProvider] = useState<Provider>('anthropic');
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);

      // Load selected provider
      const provider = await getSetting("api_provider");
      if (provider && (provider === 'anthropic' || provider === 'litellm')) {
        setSelectedProvider(provider as Provider);
      }

      // Load all settings for all providers
      const loadedSettings: Record<string, string> = {};
      for (const provider of PROVIDERS) {
        for (const field of provider.settingsFields) {
          try {
            const value = await getSetting(field.key);
            if (value) {
              loadedSettings[field.key] = value;
            }
          } catch {
            // Setting doesn't exist yet, skip
          }
        }
      }

      setSettings(loadedSettings);
    } catch (error) {
      console.error("Failed to load settings:", error);
      setError("Failed to load settings");
    } finally {
      setIsLoading(false);
    }
  };

  const validateFields = (): boolean => {
    const currentProvider = PROVIDERS.find(p => p.id === selectedProvider);
    if (!currentProvider) return false;

    const errors: Record<string, string> = {};

    for (const field of currentProvider.settingsFields) {
      const value = settings[field.key] || '';

      // Required field check
      if (field.required && !value.trim()) {
        errors[field.key] = `${field.label} is required`;
        continue;
      }

      // Custom validation
      if (field.validate && value.trim()) {
        const validationError = field.validate(value);
        if (validationError) {
          errors[field.key] = validationError;
        }
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setShowSuccess(false);
      setFieldErrors({});

      // Validate all fields
      if (!validateFields()) {
        setError("Please fix the errors below");
        return;
      }

      // Save provider selection
      await setSetting("api_provider", selectedProvider);

      // Save all settings for current provider
      const currentProvider = PROVIDERS.find(p => p.id === selectedProvider);
      if (currentProvider) {
        for (const field of currentProvider.settingsFields) {
          const value = settings[field.key];
          if (value && value.trim()) {
            await setSetting(field.key, value.trim());
          }
        }
      }

      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error("Failed to save settings:", error);
      setError("Failed to save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const updateSetting = (key: string, value: string) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));

    // Clear field error when user types
    if (fieldErrors[key]) {
      setFieldErrors(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const currentProvider = PROVIDERS.find(p => p.id === selectedProvider);

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        width: '100%',
        flexDirection: 'column',
      }}
    >

      {/* Content */}
      <Box p={4} flex={1} sx={{ overflowY: "auto" }}>
        {showSuccess && (
          <Flash variant="success" sx={{ mb: 3 }}>
            Settings saved successfully!
          </Flash>
        )}

        {error && (
          <Flash variant="danger" sx={{ mb: 3 }}>
            {error}
          </Flash>
        )}

        {isLoading ? (
          <Text sx={{ fontSize: 1, color: "fg.muted" }}>Loading...</Text>
        ) : (
          <>
            {/* Provider Selection */}
            <Box mb={4}>
              <Heading sx={{ fontSize: 2, mb: 2 }}>API Provider</Heading>
              <Text sx={{ fontSize: 1, color: "fg.muted", mb: 3, display: "block" }}>
                Choose how you want to access models
              </Text>

              <RadioGroup
                name="provider"
                onChange={(value) => {
                  setSelectedProvider(value as Provider);
                  setFieldErrors({});
                }}
              >
                {PROVIDERS.map((provider) => (
                  <Box key={provider.id} mb={3}>
                    <FormControl>
                      <Radio
                        value={provider.id}
                        checked={selectedProvider === provider.id}
                        disabled={isSaving}
                      />
                      <FormControl.Label sx={{ fontWeight: 'semibold' }}>
                        {provider.name}
                      </FormControl.Label>
                    </FormControl>
                    <Text sx={{ fontSize: 0, color: "fg.muted", ml: 4, display: "block" }}>
                      {provider.description}
                    </Text>
                  </Box>
                ))}
              </RadioGroup>
            </Box>

            {/* Provider-Specific Settings */}
            {currentProvider && (
              <Box mb={4}>
                <Heading sx={{ fontSize: 2, mb: 2 }}>
                  {currentProvider.name} Configuration
                </Heading>

                {currentProvider.settingsFields.map((field) => (
                  <Box key={field.key} mb={3}>
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
                      disabled={isSaving}
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
                  </Box>
                ))}

                <Button
                  variant="primary"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : "Save Settings"}
                </Button>
              </Box>
            )}

            {/* Calendar Settings Section */}
            <Box
              mb={4}
              pt={4}
              borderTop="1px solid"
              borderColor="border.default"
            >
              <CalendarSettings />
            </Box>
          </>
        )}
      </Box>
    </div>
  );
}

export default Settings;
