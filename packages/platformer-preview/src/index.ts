export const platformerPreviewPackageName = "@bones/platformer-preview";

export interface BonesPlatformerPreviewPackage {
  readonly name: typeof platformerPreviewPackageName;
}

export interface PlatformerInputState {
  readonly moveX: number;
  readonly jumpPressed: boolean;
}

export interface PlatformerControllerState {
  readonly x: number;
  readonly y: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly grounded: boolean;
  readonly facing: -1 | 1;
  readonly wallContact: "left" | "right" | "none";
  readonly animationState: "idle" | "walk" | "jump" | "fall" | "land" | "wallSlide";
}

export function createInitialControllerState(x = 0, y = 0): PlatformerControllerState {
  return { x, y, velocityX: 0, velocityY: 0, grounded: true, facing: 1, wallContact: "none", animationState: "idle" };
}

export function updatePlatformerController(state: PlatformerControllerState, input: PlatformerInputState, dt: number): PlatformerControllerState {
  const velocityX = input.moveX * 150;
  const jumpVelocity = input.jumpPressed && state.grounded ? -260 : state.velocityY;
  const velocityY = Math.min(320, jumpVelocity + 720 * dt);
  const y = state.y + velocityY * dt;
  const grounded = y >= 0;
  const nextVelocityY = grounded ? 0 : velocityY;
  const nextY = grounded ? 0 : y;
  const facing = velocityX < 0 ? -1 : velocityX > 0 ? 1 : state.facing;
  return {
    x: state.x + velocityX * dt,
    y: nextY,
    velocityX,
    velocityY: nextVelocityY,
    grounded,
    facing,
    wallContact: "none",
    animationState: selectAnimationState(velocityX, nextVelocityY, grounded, input.jumpPressed)
  };
}

export function toAnimationParameters(state: PlatformerControllerState): Record<string, string | number | boolean> {
  return {
    speed: state.velocityX,
    absSpeed: Math.abs(state.velocityX),
    velocityX: state.velocityX,
    velocityY: state.velocityY,
    grounded: state.grounded,
    jumpPressed: state.animationState === "jump",
    facing: state.facing,
    wallContact: state.wallContact
  };
}

function selectAnimationState(velocityX: number, velocityY: number, grounded: boolean, jumpPressed: boolean): PlatformerControllerState["animationState"] {
  if (!grounded && velocityY < 0) {
    return "jump";
  }
  if (!grounded && velocityY >= 0) {
    return "fall";
  }
  if (jumpPressed) {
    return "jump";
  }
  return Math.abs(velocityX) > 1 ? "walk" : "idle";
}
