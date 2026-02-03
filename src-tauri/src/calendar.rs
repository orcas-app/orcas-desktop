//! macOS EventKit calendar integration
//! Provides access to system calendars and events

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Calendar {
    pub id: String,
    pub title: String,
    pub color: String,
    pub source: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CalendarEvent {
    pub id: String,
    pub title: String,
    pub start_date: String,
    pub end_date: String,
    pub is_all_day: bool,
    pub location: Option<String>,
    pub notes: Option<String>,
    pub url: Option<String>,
    pub attendees: Vec<String>,
    pub calendar_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PermissionStatus {
    NotDetermined,
    Restricted,
    Denied,
    Authorized,
}

#[cfg(target_os = "macos")]
pub mod macos {
    use super::*;
    use objc::runtime::{Class, Object};
    use objc::{msg_send, sel, sel_impl};

    /// Request calendar access permission from the user
    pub async fn request_calendar_permission() -> Result<PermissionStatus, String> {
        use std::sync::{Arc, Mutex};
        use std::time::Duration;
        use block::ConcreteBlock;
        use cocoa::base::{id, nil};
        use tokio::sync::oneshot;

        unsafe {
            let event_store_class = Class::get("EKEventStore")
                .ok_or("Failed to get EKEventStore class")?;

            // Get authorization status
            let status: isize = msg_send![event_store_class, authorizationStatusForEntityType: 0]; // 0 = EKEntityTypeEvent

            match status {
                0 => {
                    // Not determined - request access
                    let event_store: *mut Object = msg_send![event_store_class, new];

                    // Create oneshot channel to receive result
                    let (tx, rx) = oneshot::channel::<bool>();
                    let tx = Arc::new(Mutex::new(Some(tx)));

                    // Create block in a scope so it's dropped before we await
                    {
                        let block = ConcreteBlock::new(move |granted: bool, _error: id| {
                            if let Ok(mut tx_opt) = tx.lock() {
                                if let Some(tx) = tx_opt.take() {
                                    let _ = tx.send(granted);
                                }
                            }
                        });
                        let block = block.copy();

                        // Request access - Objective-C will retain the block
                        let _: () = msg_send![event_store, requestAccessToEntityType:0 completion:&*block];

                        // Block is dropped here, but Objective-C has retained it
                    }

                    // Now await for the result (block is no longer held)
                    match tokio::time::timeout(Duration::from_secs(30), rx).await {
                        Ok(Ok(granted)) => Ok(if granted {
                            PermissionStatus::Authorized
                        } else {
                            PermissionStatus::Denied
                        }),
                        Ok(Err(_)) => Err("Permission request channel closed unexpectedly".to_string()),
                        Err(_) => Err("Permission request timed out".to_string()),
                    }
                }
                1 => Ok(PermissionStatus::Restricted),
                2 => Ok(PermissionStatus::Denied),
                3 => Ok(PermissionStatus::Authorized),
                _ => Err("Unknown authorization status".to_string()),
            }
        }
    }

    /// Get list of available calendars
    pub fn get_calendar_list() -> Result<Vec<Calendar>, String> {
        unsafe {
            let event_store_class = Class::get("EKEventStore")
                .ok_or("Failed to get EKEventStore class")?;
            let event_store: *mut Object = msg_send![event_store_class, new];

            // Check authorization first
            let status: isize = msg_send![event_store_class, authorizationStatusForEntityType: 0];
            if status != 3 {
                // Not authorized
                return Err("Calendar access not authorized".to_string());
            }

            // Get calendars for events
            let calendars: *mut Object = msg_send![event_store, calendarsForEntityType: 0];
            let count: usize = msg_send![calendars, count];

            let mut result = Vec::new();
            for i in 0..count {
                let calendar: *mut Object = msg_send![calendars, objectAtIndex: i];

                // Get calendar properties
                let cal_id: *mut Object = msg_send![calendar, calendarIdentifier];
                let title: *mut Object = msg_send![calendar, title];
                let source: *mut Object = msg_send![calendar, source];
                let source_title: *mut Object = msg_send![source, title];
                let color: *mut Object = msg_send![calendar, color];

                // Convert NSString to Rust String
                let cal_id_str = nsstring_to_string(cal_id);
                let title_str = nsstring_to_string(title);
                let source_str = nsstring_to_string(source_title);

                // Convert UIColor/NSColor to hex string
                let color_str = color_to_hex(color);

                result.push(Calendar {
                    id: cal_id_str,
                    title: title_str,
                    color: color_str,
                    source: source_str,
                });
            }

            Ok(result)
        }
    }

    /// Fetch events for a specific date from selected calendars
    pub fn get_events_for_date(
        calendar_ids: Vec<String>,
        date: String,
    ) -> Result<Vec<CalendarEvent>, String> {
        unsafe {
            let event_store_class = Class::get("EKEventStore")
                .ok_or("Failed to get EKEventStore class")?;
            let event_store: *mut Object = msg_send![event_store_class, new];

            // Check authorization
            let status: isize = msg_send![event_store_class, authorizationStatusForEntityType: 0];
            if status != 3 {
                return Err("Calendar access not authorized".to_string());
            }

            // Parse date string (format: YYYY-MM-DD)
            let date_parts: Vec<&str> = date.split('-').collect();
            if date_parts.len() != 3 {
                return Err("Invalid date format, expected YYYY-MM-DD".to_string());
            }

            // Create start and end dates for the day
            let calendar_class = Class::get("NSCalendar").ok_or("Failed to get NSCalendar")?;
            let current_calendar: *mut Object = msg_send![calendar_class, currentCalendar];

            let date_components_class = Class::get("NSDateComponents")
                .ok_or("Failed to get NSDateComponents")?;
            let components: *mut Object = msg_send![date_components_class, new];

            let year: isize = date_parts[0].parse().map_err(|_| "Invalid year")?;
            let month: isize = date_parts[1].parse().map_err(|_| "Invalid month")?;
            let day: isize = date_parts[2].parse().map_err(|_| "Invalid day")?;

            let _: () = msg_send![components, setYear: year];
            let _: () = msg_send![components, setMonth: month];
            let _: () = msg_send![components, setDay: day];
            let _: () = msg_send![components, setHour: 0];
            let _: () = msg_send![components, setMinute: 0];
            let _: () = msg_send![components, setSecond: 0];

            let start_date: *mut Object = msg_send![current_calendar, dateFromComponents: components];

            // End date is start of next day
            let end_components: *mut Object = msg_send![date_components_class, new];
            let _: () = msg_send![end_components, setDay: 1];
            let end_date: *mut Object =
                msg_send![current_calendar, dateByAddingComponents:end_components toDate:start_date options:0];

            // Get all calendars
            let all_calendars: *mut Object = msg_send![event_store, calendarsForEntityType: 0];

            // Filter calendars by provided IDs
            let mut selected_calendars = Vec::new();

            let count: usize = msg_send![all_calendars, count];
            for i in 0..count {
                let calendar: *mut Object = msg_send![all_calendars, objectAtIndex: i];
                let cal_id: *mut Object = msg_send![calendar, calendarIdentifier];
                let cal_id_str = nsstring_to_string(cal_id);

                if calendar_ids.contains(&cal_id_str) {
                    selected_calendars.push(calendar);
                }
            }

            if selected_calendars.is_empty() {
                return Ok(Vec::new());
            }

            // Create NSArray from selected calendars
            let ns_array_class = Class::get("NSArray").ok_or("Failed to get NSArray")?;
            let calendars_array: *mut Object = msg_send![ns_array_class, arrayWithObjects:selected_calendars.as_ptr() count:selected_calendars.len()];

            // Create predicate for events
            let predicate: *mut Object = msg_send![event_store,
                predicateForEventsWithStartDate:start_date
                endDate:end_date
                calendars:calendars_array
            ];

            // Fetch events
            let events: *mut Object = msg_send![event_store, eventsMatchingPredicate: predicate];
            let event_count: usize = msg_send![events, count];

            let mut result = Vec::new();
            for i in 0..event_count {
                let event: *mut Object = msg_send![events, objectAtIndex: i];

                // Extract event properties
                let event_id: *mut Object = msg_send![event, eventIdentifier];
                let title: *mut Object = msg_send![event, title];
                let start: *mut Object = msg_send![event, startDate];
                let end: *mut Object = msg_send![event, endDate];
                let is_all_day: bool = msg_send![event, isAllDay];
                let location: *mut Object = msg_send![event, location];
                let notes: *mut Object = msg_send![event, notes];
                let url: *mut Object = msg_send![event, URL];
                let calendar: *mut Object = msg_send![event, calendar];
                let cal_id: *mut Object = msg_send![calendar, calendarIdentifier];

                result.push(CalendarEvent {
                    id: nsstring_to_string(event_id),
                    title: nsstring_to_string(title),
                    start_date: nsdate_to_iso_string(start),
                    end_date: nsdate_to_iso_string(end),
                    is_all_day,
                    location: nsstring_to_option(location),
                    notes: nsstring_to_option(notes),
                    url: nsurl_to_option(url),
                    attendees: get_attendees(event),
                    calendar_id: nsstring_to_string(cal_id),
                });
            }

            Ok(result)
        }
    }

    // Helper functions

    unsafe fn nsstring_to_string(ns_string: *mut Object) -> String {
        if ns_string.is_null() {
            return String::new();
        }
        let utf8: *const u8 = msg_send![ns_string, UTF8String];
        let c_str = std::ffi::CStr::from_ptr(utf8 as *const i8);
        c_str.to_string_lossy().into_owned()
    }

    unsafe fn nsstring_to_option(ns_string: *mut Object) -> Option<String> {
        if ns_string.is_null() {
            None
        } else {
            Some(nsstring_to_string(ns_string))
        }
    }

    unsafe fn nsurl_to_option(ns_url: *mut Object) -> Option<String> {
        if ns_url.is_null() {
            None
        } else {
            let url_string: *mut Object = msg_send![ns_url, absoluteString];
            Some(nsstring_to_string(url_string))
        }
    }

    unsafe fn nsdate_to_iso_string(ns_date: *mut Object) -> String {
        if ns_date.is_null() {
            return String::new();
        }

        // Get time interval since 1970
        let time_interval: f64 = msg_send![ns_date, timeIntervalSince1970];

        // Convert to chrono DateTime
        use chrono::{Utc, TimeZone};
        let dt = Utc.timestamp_opt(time_interval as i64, (time_interval.fract() * 1_000_000_000.0) as u32)
            .single()
            .unwrap_or_else(|| Utc.timestamp_opt(0, 0).unwrap());

        dt.to_rfc3339()
    }

    unsafe fn color_to_hex(color: *mut Object) -> String {
        if color.is_null() {
            return "#3B82F6".to_string(); // Default blue
        }

        // Get RGB components
        let mut r: f64 = 0.0;
        let mut g: f64 = 0.0;
        let mut b: f64 = 0.0;
        let mut a: f64 = 0.0;

        let _: () = msg_send![color, getRed:&mut r green:&mut g blue:&mut b alpha:&mut a];

        format!(
            "#{:02X}{:02X}{:02X}",
            (r * 255.0) as u8,
            (g * 255.0) as u8,
            (b * 255.0) as u8
        )
    }

    unsafe fn get_attendees(event: *mut Object) -> Vec<String> {
        let attendees: *mut Object = msg_send![event, attendees];
        if attendees.is_null() {
            return Vec::new();
        }

        let count: usize = msg_send![attendees, count];
        let mut result = Vec::new();

        for i in 0..count {
            let attendee: *mut Object = msg_send![attendees, objectAtIndex: i];
            let name: *mut Object = msg_send![attendee, name];
            if !name.is_null() {
                result.push(nsstring_to_string(name));
            }
        }

        result
    }
}

#[cfg(not(target_os = "macos"))]
pub mod macos {
    use super::*;

    pub async fn request_calendar_permission() -> Result<PermissionStatus, String> {
        Err("Calendar integration is only available on macOS".to_string())
    }

    pub fn get_calendar_list() -> Result<Vec<Calendar>, String> {
        Err("Calendar integration is only available on macOS".to_string())
    }

    pub fn get_events_for_date(
        _calendar_ids: Vec<String>,
        _date: String,
    ) -> Result<Vec<CalendarEvent>, String> {
        Err("Calendar integration is only available on macOS".to_string())
    }
}
