"""Constants for the Chores integration."""

from datetime import timedelta

DOMAIN = "chores"

CONF_SCAN_INTERVAL = "scan_interval"
CONF_CHORE_SENSORS = "chore_sensors"

DEFAULT_SCAN_INTERVAL = timedelta(seconds=60)

ATTR_CHORE_ID = "chore_id"
ATTR_USER_ID = "user_id"
ATTR_DAYS = "days"
ATTR_BY = "by"
ATTR_NOTE = "note"
ATTR_CONFIG_ENTRY_ID = "config_entry_id"

SERVICE_COMPLETE = "complete"
SERVICE_SNOOZE = "snooze"
SERVICE_SKIP = "skip"
SERVICE_INCREMENT_COUNTER = "increment_counter"

EVENT_STATUS_CHANGED = f"{DOMAIN}_status_changed"
