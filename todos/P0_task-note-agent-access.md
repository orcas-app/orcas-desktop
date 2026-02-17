# Task note agent access

When the user adds content to the task note, it is not immediately available to the agent. In fact reloading the task also doesn't make the new note content.

Update the implementation, so each time a message is sent to the agent, it includes the latest version of the note.