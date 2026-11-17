"""To-do list 'Haushalt': due and overdue chores; checking one off completes it."""

from __future__ import annotations

from datetime import date

from homeassistant.components.todo import TodoItem, TodoItemStatus, TodoListEntity, TodoListEntityFeature
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .api import ChoresError
from .coordinator import ChoresConfigEntry, ChoresCoordinator
from .entity import ChoresEntity


async def async_setup_entry(hass: HomeAssistant, entry: ChoresConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback) -> None:
    async_add_entities([ChoresTodoList(entry.runtime_data)])


class ChoresTodoList(ChoresEntity, TodoListEntity):
    """Only chores that are due right now; future ones live in the app/sensors."""

    # Named after the device → entity id todo.haushalt
    _attr_name = None
    _attr_supported_features = TodoListEntityFeature.UPDATE_TODO_ITEM

    def __init__(self, coordinator: ChoresCoordinator) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.config_entry.entry_id}_todo"

    @property
    def todo_items(self) -> list[TodoItem]:
        items = []
        for c in sorted(self.coordinator.data.due, key=lambda c: (c["status"] != "overdue", c["nextDue"])):
            assignee = (c.get("assignee") or {}).get("name")
            desc = " · ".join(x for x in (c["room"], assignee, c["description"]) if x)
            items.append(
                TodoItem(
                    uid=str(c["id"]),
                    summary=f"{c['icon']} {c['title']}",
                    status=TodoItemStatus.NEEDS_ACTION,
                    due=date.fromisoformat(c["nextDue"]),
                    description=desc or None,
                )
            )
        return items

    async def async_update_todo_item(self, item: TodoItem) -> None:
        if item.status != TodoItemStatus.COMPLETED or item.uid is None:
            return
        try:
            await self.coordinator.api.complete(int(item.uid))
        except ChoresError as err:
            raise HomeAssistantError(f"Konnte Aufgabe nicht erledigen: {err}") from err
        await self.coordinator.async_request_refresh()
