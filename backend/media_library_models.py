from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class MediaLibraryIngestMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: Literal["nexus", "upload", "import", "system"]
    stage: Literal["raw", "processed", "structured"]
    original: bool
    convertedFrom: str | None = None
    conversionType: str | None = None


class MediaLibraryItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assetId: str
    type: str
    status: str
    sourceUrl: str | None = None
    title: str
    recordKind: Literal["asset", "artifact"]
    artifactType: str | None = None
    createdAt: str | None = None
    deleteType: str
    mediaType: str
    tags: list[str] = Field(default_factory=list)
    ingestMeta: MediaLibraryIngestMeta
    metadata: dict[str, Any] = Field(default_factory=dict)


class MediaLibraryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    data: list[MediaLibraryItem]


class MediaLibraryItemResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    data: MediaLibraryItem


class MediaLibraryMutationPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    asset: MediaLibraryItem
    deduplicated: bool = False


class MediaLibraryMutationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    data: MediaLibraryMutationPayload


class MediaAssetTagsUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tags: list[str]
