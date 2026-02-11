import { useEffect, useState, useCallback, useRef } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Button, Text, Spinner } from "@primer/react";
import { XIcon } from "@primer/octicons-react";

type UpdateState =
  | { kind: "idle" }
  | { kind: "available"; version: string; update: Update }
  | { kind: "downloading"; version: string; progress: number }
  | { kind: "ready"; version: string }
  | { kind: "error"; message: string };

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const INITIAL_DELAY_MS = 5000; // 5 seconds

export default function UpdateNotification() {
  const [state, setState] = useState<UpdateState>({ kind: "idle" });
  const [dismissed, setDismissed] = useState(false);
  const updateRef = useRef<Update | null>(null);

  const checkForUpdate = useCallback(async () => {
    try {
      const update = await check();
      if (update) {
        updateRef.current = update;
        setState({ kind: "available", version: update.version, update });
      }
    } catch (err) {
      console.error("Update check failed:", err);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(checkForUpdate, INITIAL_DELAY_MS);
    const interval = setInterval(checkForUpdate, CHECK_INTERVAL_MS);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [checkForUpdate]);

  const handleDownload = useCallback(async () => {
    const update = updateRef.current;
    if (!update) return;

    const version = update.version;
    setState({ kind: "downloading", version, progress: 0 });

    try {
      let totalLength = 0;
      let downloaded = 0;

      await update.downloadAndInstall((event) => {
        if (event.event === "Started" && event.data.contentLength) {
          totalLength = event.data.contentLength;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (totalLength > 0) {
            const pct = Math.round((downloaded / totalLength) * 100);
            setState({ kind: "downloading", version, progress: pct });
          }
        } else if (event.event === "Finished") {
          setState({ kind: "ready", version });
        }
      });

      // In case the Finished event didn't fire
      setState((prev) => (prev.kind === "downloading" ? { kind: "ready", version } : prev));
    } catch (err) {
      console.error("Update download failed:", err);
      setState({ kind: "error", message: String(err) });
    }
  }, []);

  const handleRestart = useCallback(async () => {
    try {
      await relaunch();
    } catch (err) {
      console.error("Relaunch failed:", err);
    }
  }, []);

  if (dismissed || state.kind === "idle") return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 1000,
        backgroundColor: "var(--bgColor-default, #ffffff)",
        border: "1px solid var(--borderColor-default, #d0d7de)",
        borderRadius: 8,
        padding: "12px 16px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        maxWidth: 400,
      }}
    >
      {state.kind === "available" && (
        <>
          <Text sx={{ fontSize: 1, flexShrink: 0 }}>
            Update available: <strong>v{state.version}</strong>
          </Text>
          <Button size="small" variant="primary" onClick={handleDownload}>
            Download
          </Button>
        </>
      )}

      {state.kind === "downloading" && (
        <>
          <Spinner size="small" />
          <Text sx={{ fontSize: 1 }}>
            Downloading... {state.progress}%
          </Text>
        </>
      )}

      {state.kind === "ready" && (
        <>
          <Text sx={{ fontSize: 1, flexShrink: 0 }}>
            Update v{state.version} ready
          </Text>
          <Button size="small" variant="primary" onClick={handleRestart}>
            Restart now
          </Button>
        </>
      )}

      {state.kind === "error" && (
        <Text sx={{ fontSize: 1, color: "danger.fg" }}>
          Update failed
        </Text>
      )}

      <Button
        size="small"
        variant="invisible"
        icon={XIcon}
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        sx={{ flexShrink: 0 }}
      />
    </div>
  );
}
