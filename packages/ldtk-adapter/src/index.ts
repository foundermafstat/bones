export const ldtkAdapterPackageName = "@bones/ldtk-adapter";

export interface BonesLdtkAdapterPackage {
  readonly name: typeof ldtkAdapterPackageName;
}

export interface LdtkEntity {
  readonly __identifier: string;
  readonly px: readonly [number, number];
  readonly width?: number;
  readonly height?: number;
  readonly fieldInstances?: readonly { readonly __identifier: string; readonly __value: unknown }[];
}

export interface LdtkLevel {
  readonly identifier: string;
  readonly layerInstances?: readonly {
    readonly __identifier: string;
    readonly entityInstances?: readonly LdtkEntity[];
  }[];
}

export interface PlatformerCollider {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly kind: "solid" | "movingPlatform" | "deathZone" | "wallJump";
}

export interface PlatformerPreviewLevel {
  readonly id: string;
  readonly colliders: readonly PlatformerCollider[];
  readonly spawnPoints: readonly { readonly id: string; readonly x: number; readonly y: number }[];
  readonly lightEmitters: readonly { readonly x: number; readonly y: number; readonly radius: number }[];
  readonly cameraZones: readonly PlatformerCollider[];
  readonly animationTriggers: readonly { readonly x: number; readonly y: number; readonly state: string }[];
}

export function parseLdtkLevel(level: LdtkLevel): PlatformerPreviewLevel {
  const entities = (level.layerInstances ?? []).flatMap((layer) => layer.entityInstances ?? []);
  return {
    id: level.identifier,
    colliders: entities.flatMap(parseCollider),
    spawnPoints: entities.filter((entity) => entity.__identifier === "Spawn").map((entity) => ({ id: stringField(entity, "id", "player"), x: entity.px[0], y: entity.px[1] })),
    lightEmitters: entities.filter((entity) => entity.__identifier === "Light").map((entity) => ({ x: entity.px[0], y: entity.px[1], radius: numberField(entity, "radius", 64) })),
    cameraZones: entities.filter((entity) => entity.__identifier === "CameraZone").map((entity) => box(entity, "solid")),
    animationTriggers: entities.filter((entity) => entity.__identifier === "AnimationTrigger").map((entity) => ({ x: entity.px[0], y: entity.px[1], state: stringField(entity, "state", "idle") }))
  };
}

function parseCollider(entity: LdtkEntity): PlatformerCollider[] {
  if (entity.__identifier === "Collider") {
    return [box(entity, "solid")];
  }
  if (entity.__identifier === "MovingPlatform") {
    return [box(entity, "movingPlatform")];
  }
  if (entity.__identifier === "DeathZone") {
    return [box(entity, "deathZone")];
  }
  if (entity.__identifier === "WallJumpSurface") {
    return [box(entity, "wallJump")];
  }
  return [];
}

function box(entity: LdtkEntity, kind: PlatformerCollider["kind"]): PlatformerCollider {
  return { x: entity.px[0], y: entity.px[1], width: entity.width ?? 16, height: entity.height ?? 16, kind };
}

function stringField(entity: LdtkEntity, name: string, fallback: string): string {
  const value = entity.fieldInstances?.find((field) => field.__identifier === name)?.__value;
  return typeof value === "string" ? value : fallback;
}

function numberField(entity: LdtkEntity, name: string, fallback: number): number {
  const value = entity.fieldInstances?.find((field) => field.__identifier === name)?.__value;
  return typeof value === "number" ? value : fallback;
}
