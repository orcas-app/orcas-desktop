# Improve the Today page

- on the Today page, the left nav is compressed such that is unreadable. update so that the left Nav has a fixed width follwoing other pages
- in the calendar agenda, the details popover that is shown when the agenda item is selected does not scroll
- for Calendar events that contain a video confrencing meeting link, use regex logic to identify the link and add a clickable video confrence icon to the calendar event that directs to the extracted link
- if a video meeting link is successfully extracted from the location, remove that link from the summary of the meeting
- show the attendees on the summary of each meeting shown on the Today page. if there are more than 3 attendees, just show the number of attendees 