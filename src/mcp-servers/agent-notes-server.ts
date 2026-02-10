#!/usr/bin/env tsx

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import sqlite3 from "sqlite3";
import { getDatabasePath } from "./database-utils.js";

interface AgentNotesArgs {
  task_id: number;
  content?: string;
  operation?: "append" | "replace";
}

interface SpaceContextArgs {
  space_id: number;
  content: string;
  summary?: string;
}

class AgentNotesServer {
  private server: Server;
  private db: sqlite3.Database;

  constructor() {
    this.server = new Server(
      {
        name: "agent-notes-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    // Use the correct database path for the platform
    const dbPath = getDatabasePath();
    this.db = new sqlite3.Database(dbPath);
    this.setupToolHandlers();
  }

  private async queryDatabase<T>(
    sql: string,
    params: any[] = [],
  ): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  private async runDatabase(sql: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private async setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "read_task_notes",
            description: "Read the Agent Notes for a specific task",
            inputSchema: {
              type: "object",
              properties: {
                task_id: {
                  type: "number",
                  description: "The ID of the task to read notes for",
                },
              },
              required: ["task_id"],
            },
          },
          {
            name: "write_task_notes",
            description:
              "Write or append content to the Agent Notes for a specific task",
            inputSchema: {
              type: "object",
              properties: {
                task_id: {
                  type: "number",
                  description: "The ID of the task to write notes for",
                },
                content: {
                  type: "string",
                  description: "The content to write to the notes file",
                },
                operation: {
                  type: "string",
                  enum: ["append", "replace"],
                  description:
                    "Whether to append to existing content or replace it entirely",
                  default: "append",
                },
              },
              required: ["task_id", "content"],
            },
          },
          {
            name: "update_space_context",
            description:
              "Update the shared space context markdown. Use this to record architectural decisions, completed milestones, and space-wide insights.",
            inputSchema: {
              type: "object",
              properties: {
                space_id: {
                  type: "number",
                  description: "The ID of the space to update context for",
                },
                content: {
                  type: "string",
                  description:
                    "The full markdown content for the space context",
                },
                summary: {
                  type: "string",
                  description: "Brief summary of what was changed",
                },
              },
              required: ["space_id", "content"],
            },
          },
        ] satisfies Tool[],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        if (!args) {
          throw new Error("Arguments are required");
        }

        switch (name) {
          case "read_task_notes":
            return await this.readTaskNotes(args as unknown as AgentNotesArgs);
          case "write_task_notes":
            return await this.writeTaskNotes(args as unknown as AgentNotesArgs);
          case "update_space_context":
            return await this.updateSpaceContext(args as unknown as SpaceContextArgs);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
            },
          ],
        };
      }
    });
  }

  private async readTaskNotes(args: AgentNotesArgs) {
    const { task_id } = args;

    try {
      const results = await this.queryDatabase<{ agent_notes: string }>(
        "SELECT agent_notes FROM agent_notes WHERE task_id = ?",
        [task_id],
      );

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No notes exist for task ${task_id}. Use write_task_notes to create them.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: results[0].agent_notes || "",
          },
        ],
      };
    } catch (error) {
      throw error;
    }
  }

  private async writeTaskNotes(args: AgentNotesArgs) {
    const { task_id, content, operation = "append" } = args;

    if (!content) {
      throw new Error("Content is required for write operation");
    }

    try {
      let finalContent = content;

      if (operation === "append") {
        // Get existing content first
        const results = await this.queryDatabase<{ agent_notes: string }>(
          "SELECT agent_notes FROM agent_notes WHERE task_id = ?",
          [task_id],
        );

        if (results.length > 0 && results[0].agent_notes) {
          finalContent = results[0].agent_notes + "\n\n" + content;
        }
      }

      // Use INSERT OR REPLACE to handle both new and existing records
      await this.runDatabase(
        `INSERT OR REPLACE INTO agent_notes (task_id, agent_notes, created_at, updated_at)
         VALUES (?, ?,
           COALESCE((SELECT created_at FROM agent_notes WHERE task_id = ?), CURRENT_TIMESTAMP),
           CURRENT_TIMESTAMP)`,
        [task_id, finalContent, task_id],
      );

      return {
        content: [
          {
            type: "text",
            text: `Successfully ${operation === "append" ? "appended to" : "wrote"} notes for task ${task_id} in database`,
          },
        ],
      };
    } catch (error) {
      throw error;
    }
  }

  private async updateSpaceContext(args: SpaceContextArgs) {
    const { space_id, content, summary } = args;

    if (!content) {
      throw new Error("Content is required for update_space_context");
    }

    try {
      await this.runDatabase(
        "UPDATE spaces SET context_markdown = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [content, space_id],
      );

      return {
        content: [
          {
            type: "text",
            text: `Successfully updated space context for space ${space_id}${summary ? `: ${summary}` : ""}`,
          },
        ],
      };
    } catch (error) {
      throw error;
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Agent Notes MCP server running on stdio");
  }
}

const server = new AgentNotesServer();
server.run().catch(console.error);
