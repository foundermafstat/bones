export const platformerPreviewPackageName = "@bones/platformer-preview";

export interface BonesPlatformerPreviewPackage {
  readonly name: typeof platformerPreviewPackageName;
}

export interface PlatformerInputState {
  readonly moveX: number;
  readonly jumpPressed: boolean;
  readonly runHeld?: boolean;
  readonly touchX?: number;
  readonly touchJump?: boolean;
}

export interface PlatformerControllerState {
  readonly x: number;
  readonly y: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly grounded: boolean;
  readonly wasGrounded: boolean;
  readonly landingImpact: number;
  readonly facing: -1 | 1;
  readonly wallContact: "left" | "right" | "none";
  readonly animationState: "idle" | "walk" | "run" | "jump" | "fall" | "land" | "wallSlide";
  readonly cameraX: number;
  readonly cameraY: number;
  readonly debug: PlatformerDebugState;
}

export interface PlatformerPreviewCollider {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly kind: "solid" | "movingPlatform" | "deathZone" | "wallJump";
}

export interface PlatformerPreviewLevelData {
  readonly colliders: readonly PlatformerPreviewCollider[];
  readonly spawnPoints?: readonly { readonly x: number; readonly y: number }[];
  readonly cameraZones?: readonly PlatformerPreviewCollider[];
  readonly animationTriggers?: readonly { readonly x: number; readonly y: number; readonly state: string }[];
}

export interface PlatformerDebugState {
  readonly activeColliders: readonly PlatformerPreviewCollider[];
  readonly touchedDeathZone: boolean;
  readonly activeTrigger?: string;
}

export function createInitialControllerState(x = 0, y = 0): PlatformerControllerState {
  return { x, y, velocityX: 0, velocityY: 0, grounded: true, wasGrounded: true, landingImpact: 0, facing: 1, wallContact: "none", animationState: "idle", cameraX: x, cameraY: y, debug: { activeColliders: [], touchedDeathZone: false } };
}

export function updatePlatformerController(state: PlatformerControllerState, input: PlatformerInputState, dt: number, level?: PlatformerPreviewLevelData): PlatformerControllerState {
  const moveX = input.touchX ?? input.moveX;
  const jumpPressed = input.touchJump ?? input.jumpPressed;
  const velocityX = moveX * (input.runHeld ? 240 : 150);
  const jumpVelocity = jumpPressed && (state.grounded || state.wallContact !== "none") ? -260 : state.velocityY;
  const velocityY = Math.min(320, jumpVelocity + 720 * dt);
  const nextX = state.x + velocityX * dt;
  const nextYRaw = state.y + velocityY * dt;
  const collision = resolveCollisions(nextX, nextYRaw, velocityY, level);
  const y = collision.y;
  const x = collision.x;
  const grounded = collision.grounded || y >= 0;
  const nextVelocityY = grounded ? 0 : velocityY;
  const landingImpact = !state.grounded && grounded && velocityY > 0 ? Math.min(1, velocityY / 320) : 0;
  const nextY = grounded && !level ? 0 : y;
  const facing = velocityX < 0 ? -1 : velocityX > 0 ? 1 : state.facing;
  const activeTrigger = level?.animationTriggers?.find((trigger) => Math.abs(trigger.x - x) < 16 && Math.abs(trigger.y - nextY) < 24)?.state;
  const animationState = landingImpact > 0 ? "land" : activeTrigger === "wallSlide" ? "wallSlide" : selectAnimationState(velocityX, nextVelocityY, grounded, jumpPressed, collision.wallContact);
  const camera = resolveCamera(x, nextY, level);
  return {
    x,
    y: nextY,
    velocityX,
    velocityY: nextVelocityY,
    grounded,
    wasGrounded: state.grounded,
    landingImpact,
    facing,
    wallContact: collision.wallContact,
    animationState,
    cameraX: camera.x,
    cameraY: camera.y,
    debug: { activeColliders: collision.activeColliders, touchedDeathZone: collision.touchedDeathZone, ...(activeTrigger ? { activeTrigger } : {}) }
  };
}

export function toAnimationParameters(state: PlatformerControllerState): Record<string, string | number | boolean> {
  return {
    speed: state.velocityX,
    absSpeed: Math.abs(state.velocityX),
    velocityX: state.velocityX,
    velocityY: state.velocityY,
    grounded: state.grounded,
    wasGrounded: state.wasGrounded,
    landingImpact: state.landingImpact,
    jumpPressed: state.animationState === "jump",
    facing: state.facing,
    wallContact: state.wallContact,
    timeInState: 0
  };
}

function selectAnimationState(velocityX: number, velocityY: number, grounded: boolean, jumpPressed: boolean, wallContact: PlatformerControllerState["wallContact"]): PlatformerControllerState["animationState"] {
  if (!grounded && wallContact !== "none" && velocityY > 20) {
    return "wallSlide";
  }
  if (!grounded && velocityY < 0) {
    return "jump";
  }
  if (!grounded && velocityY >= 0) {
    return "fall";
  }
  if (jumpPressed) {
    return "jump";
  }
  if (Math.abs(velocityX) > 190) {
    return "run";
  }
  return Math.abs(velocityX) > 1 ? "walk" : "idle";
}

function resolveCollisions(
  x: number,
  y: number,
  velocityY: number,
  level?: PlatformerPreviewLevelData
): {
  readonly x: number;
  readonly y: number;
  readonly grounded: boolean;
  readonly wallContact: PlatformerControllerState["wallContact"];
  readonly touchedDeathZone: boolean;
  readonly activeColliders: readonly PlatformerPreviewCollider[];
} {
  const activeColliders = level?.colliders.filter((collider) => intersects(x, y, 14, 34, collider)) ?? [];
  const deathZone = activeColliders.some((collider) => collider.kind === "deathZone");
  const wall = activeColliders.find((collider) => collider.kind === "wallJump");
  const floor = activeColliders.find((collider) => (collider.kind === "solid" || collider.kind === "movingPlatform") && velocityY >= 0 && y <= collider.y + collider.height);
  return {
    x: wall ? (x < wall.x ? wall.x - 14 : wall.x + wall.width + 14) : x,
    y: floor ? floor.y - 34 : y,
    grounded: Boolean(floor),
    wallContact: wall ? (x < wall.x ? "right" : "left") : ("none" as const),
    touchedDeathZone: deathZone,
    activeColliders
  };
}

function resolveCamera(x: number, y: number, level?: PlatformerPreviewLevelData): { readonly x: number; readonly y: number } {
  const zone = level?.cameraZones?.find((cameraZone) => intersects(x, y, 1, 1, cameraZone));
  return zone ? { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 } : { x, y };
}

function intersects(x: number, y: number, width: number, height: number, collider: PlatformerPreviewCollider): boolean {
  return x < collider.x + collider.width && x + width > collider.x && y < collider.y + collider.height && y + height > collider.y;
}
