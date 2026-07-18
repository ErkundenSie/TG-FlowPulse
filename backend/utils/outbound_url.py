from __future__ import annotations

import ipaddress
import os
import socket
from urllib.parse import urlsplit


def _private_outbound_urls_allowed() -> bool:
    value = os.getenv("APP_ALLOW_PRIVATE_OUTBOUND_URLS", "").strip().lower()
    return value in {"1", "true", "yes", "on"}


def validate_outbound_http_url(url: str) -> str:
    value = str(url or "").strip()
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("URL 必须是 http(s) 绝对地址")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("URL 不允许包含用户名或密码")
    if _private_outbound_urls_allowed():
        return value

    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        addresses = {
            item[4][0]
            for item in socket.getaddrinfo(
                parsed.hostname,
                port,
                type=socket.SOCK_STREAM,
            )
        }
    except (OSError, ValueError) as exc:
        raise ValueError("URL 主机无法解析") from exc

    if not addresses:
        raise ValueError("URL 主机无法解析")
    for address in addresses:
        ip = ipaddress.ip_address(address)
        if not ip.is_global:
            raise ValueError(
                "URL 不允许指向本机、内网、链路本地或其他非公网地址；"
                "如确需访问可信内网服务，请设置 APP_ALLOW_PRIVATE_OUTBOUND_URLS=true"
            )
    return value
