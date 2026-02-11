import { useState, useEffect } from 'react';
import { Heading, Text, Button, Checkbox, Flash } from '@primer/react';
import { CalendarIcon } from '@primer/octicons-react';
import { platform } from '@tauri-apps/plugin-os';
import type { Calendar, PermissionStatus } from '../types';
import { requestCalendarPermission, getCalendarList, openCalendarSettings } from '../api';

export default function CalendarSettings() {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus | null>(null);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMacOS, setIsMacOS] = useState<boolean>(true);
  const [recheckLoading, setRecheckLoading] = useState(false);

  useEffect(() => {
    const platformName = platform();
    setIsMacOS(platformName === 'macos');
    loadCalendarSettings();
  }, []);

  const loadCalendarSettings = async () => {
    setLoading(true);
    setError(null);

    try {
      const status = await requestCalendarPermission();
      setPermissionStatus(status);

      if (status === 'authorized') {
        const calendarList = await getCalendarList();
        setCalendars(calendarList);

        const saved = localStorage.getItem('selected_calendar_ids');
        if (saved) {
          setSelectedCalendarIds(new Set(JSON.parse(saved)));
        }
      }
    } catch (err) {
      console.error('Failed to load calendar settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to load calendar settings');
    } finally {
      setLoading(false);
    }
  };

  const handleCalendarToggle = (calendarId: string) => {
    const newSelected = new Set(selectedCalendarIds);
    if (newSelected.has(calendarId)) {
      newSelected.delete(calendarId);
    } else {
      newSelected.add(calendarId);
    }
    setSelectedCalendarIds(newSelected);
    localStorage.setItem('selected_calendar_ids', JSON.stringify(Array.from(newSelected)));
  };

  const handleRequestPermission = async () => {
    try {
      const status = await requestCalendarPermission();
      setPermissionStatus(status);

      if (status === 'authorized') {
        await loadCalendarSettings();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request permission');
    }
  };

  const handleRecheckPermission = async () => {
    setRecheckLoading(true);
    setError(null);
    try {
      const status = await requestCalendarPermission();
      setPermissionStatus(status);

      if (status === 'authorized') {
        const calendarList = await getCalendarList();
        setCalendars(calendarList);

        const saved = localStorage.getItem('selected_calendar_ids');
        if (saved) {
          setSelectedCalendarIds(new Set(JSON.parse(saved)));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to recheck permission');
    } finally {
      setRecheckLoading(false);
    }
  };

  const handleOpenSystemSettings = async () => {
    try {
      await openCalendarSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open System Settings');
    }
  };

  if (loading) {
    return (
      <Text sx={{ fontSize: 1, color: "fg.muted" }}>Loading calendar settings...</Text>
    );
  }

  if (error && !permissionStatus) {
    return (
      <Flash variant="danger">{error}</Flash>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <CalendarIcon size={20} />
          <Heading sx={{ fontSize: 2 }}>Calendar Integration</Heading>
        </div>
        <Text sx={{ fontSize: 1, color: "fg.muted", display: "block" }}>
          Connect your system calendars to see events on the Today page
        </Text>
      </div>

      {/* Permission Status */}
      {permissionStatus === 'notdetermined' && (
        <div style={{ marginBottom: '12px' }}>
          <Flash variant="warning" sx={{ mb: 2 }}>
            Calendar access not yet authorized
          </Flash>
          <Text sx={{ fontSize: 1, display: "block", mb: 2 }}>
            Orcas needs permission to access your calendars to show events on the Today page.
          </Text>
          <Button variant="primary" onClick={handleRequestPermission}>
            Request Calendar Access
          </Button>
        </div>
      )}

      {permissionStatus === 'denied' && (
        <div style={{ marginBottom: '12px' }}>
          <Flash variant="danger" sx={{ mb: 2 }}>
            Calendar access denied. Please enable calendar access in System Settings.
          </Flash>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="primary" onClick={handleOpenSystemSettings}>
              Open System Settings
            </Button>
            <Button onClick={handleRecheckPermission} disabled={recheckLoading}>
              {recheckLoading ? 'Checking...' : 'Recheck Permission'}
            </Button>
          </div>
        </div>
      )}

      {permissionStatus === 'restricted' && (
        <div style={{ marginBottom: '12px' }}>
          <Flash variant="warning" sx={{ mb: 2 }}>
            Calendar access is restricted by system policies.
          </Flash>
          <Button onClick={handleRecheckPermission} disabled={recheckLoading}>
            {recheckLoading ? 'Checking...' : 'Recheck Permission'}
          </Button>
        </div>
      )}

      {/* Calendar Selection */}
      {permissionStatus === 'authorized' && (
        <div>
          <Text sx={{ fontSize: 1, fontWeight: "semibold", display: "block", mb: 2 }}>
            Select Calendars
          </Text>

          {calendars.length === 0 ? (
            <Text sx={{ fontSize: 1, color: "fg.muted" }}>No calendars found</Text>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {calendars.map((calendar) => (
                <div
                  key={calendar.id}
                  style={{
                    padding: '12px',
                    backgroundColor: 'var(--bgColor-muted)',
                    borderRadius: '6px',
                    border: '1px solid var(--borderColor-default)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <Checkbox
                    value={calendar.id}
                    checked={selectedCalendarIds.has(calendar.id)}
                    onChange={() => handleCalendarToggle(calendar.id)}
                    aria-label={calendar.title}
                  />
                  <div
                    style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      backgroundColor: calendar.color,
                      flexShrink: 0,
                    }}
                  />
                  <div
                    style={{ flex: 1, cursor: 'pointer' }}
                    onClick={() => handleCalendarToggle(calendar.id)}
                  >
                    <Text sx={{ fontWeight: "semibold", display: "block" }}>
                      {calendar.title}
                    </Text>
                    <Text sx={{ fontSize: 0, color: "fg.muted" }}>
                      {calendar.source}
                    </Text>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: '12px' }}>
            <Text sx={{ fontSize: 0, color: "fg.muted" }}>
              {selectedCalendarIds.size} calendar{selectedCalendarIds.size !== 1 ? 's' : ''} selected
            </Text>
          </div>

          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--borderColor-default)' }}>
            <Text sx={{ fontSize: 0, color: "fg.muted", display: "block", mb: 2 }}>
              If calendar events aren't showing up, try rechecking the permission or resetting it in System Settings.
            </Text>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button size="small" onClick={handleRecheckPermission} disabled={recheckLoading}>
                {recheckLoading ? 'Checking...' : 'Recheck Permission'}
              </Button>
              <Button size="small" onClick={handleOpenSystemSettings}>
                Open System Settings
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Platform Note */}
      {!isMacOS && (
        <div style={{ marginTop: '16px' }}>
          <Flash variant="warning">
            Calendar integration is currently only available on macOS.
          </Flash>
        </div>
      )}
    </div>
  );
}
