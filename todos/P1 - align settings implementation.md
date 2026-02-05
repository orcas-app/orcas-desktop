# Align Settings Implementation

- Currently, the API provider settings are implemented directly in the Settings component, while the calendar settings are in the CalendarSettings component. Decide on and implement a consistent approach to settings (either modular or not)
- Formatting across the settings components is different, align on a single approach to formatting
- Currently there is a save button on the API provider settings, but not really clear if it also saves calendar settings. Ideally settings would autosave rather than require a save button