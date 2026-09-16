from __future__ import annotations

from urllib.parse import urlparse, urlunparse

import aiohttp

from astrbot.api import AstrBotConfig, logger
from astrbot.api.event import AstrMessageEvent, filter
from astrbot.api.message_components import Image
from astrbot.api.star import Context, Star

DEFAULT_QUICK_ROLL_URL = "http://randomhd2:5173/api/quick-roll"
DEFAULT_QUICK_ROLL_IMAGE_URL = "http://randomhd2:5173/api/quick-roll.png"
DEFAULT_STRATAGEMS_URL = "http://randomhd2:5173/api/quick-roll-stratagems"
DEFAULT_STRATAGEMS_IMAGE_URL = "http://randomhd2:5173/api/quick-roll-stratagems.png"


def sibling_url(configured_url: str, fallback: str, path: str) -> str:
    """把已配置地址的主机与端口保留下来，只替换路径。

    这样用户只配了一个地址时，同一台服务上的其他接口也能跟着走对的主机和端口——
    例如容器网络里用 `randomhd2:5173`、跨网络时用宿主网关 `172.18.0.1:5173`，
    都不需要为每个接口单独配置。
    """
    try:
        parsed = urlparse(configured_url)
    except ValueError:
        return fallback

    if not parsed.scheme or not parsed.netloc:
        return fallback

    return urlunparse((parsed.scheme, parsed.netloc, path, "", "", ""))


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
        self.timeout = int(self.config.get("timeout") or 10)

        configured_image = str(
            self.config.get("quick_roll_image_url") or DEFAULT_QUICK_ROLL_IMAGE_URL
        )
        configured_text = str(
            self.config.get("quick_roll_url") or DEFAULT_QUICK_ROLL_URL
        )

        self.quick_roll_image_url = configured_image
        self.quick_roll_url = configured_text
        self.stratagems_image_url = str(
            self.config.get("stratagems_image_url")
            or sibling_url(
                configured_image, DEFAULT_STRATAGEMS_IMAGE_URL, "/api/quick-roll-stratagems.png"
            )
        )
        self.stratagems_url = str(
            self.config.get("stratagems_url")
            or sibling_url(
                configured_text, DEFAULT_STRATAGEMS_URL, "/api/quick-roll-stratagems"
            )
        )

    async def _fetch(self, image_url: str, text_url: str) -> tuple[bytes | None, str | None]:
        """取图，取不到就退化成文本。返回 (图片字节, 文本)。"""
        timeout = aiohttp.ClientTimeout(total=self.timeout)

        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(image_url) as image_response:
                if image_response.status == 200:
                    image_bytes = await image_response.read()
                    content_type = image_response.headers.get("Content-Type", "")
                    if image_bytes and content_type.startswith("image/"):
                        return image_bytes, None

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

            async with session.get(text_url) as response:
                text = (await response.text()).strip()
                if response.status != 200:
                    logger.warning(
                        "RandomHD2 text request failed: status=%s, body=%s",
                        response.status,
                        text[:500],
                    )
                    return None, f"随机失败：RandomHD2 返回 HTTP {response.status}"

        if not text:
            return None, "随机失败：RandomHD2 没有返回内容"

        return None, text

    @filter.command("随机配装")
    async def random_loadout(self, event: AstrMessageEvent):
        """随机一套完整配装（阵营 + 4 战备 + 主副武器 + 手雷）。

        Args:
            event: Incoming AstrBot message event.

        Yields:
            A PNG image result, or a plain-text fallback for the current session.
        """
        try:
            image_bytes, text = await self._fetch(self.quick_roll_image_url, self.quick_roll_url)
        except Exception as exc:
            logger.error("RandomHD2 request error: %s", exc, exc_info=True)
            yield event.plain_result("随机配装失败：无法连接 RandomHD2 服务")
            return

        if image_bytes:
            yield event.chain_result([Image.fromBytes(image_bytes)])
            return

        yield event.plain_result(text or "随机配装失败：无法连接 RandomHD2 服务")

    @filter.command("随机战备")
    async def random_stratagems(self, event: AstrMessageEvent):
        """只随机 4 个战备。

        Args:
            event: Incoming AstrBot message event.

        Yields:
            A PNG image result, or a plain-text fallback for the current session.
        """
        try:
            image_bytes, text = await self._fetch(self.stratagems_image_url, self.stratagems_url)
        except Exception as exc:
            logger.error("RandomHD2 request error: %s", exc, exc_info=True)
            yield event.plain_result("随机战备失败：无法连接 RandomHD2 服务")
            return

        if image_bytes:
            yield event.chain_result([Image.fromBytes(image_bytes)])
            return

        yield event.plain_result(text or "随机战备失败：无法连接 RandomHD2 服务")

    async def terminate(self):
        """Clean up plugin resources."""
        return None
