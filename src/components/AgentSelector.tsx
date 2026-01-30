import { useState, useEffect } from "react";
import { Box, Button, Text, Spinner } from "@primer/react";
import { getAllAgents } from "../api";
import type { Agent } from "../types";

interface AgentSelectorProps {
  onAgentSelected: (agent: Agent) => void;
  selectedAgent: Agent | null;
}

function AgentSelector({ onAgentSelected, selectedAgent }: AgentSelectorProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    try {
      setLoading(true);
      const agentList = await getAllAgents();
      setAgents(agentList);
      setError(null);
    } catch (err) {
      console.error("Failed to load agents:", err);
      setError("Failed to load agents");
    } finally {
      setLoading(false);
    }
  };

  const handleAgentSelect = (agent: Agent) => {
    onAgentSelected(agent);
  };

  if (loading) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" p={4}>
        <Spinner size="small" />
        <Text sx={{ ml: 2, color: "fg.muted" }}>Loading agents...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={4}>
        <Text sx={{ color: "danger.fg", mb: 2 }}>{error}</Text>
        <Button size="small" onClick={loadAgents}>
          Retry
        </Button>
      </Box>
    );
  }

  if (agents.length === 0) {
    return (
      <Box p={4}>
        <Text sx={{ color: "fg.muted", textAlign: "center" }}>
          No agents available. Create an agent to get started.
        </Text>
      </Box>
    );
  }

  if (selectedAgent) {
    return (
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        p={3}
        backgroundColor="accent.subtle"
        border="1px solid"
        borderColor="accent.muted"
        borderRadius={2}
        mb={3}
      >
        <Box display="flex" alignItems="center" sx={{ gap: 2 }}>
          <Box
            sx={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              backgroundColor: "accent.emphasis",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "fg.onEmphasis",
              fontSize: 0,
            }}
          >
            🤖
          </Box>
          <Box>
            <Text sx={{ fontWeight: "semibold", fontSize: 1 }}>
              {selectedAgent.name}
            </Text>
            <Text sx={{ fontSize: 0, color: "fg.muted" }}>
              {selectedAgent.model_name}
            </Text>
          </Box>
        </Box>
        <Button size="small" onClick={() => onAgentSelected(null as any)}>
          Change Agent
        </Button>
      </Box>
    );
  }

  return (
    <div className="vertical-center">
      <div className="agent-empty-state">
        <h2>Send to an agent</h2>

        <Box display="flex" flexDirection="column" sx={{ gap: 2 }}>
          {agents.map((agent) => (
            <Button
              key={agent.id}
              size="medium"
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-start",
                p: 3,
                textAlign: "left",
                "&:hover": {
                  backgroundColor: "accent.subtle",
                  borderColor: "accent.muted",
                },
              }}
              onClick={() => handleAgentSelect(agent)}
            >
              <Box flex={1}>
                <Text
                  sx={{ fontWeight: "semibold", fontSize: 1, display: "block" }}
                >
                  {agent.name}
                </Text>
                <Text
                  sx={{
                    fontSize: 0,
                    color: "fg.muted",
                    display: "block",
                    mt: 1,
                  }}
                ></Text>
              </Box>
            </Button>
          ))}
        </Box>
      </div>
    </div>
  );
}

export default AgentSelector;
