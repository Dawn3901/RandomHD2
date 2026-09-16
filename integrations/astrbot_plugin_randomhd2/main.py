from __future__ import annotations

import aiohttp

from astrbot.api import AstrBotConfig, logger
from astrbot.api.event import AstrMessageEvent, filter
from astrbot.api.message_components import Image
from astrbot.api.star import Context, Star

DEFAULT_QUICK_ROLL_URL = "http://randomhd2:5173/api/quick-roll"
DEFAULT_QUICK_ROLL_IMAGE_URL = "http://randomhd2:5173/api/quick-roll.png"


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
        self.quick_roll_image_url = str(
            self.config.get("quick_roll_image_url") or DEFAULT_QUICK_ROLL_IMAGE_URL
        )
        self.timeout = int(self.config.get("timeout") or 10)

    @filter.command("随机配装")
    async def random_loadout(self, event: AstrMessageEvent):
        """Generate a RandomHD2 loadout and reply to the current session.

        Args:
            event: Incoming AstrBot message event.

        Yields:
            A PNG image result, or a plain-text fallback for the current session.
        """
        try:
            timeout = aiohttp.ClientTimeout(total=self.timeout)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(self.quick_roll_image_url) as image_response:
                    if image_response.status == 200:
                        image_bytes = await image_response.read()
                        content_type = image_response.headers.get("Content-Type", "")
                        if image_bytes and content_type.startswith("image/"):
                            yield event.chain_result([Image.fromBytes(image_bytes)])
                            return

                        logger.warning(
                            "RandomHD2 image response was not a usable image: content_type=%s, size=%s",
                            content_type,
                            len(image_bytes),
                        )
                    else:
                        image_error = (await image_response.text()).strip()
                        logger.warning(
                            "RandomHD2 image request failed: status=%s, body=%s",
                            image_response.status,
                            image_error[:500],
                        )

                async with session.get(self.quick_roll_url) as response:
                    text = (await response.text()).strip()
                    if response.status != 200:
                        logger.warning(
                            "RandomHD2 text request failed: status=%s, body=%s",
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
            yield event.plain_result("随机配装失败：无法连接 RandomHD2 服务")

    async def terminate(self):
        """Clean up plugin resources."""
        return None
