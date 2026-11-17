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
ATTR_CLAIM_ID = "claim_id"
ATTR_FROM = "start"
ATTR_UNTIL = "until"
ATTR_MINUTES = "minutes"

SERVICE_COMPLETE = "complete"
SERVICE_SNOOZE = "snooze"
SERVICE_SKIP = "skip"
SERVICE_INCREMENT_COUNTER = "increment_counter"
SERVICE_APPROVE_REWARD = "approve_reward"
SERVICE_REJECT_REWARD = "reject_reward"
SERVICE_START_VACATION = "start_vacation"
SERVICE_END_VACATION = "end_vacation"
SERVICE_GET_PLAN = "get_plan"

EVENT_STATUS_CHANGED = f"{DOMAIN}_status_changed"
EVENT_REWARD_REQUESTED = f"{DOMAIN}_reward_requested"
