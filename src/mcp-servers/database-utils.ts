// Shared utility for getting the correct database path across platforms
import { homedir } from 'os';
import { join } from 'path';

export function getDatabasePath(): string {
  const platform = process.platform;

  switch (platform) {
    case 'darwin': // macOS
      return join(homedir(), 'Library', 'Application Support', 'com.orcas', 'kanban.db');
    case 'win32': // Windows
      return join(homedir(), 'AppData', 'Roaming', 'com.orcas', 'kanban.db');
    case 'linux': // Linux
      return join(homedir(), '.local', 'share', 'com.orcas', 'kanban.db');
    default:
      // Fallback to Linux path for unknown platforms
      return join(homedir(), '.local', 'share', 'com.orcas', 'kanban.db');
  }
}