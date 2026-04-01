from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class MediaLibraryItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assetId: str
    source: str
    type: str
    status: str
    sourceUrl: str | None = None
    title: str
    recordKind: Literal["asset", "artifact"]
    artifactType: str | None = None
    createdAt: str | None = None
    deleteType: str
    mediaType: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class MediaLibraryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    data: list[MediaLibraryItem]
