import { useState, useEffect, useCallback } from "react";
import {
  Heading,
  Text,
  TextInput,
  Button,
  Flash,
  ActionList,
  ActionMenu,
  Dialog,
  ButtonGroup,
  FormControl,
  Checkbox,
  Select,
  Label,
} from "@primer/react";
import { PlusIcon, TrashIcon, GearIcon } from "@primer/octicons-react";
import { getAllAgents, createAgent, updateAgent, deleteAgent, getAvailableModels } from "../api";
import { MDXEditor, headingsPlugin, listsPlugin, quotePlugin, thematicBreakPlugin, markdownShortcutPlugin } from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
import type { Agent, ModelInfo } from "../types";

interface AgentsManagerProps {
  onBack?: () => void;
}

// Fallback models in case API fetch fails
const FALLBACK_MODELS: ModelInfo[] = [
  { id: "claude-sonnet-4-20250514", display_name: "claude-sonnet-4", display_label: "Claude Sonnet 4", supports_tools: true },
  { id: "claude-3-5-sonnet-20241022", display_name: "claude-3-5-sonnet", display_label: "Claude 3.5 Sonnet", supports_tools: true },
  { id: "claude-3-opus-20240229", display_name: "claude-3-opus", display_label: "Claude 3 Opus", supports_tools: true },
  { id: "claude-3-haiku-20240307", display_name: "claude-3-haiku", display_label: "Claude 3 Haiku", supports_tools: true },
];

// Human-readable labels for system roles
const SYSTEM_ROLE_LABELS: Record<string, string> = {
  planning: "Task Planning",
};

