# History storage

History has two persistence layers:

1. `echly_check_ins` remains the source of truth for the daily load result. Its
   JSON payload stores the load condition and components, reflection tasks,
   generated next-day plan, approval status, approved action IDs, audio
   features, and source metadata.
2. `echly_history_transcripts` is the explicit transcript index used by history
   detail pages. It stores both reflection and planning/task inputs without
   requiring the application to inspect a large check-in payload.

## `echly_history_transcripts` columns

| Column | Purpose |
| --- | --- |
| `user_id` | Owner; part of the composite primary key |
| `id` | Check-in or schedule-entry ID; part of the composite primary key |
| `local_date` | Date on which the user made the recording/input |
| `time_zone` | Time zone used to determine `local_date` |
| `kind` | `reflection` or `planning` |
| `transcript` | Confirmed reflection or planning/task transcript |
| `tasks_json` | Tasks/topics extracted from that transcript |
| `created_at` | Original input creation time |
| `updated_at` | Last persistence update time |

Raw audio is not stored. Existing check-in and schedule-entry payloads are
backfilled into this table when the schema is initialized. New records are
upserted into the table whenever a check-in or schedule entry is saved.
The workspace loads up to 365 daily check-ins and 730 transcript entries so
monthly history and direct detail URLs remain useful across a full year.
