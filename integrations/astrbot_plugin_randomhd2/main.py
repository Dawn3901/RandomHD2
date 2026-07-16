from __future__ import annotations

from typing import Any

import aiohttp

from astrbot.api import AstrBotConfig, logger
from astrbot.api.event import AstrMessageEvent, filter
from astrbot.api.star import Context, Star

DEFAULT_QUICK_ROLL_URL = "http://randomhd2:5173/api/quick-roll"


class RandomHD2Plugin(Star):
    """RandomHD2 QQ command bridge."""

    def __init__(self, context: Context, config: AstrBotConfig):
        """Initialize the RandomHD2 bridge plugin.

        Args:
            context: AstrBot plugin context.
            config: Plugin configuration generated from `_conf_schema.json`.
        """
        super().__init__(context)
        self.config = config
        self.quick_roll_url = str(
            self.config.get("quick_roll_url") or DEFAULT_QUICK_ROLL_URL
        )
        self.timeout = int(self.config.get("timeout") or 10)

    @filter.command("随机配装")
    async def random_loadout(self, event: AstrMessageEvent):
        """Generate a RandomHD2 loadout and reply to the current session.

        Args:
            event: Incoming AstrBot message event.

        Yields:
            Plain text result for the current session.
        """
        try:
            timeout = aiohttp.ClientTimeout(total=self.timeout)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(self.quick_roll_url) as response:
                    text = (await response.text()).strip()
                    if response.status != 200:
                        logger.warning(
                            "RandomHD2 request failed: status=%s, body=%s",
                            response.status,
                            text[:500],
                        )
                        yield event.plain_result(
                            f"随机配装失败：RandomHD2 返回 HTTP {response.status}"
                        )
                        return

            if not text:
                yield event.plain_result("随机配装失败：RandomHD2 没有返回内容")
                return

            yield event.plain_result(text)
        except Exception as exc:
            logger.error("RandomHD2 request error: %s", exc, exc_info=True)
            yield event.plain_result(f"随机配装失败：{exc}")

    async def terminate(self):
        """Clean up plugin resources."""
        return None
