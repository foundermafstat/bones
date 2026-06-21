import { Container } from "pixi.js";
import type {
  AnimationParameters,
  BoneRuntime,
  PackedTransform2D,
  PartRuntime,
  RigInstanceOptions,
  RigUpdateState,
  RuntimeCompiledRig
} from "./types.js";
import { RigLoader } from "./RigLoader.js";
import { createPartRenderable } from "./PixiPartRenderer.js";

export class RigInstance {
  readonly container: Container;
  readonly rigContainer: Container;
  readonly bones: readonly BoneRuntime[];
  readonly parts: readonly PartRuntime[];
  readonly compiled: RuntimeCompiledRig;
  readonly options: RigInstanceOptions;

  private elapsed = 0;
  private params: AnimationParameters = {};
  private lastDelta = 0;

  constructor(compiledInput: RuntimeCompiledRig, options: RigInstanceOptions = {}) {
    this.compiled = RigLoader.fromCompiled(compiledInput);
    this.options = options;
    this.container = namedContainer(`Bones:${this.compiled.name}`);
    this.rigContainer = namedContainer("rig");
    this.container.addChild(this.rigContainer);

    this.bones = this.compiled.rig.bones.map((bone) => ({
      id: bone.id,
      parent: bone.parent,
      local: bone.local,
      length: bone.length,
      container: namedContainer(`bone:${bone.id}`)
    }));

    this.parts = this.compiled.rig.parts.map((part) => {
      const rendered = createPartRenderable(part);
      const container = namedContainer(`part:${part.id}`);
      if (rendered) {
        container.addChild(rendered.renderable);
      }
      const runtimePart: PartRuntime = {
        id: part.id,
        bone: part.bone,
        type: part.type,
        drawOrder: part.drawOrder,
        local: part.local,
        container
      };
      if (rendered) {
        return {
          ...runtimePart,
          renderable: rendered.renderable,
          ...(rendered.graphicsContext ? { graphicsContext: rendered.graphicsContext } : {})
        };
      }
      return runtimePart;
    });

    this.buildHierarchy();
    this.applyDefaultTransforms();
  }

  update(dt: number, params: AnimationParameters = {}): RigUpdateState {
    this.lastDelta = dt;
    this.elapsed += dt;
    this.params = params;
    this.applyDefaultTransforms();

    return {
      elapsed: this.elapsed,
      lastDelta: this.lastDelta,
      params: this.params
    };
  }

  getBoneContainer(id: number): Container | undefined {
    return this.bones.find((bone) => bone.id === id)?.container;
  }

  getPartContainer(id: number): Container | undefined {
    return this.parts.find((part) => part.id === id)?.container;
  }

  private buildHierarchy(): void {
    for (const bone of this.bones) {
      if (bone.parent < 0) {
        this.rigContainer.addChild(bone.container);
        continue;
      }

      const parent = this.getBoneContainer(bone.parent);
      if (!parent) {
        throw new Error(`Compiled rig references missing parent bone '${bone.parent}'.`);
      }
      parent.addChild(bone.container);
    }

    for (const part of [...this.parts].sort((a, b) => a.drawOrder - b.drawOrder || a.id - b.id)) {
      const bone = this.getBoneContainer(part.bone);
      if (!bone) {
        throw new Error(`Compiled rig references missing part bone '${part.bone}'.`);
      }
      bone.addChild(part.container);
    }
  }

  private applyDefaultTransforms(): void {
    for (const bone of this.bones) {
      applyTransform(bone.container, bone.local);
    }

    for (const part of this.parts) {
      const source = this.compiled.rig.parts.find((compiledPart) => compiledPart.id === part.id);
      applyTransform(part.container, part.local);
      if (source) {
        part.container.visible = source.visible;
        part.container.alpha = source.opacity;
        part.container.zIndex = source.drawOrder;
      }
    }
  }
}

function namedContainer(label: string): Container {
  const container = new Container();
  container.label = label;
  return container;
}

function applyTransform(container: Container, transform: PackedTransform2D): void {
  container.position.set(transform[0], transform[1]);
  container.rotation = transform[2];
  container.scale.set(transform[3], transform[4]);
  container.skew.set(transform[5], transform[6]);
}