function AgentsManager({ onBack: _onBack }: AgentsManagerProps) {
  const [userAgents, setUserAgents] = useState<Agent[]>([]);
  const [systemAgents, setSystemAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>(FALLBACK_MODELS);
  const [isLoadingModels, setIsLoadingModels] = useState(true);

  // Edit state
  const [editName, setEditName] = useState("");
  const [editModel, setEditModel] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editWebSearch, setEditWebSearch] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Key to force MDXEditor re-render when agent selection changes
  const [editorKey, setEditorKey] = useState(0);

  // Delete confirmation dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null);

  // Helper to check if an agent is a system agent
  const isSystemAgent = (agent: Agent) => !!agent.system_role;

  useEffect(() => {
    loadAgents();
    loadModels();
  }, []);

  const loadModels = async () => {
    try {
      setIsLoadingModels(true);
      const models = await getAvailableModels();
      if (models.length > 0) {
        setAvailableModels(models);
      }
    } catch (err) {
      console.error("Failed to load models, using fallback:", err);
    } finally {
      setIsLoadingModels(false);
    }
  };

  useEffect(() => {
    if (selectedAgent) {
      setEditName(selectedAgent.name);
      setEditModel(selectedAgent.model_name);
      setEditPrompt(selectedAgent.agent_prompt);
      setEditWebSearch(!!selectedAgent.web_search_enabled);
      setHasChanges(false);
      setEditorKey((prev) => prev + 1);
    }
  }, [selectedAgent]);

  useEffect(() => {
    if (selectedAgent) {
      const isSystem = isSystemAgent(selectedAgent);
      const nameChanged = !isSystem && editName !== selectedAgent.name;
      const modelChanged = editModel !== selectedAgent.model_name;
      const promptChanged = editPrompt !== selectedAgent.agent_prompt;
      const webSearchChanged = editWebSearch !== !!selectedAgent.web_search_enabled;
      setHasChanges(nameChanged || modelChanged || promptChanged || webSearchChanged);
    }
  }, [editName, editModel, editPrompt, editWebSearch, selectedAgent]);

  const loadAgents = async () => {
    try {
      setIsLoading(true);
      const fetchedAgents = await getAllAgents();
      const system = fetchedAgents.filter((agent) => agent.system_role);
      const user = fetchedAgents.filter((agent) => !agent.system_role);
      setSystemAgents(system);
      setUserAgents(user);
      if (!selectedAgent) {
        if (system.length > 0) {
          setSelectedAgent(system[0]);
        } else if (user.length > 0) {
          setSelectedAgent(user[0]);
        }
      }
    } catch (err) {
      console.error("Failed to load agents:", err);
      setError("Failed to load agents");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedAgent) return;

    try {
      setIsSaving(true);
      setError(null);
      setShowSuccess(false);

      const isSystem = isSystemAgent(selectedAgent);

      const updatedAgent = await updateAgent(selectedAgent.id, {
        name: isSystem ? selectedAgent.name : editName.trim(),
        model_name: editModel,
        agent_prompt: editPrompt.trim(),
        web_search_enabled: editWebSearch,
      });

      if (isSystem) {
        setSystemAgents((prev) =>
          prev.map((agent) =>
            agent.id === updatedAgent.id ? updatedAgent : agent,
          ),
        );
      } else {
        setUserAgents((prev) =>
          prev.map((agent) =>
            agent.id === updatedAgent.id ? updatedAgent : agent,
          ),
        );
      }
      setSelectedAgent(updatedAgent);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save agent:", err);
      setError("Failed to save agent. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateAgent = async () => {
    try {
      setError(null);
      const defaultModel = availableModels[0]?.display_name || FALLBACK_MODELS[0].display_name;
      const createdAgent = await createAgent(
        "New Agent",
        defaultModel,
        "You are a helpful assistant.",
        false,
      );

      setUserAgents((prev) => [...prev, createdAgent].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedAgent(createdAgent);
    } catch (err) {
      console.error("Failed to create agent:", err);
      setError("Failed to create agent. Please try again.");
    }
  };

  const handleDeleteAgent = async () => {
    if (!agentToDelete) return;

    try {
      await deleteAgent(agentToDelete.id);
      setUserAgents((prev) => prev.filter((agent) => agent.id !== agentToDelete.id));

      if (selectedAgent?.id === agentToDelete.id) {
        const remainingAgents = userAgents.filter(
          (agent) => agent.id !== agentToDelete.id,
        );
        if (remainingAgents.length > 0) {
          setSelectedAgent(remainingAgents[0]);
        } else if (systemAgents.length > 0) {
          setSelectedAgent(systemAgents[0]);
        } else {
          setSelectedAgent(null);
        }
      }

      setShowDeleteDialog(false);
      setAgentToDelete(null);
    } catch (err) {
      console.error("Failed to delete agent:", err);
      setError("Failed to delete agent. Please try again.");
    }
  };

  const confirmDelete = (agent: Agent) => {
    setAgentToDelete(agent);
    setShowDeleteDialog(true);
  };

  const handlePromptChange = useCallback((newContent: string) => {
    setEditPrompt(newContent);
  }, []);

  const renderAgentListItem = (agent: Agent, showDeleteOption: boolean) => (
    <ActionList.Item
      key={agent.id}
      active={selectedAgent?.id === agent.id}
      onSelect={() => setSelectedAgent(agent)}
    >
      <ActionList.LeadingVisual>
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: agent.system_role ? "var(--fgColor-done)" : "var(--fgColor-accent)",
          }}
        />
      </ActionList.LeadingVisual>
      <span>
        <Text sx={{ fontWeight: "medium" }}>{agent.name}</Text>
        <Text
          sx={{
            display: "block",
            fontSize: 0,
            color: "fg.muted",
          }}
        >
          {availableModels.find((m) => m.display_name === agent.model_name || m.id === agent.model_name)?.display_label ||
            agent.model_name}
        </Text>
      </span>
      {showDeleteOption && (
        <ActionList.TrailingVisual>
          <ActionMenu>
            <ActionMenu.Anchor>
              <Button
                size="small"
                variant="invisible"
                sx={{ color: "fg.muted" }}
                onClick={(e) => e.stopPropagation()}
              >
                ...
              </Button>
            </ActionMenu.Anchor>
            <ActionMenu.Overlay>
              <ActionList>
                <ActionList.Item
                  variant="danger"
                  onSelect={() => confirmDelete(agent)}
                >
                  <ActionList.LeadingVisual>
                    <TrashIcon />
                  </ActionList.LeadingVisual>
                  Delete
                </ActionList.Item>
              </ActionList>
            </ActionMenu.Overlay>
          </ActionMenu>
        </ActionList.TrailingVisual>
      )}
    </ActionList.Item>
  );

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div
        style={{
          padding: 16,
          borderBottom: "1px solid var(--borderColor-default)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Heading sx={{ fontSize: 3 }}>Agents</Heading>
      </div>

      {/* Content */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Agent List Sidebar */}
        <div
          style={{
            width: 280,
            borderRight: "1px solid var(--borderColor-default)",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "var(--bgColor-muted)",
          }}
        >
          <div style={{ flex: 1, overflowY: "auto" }}>
            {isLoading ? (
              <div style={{ padding: 16 }}>
                <Text sx={{ color: "fg.muted", fontSize: 1 }}>Loading...</Text>
              </div>
            ) : (
              <>
                {/* System Agents Section */}
                {systemAgents.length > 0 && (
                  <>
                    <div
                      style={{
                        padding: 8,
                        borderBottom: "1px solid var(--borderColor-default)",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <GearIcon size={16} />
                      <Text sx={{ fontWeight: "semibold", fontSize: 1 }}>
                        System Agents
                      </Text>
                    </div>
                    <ActionList>
                      {systemAgents.map((agent) => renderAgentListItem(agent, false))}
                    </ActionList>
                  </>
                )}

                {/* User Agents Section */}
                <div
                  style={{
                    padding: 8,
                    borderBottom: "1px solid var(--borderColor-default)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text sx={{ fontWeight: "semibold", fontSize: 1 }}>
                    Your Agents
                  </Text>
                  <Button
                    size="small"
                    leadingVisual={PlusIcon}
                    onClick={handleCreateAgent}
                  >
                    New
                  </Button>
                </div>

                {userAgents.length === 0 ? (
                  <div style={{ padding: 16 }}>
                    <Text sx={{ color: "fg.muted", fontSize: 1 }}>
                      No agents yet. Create one to get started.
                    </Text>
                  </div>
                ) : (
                  <ActionList>
                    {userAgents.map((agent) => renderAgentListItem(agent, true))}
                  </ActionList>
                )}
              </>
            )}
          </div>
        </div>

        {/* Agent Editor */}
        <div style={{ flex: 1, padding: 24, overflowY: "auto" }}>
          {showSuccess && (
            <Flash variant="success" sx={{ mb: 3 }}>
              Agent saved successfully!
            </Flash>
          )}

          {error && (
            <Flash variant="danger" sx={{ mb: 3 }}>
              {error}
            </Flash>
          )}

          {selectedAgent ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <Heading sx={{ fontSize: 2 }}>Edit Agent</Heading>
                {isSystemAgent(selectedAgent) && (
                  <Label variant="success">
                    {SYSTEM_ROLE_LABELS[selectedAgent.system_role!] || selectedAgent.system_role}
                  </Label>
                )}
              </div>

              <div style={{ marginBottom: 16 }}>
                <FormControl>
                  <FormControl.Label>Name</FormControl.Label>
                  {isSystemAgent(selectedAgent) ? (
                    <>
                      <TextInput
                        value={selectedAgent.name}
                        sx={{ width: "100%", maxWidth: 400 }}
                        disabled
                      />
                      <FormControl.Caption>
                        System agent names cannot be changed
                      </FormControl.Caption>
                    </>
                  ) : (
                    <TextInput
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      sx={{ width: "100%", maxWidth: 400 }}
                      disabled={isSaving}
                    />
                  )}
                </FormControl>
              </div>

              <div style={{ marginBottom: 16 }}>
                <FormControl>
                  <FormControl.Label>Model</FormControl.Label>
                  <Select
                    value={editModel}
                    onChange={(e) => setEditModel(e.target.value)}
                    disabled={isSaving || isLoadingModels}
                  >
                    {availableModels.map((model) => (
                      <Select.Option key={model.display_name} value={model.display_name}>
                        {model.display_label}
                      </Select.Option>
                    ))}
                  </Select>
                  <FormControl.Caption>
                    {isLoadingModels
                      ? "Loading models..."
                      : (() => {
                          const selectedModel = availableModels.find(
                            (m) => m.display_name === editModel
                          );
                          if (selectedModel && !selectedModel.supports_tools) {
                            return "This model does not support tool use. The agent will not be able to read or write documents.";
                          }
                          return "The AI model that powers this agent";
                        })()}
                  </FormControl.Caption>
                  {(() => {
                    const selectedModel = availableModels.find(
                      (m) => m.display_name === editModel
                    );
                    if (selectedModel && !selectedModel.supports_tools) {
                      return (
                        <Flash variant="warning" sx={{ mt: 2, fontSize: 0 }}>
                          This model does not support tool calling. Agent features like reading/writing task notes will not work.
                        </Flash>
                      );
                    }
                    return null;
                  })()}
                </FormControl>
              </div>

              <div style={{ marginBottom: 16 }}>
                <FormControl>
                  <Checkbox
                    checked={editWebSearch}
                    onChange={(e) => setEditWebSearch(e.target.checked)}
                    disabled={isSaving}
                  />
                  <FormControl.Label>Enable web search</FormControl.Label>
                  <FormControl.Caption>
                    Allow this agent to search the web for up-to-date information. Uses the Anthropic web search API.
                  </FormControl.Caption>
                </FormControl>
              </div>

              <div style={{ marginBottom: 24 }}>
                <FormControl>
                  <FormControl.Label>System Prompt</FormControl.Label>
                  <div
                    style={{
                      border: "1px solid var(--borderColor-default)",
                      borderRadius: 6,
                      minHeight: 200,
                    }}
                  >
                    <MDXEditor
                      key={editorKey}
                      markdown={editPrompt}
                      onChange={handlePromptChange}
                      plugins={[
                        headingsPlugin(),
                        listsPlugin(),
                        quotePlugin(),
                        thematicBreakPlugin(),
                        markdownShortcutPlugin(),
                      ]}
                      contentEditableClassName="mdx-editor-content"
                    />
                  </div>
                  <FormControl.Caption>
                    Instructions that define how this agent behaves. This is sent
                    as the system prompt to the AI model.
                  </FormControl.Caption>
                </FormControl>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Button
                  variant="primary"
                  onClick={handleSave}
                  disabled={isSaving || !hasChanges || (!isSystemAgent(selectedAgent) && !editName.trim())}
                >
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>

                {hasChanges && (
                  <Text
                    sx={{ fontSize: 1, color: "attention.fg" }}
                  >
                    Unsaved changes
                  </Text>
                )}
              </div>
            </>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
              }}
            >
              <Text sx={{ color: "fg.muted", fontSize: 1 }}>
                Select an agent to edit, or create a new one.
              </Text>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && agentToDelete && (
        <Dialog
          title="Delete Agent"
          onClose={() => {
            setShowDeleteDialog(false);
            setAgentToDelete(null);
          }}
          sx={{
            backgroundColor: "canvas.default",
            border: "1px solid",
            borderColor: "border.default",
            borderRadius: 2,
            boxShadow: "shadow.large",
          }}
        >
          <div style={{ padding: 16 }}>
            <Text sx={{ display: "block", mb: 3 }}>
              Are you sure you want to delete "{agentToDelete.name}"? This action
              cannot be undone.
            </Text>
            <ButtonGroup>
              <Button variant="danger" onClick={handleDeleteAgent}>
                Delete
              </Button>
              <Button
                onClick={() => {
                  setShowDeleteDialog(false);
                  setAgentToDelete(null);
                }}
              >
                Cancel
              </Button>
            </ButtonGroup>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export default AgentsManager;
