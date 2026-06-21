Ниже — технический документ для разработки собственного **визуального редактора векторного силуэтного персонажа и анимаций** под **PixiJS 8 + 2D web platformer + LDtk**.

# Technical Design Document

## Custom Vector Rig Animation Editor for PixiJS Platformers

Рабочее название инструмента: **Silhouette Rig Studio**.

Цель: создать собственный редактор, который позволит собирать живого 2D-персонажа из векторных частей, редактировать формы, ставить ключи на таймлайне, управлять переходами между состояниями, экспортировать всё в чистый JSON и использовать результат в PixiJS 8-платформерах без Spine, Rive и других платных рантаймов.

---

# 1. Главная идея

Персонаж не является PNG-спрайтом и не является набором пиксельных кадров. Он собирается из отдельных векторных частей:

```txt
PlayerRig
  root
    body
    chest
    pelvis
    head
    shoulderFront
    upperArmFront
    forearmFront
    handFront
    shoulderBack
    upperArmBack
    forearmBack
    handBack
    thighFront
    shinFront
    footFront
    thighBack
    shinBack
    footBack
    cloak
    hair
    horns / hood / scarf / tail
```

Каждая часть — это либо:

```txt
1. vector path
2. procedural shape
3. mesh-deformed shape
4. imported SVG path
5. generated PixiJS GraphicsContext
```

В PixiJS удобно строить персонажа как иерархию `Container`, потому что `Container` является базовым элементом scene graph и позволяет группировать объекты, применять трансформации и строить вложенные структуры. Это хорошо совпадает с идеей rig-системы: `root -> bone container -> shape part`. ([PixiJS][1])

PixiJS `Graphics` подходит для рисования форм, кастомных полигонов, примитивов, масок, заливок и сложных векторных объектов. Для нашего персонажа это основная база: руки, ноги, корпус, голова и плащ могут быть описаны как гладкие кривые и формы. ([PixiJS][2])

---

# 2. Что именно мы разрабатываем

Нужно разработать не просто runtime для персонажа, а полноценный инструмент из трёх частей:

```txt
1. Visual Editor
   Визуальный web-редактор rig, форм, поз, анимаций, таймлайна и state machine.

2. Runtime Engine
   Лёгкая библиотека для PixiJS 8, которая загружает JSON и проигрывает персонажа в игре.

3. Export / Import Standard
   Версионированный JSON-формат, пригодный для переиспользования в разных PixiJS 2D-платформерах.
```

Итоговый пайплайн:

```txt
Artist / Developer
    ↓
Silhouette Rig Studio
    ↓
hero.rig.json
hero.animations.json
hero.state-machine.json
hero.compiled.json
    ↓
PixiJS Platformer Runtime
    ↓
живой персонаж в игре
```

---

# 3. Главные требования

## 3.1. Визуальные требования

Персонаж должен выглядеть как **живой анимационный силуэт**, а не как набор шарнирных палок.

Качество достигается за счёт:

```txt
- мягких органических контуров;
- плавных tapered limbs: руки и ноги с разной толщиной по длине;
- squash/stretch при прыжках и приземлениях;
- вторичной анимации плаща, волос, капюшона, хвоста;
- микродвижений в idle;
- плавного blending между состояниями;
- правильной инерции при разворотах;
- реакции на скорость, приземление, падение, стену, склон;
- foot lock и IK для ног;
- pose overlap: тело уже повернулось, а плащ и руки догоняют позже.
```

## 3.2. Технические требования

```txt
- PixiJS 8 runtime.
- JSON-first формат.
- TypeScript.
- Без Spine/Rive.
- Без обязательного backend.
- Редактор работает в браузере.
- Проект можно сохранить локально.
- Runtime не должен зависеть от React.
- Runtime должен быть лёгким и пригодным для mobile web.
- Анимации должны быть смешиваемыми.
- Переходы между состояниями должны быть управляемыми.
- Поддержка procedural animation layers.
- Поддержка LDtk preview-сцен для проверки платформерной анимации.
```

PixiJS `Assets` умеет загружать JSON и SVG, что полезно для нашего формата: редактор может экспортировать JSON, а runtime может загружать его через стандартную систему загрузки ассетов PixiJS. ([PixiJS][3])

LDtk подходит для уровней, потому что его данные хранятся в JSON, а официальный JSON-формат документирован и версионируется. Важно учитывать, что формат LDtk может эволюционировать между версиями, поэтому адаптер LDtk должен быть отдельным модулем, а не частью core animation runtime. ([LDtk][4])

---

# 4. Архитектура проекта

Рекомендуемая структура monorepo:

```txt
silhouette-rig-studio/
  apps/
    editor/
      src/
        app/
        canvas/
        panels/
        timeline/
        graph-editor/
        state-machine/
        preview/
        stores/
        commands/
        ui/
  
  packages/
    runtime-pixi/
      src/
        RigInstance.ts
        RigLoader.ts
        AnimationMixer.ts
        StateMachine.ts
        TransformSolver.ts
        ConstraintSolver.ts
        ProceduralLayers.ts
        PixiRenderer.ts

    schema/
      src/
        rig.schema.json
        animation.schema.json
        state-machine.schema.json
        compiled.schema.json
        types.ts
        validators.ts
        migrations/

    compiler/
      src/
        compileRig.ts
        optimizeCurves.ts
        flattenKeyframes.ts
        buildLookupTables.ts
        validateProject.ts

    vector-core/
      src/
        PathModel.ts
        PathParser.ts
        PathNormalizer.ts
        ShapeFactory.ts
        MeshDeformer.ts
        SvgImporter.ts

    ldtk-adapter/
      src/
        loadLdtk.ts
        parseColliders.ts
        parseSpawnPoints.ts
        parseLightEmitters.ts
        previewSceneBuilder.ts

    platformer-preview/
      src/
        CharacterController.ts
        CollisionWorld.ts
        TouchJoystickSimulator.ts
        Camera2D.ts
```

---

# 5. Разделение на Editor JSON и Runtime JSON

Нужно сразу разделить два формата.

## 5.1. Source JSON

Это формат редактора. Он человекочитаемый, удобный для Git, редактирования, миграций и переиспользования.

```txt
hero.rig.json
hero.animations.json
hero.state-machine.json
```

Он хранит:

```txt
- имена костей;
- иерархию;
- shape paths;
- control points;
- keyframes;
- curves;
- comments;
- editor metadata;
- слои;
- state machine;
- preview settings;
- pose library.
```

## 5.2. Compiled JSON

Это формат для игры. Он компактнее и быстрее загружается.

```txt
hero.compiled.json
```

Он хранит:

```txt
- flatten bone arrays;
- numeric ids instead of string ids;
- pre-parsed curve data;
- optimized keyframe arrays;
- packed transform channels;
- prebuilt state machine lookup;
- optional stripped editor metadata.
```

В игре лучше использовать именно `compiled.json`, а не исходные редакторские JSON.

---

# 6. Core data model

## 6.1. Project

```ts
type RigProject = {
  schemaVersion: string;
  projectId: string;
  name: string;
  runtimeTarget: "pixi-v8";
  units: "pixels";
  defaultFrameRate: number;

  rig: RigDefinition;
  animations: AnimationClip[];
  stateMachine: AnimationStateMachine;
  poseLibrary?: PoseDefinition[];
  proceduralPresets?: ProceduralPreset[];
  editor?: EditorMetadata;
};
```

Пример:

```json
{
  "schemaVersion": "1.0.0",
  "projectId": "hero-shadow-v1",
  "name": "Shadow Hero",
  "runtimeTarget": "pixi-v8",
  "units": "pixels",
  "defaultFrameRate": 60,
  "rig": {},
  "animations": [],
  "stateMachine": {},
  "poseLibrary": []
}
```

---

# 7. Rig system

## 7.1. Bone

Кость — это логическая точка трансформации. Она не обязана быть видимой.

```ts
type BoneDefinition = {
  id: string;
  name: string;
  parentId: string | null;

  local: Transform2D;
  length?: number;

  inheritRotation?: boolean;
  inheritScale?: boolean;

  mirrorGroup?: string;
  tags?: string[];
};
```

```ts
type Transform2D = {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  skewX?: number;
  skewY?: number;
};
```

Пример:

```json
{
  "id": "upperArmFront",
  "name": "Upper Arm Front",
  "parentId": "chest",
  "local": {
    "x": 14,
    "y": -6,
    "rotation": 0.2,
    "scaleX": 1,
    "scaleY": 1
  },
  "length": 28,
  "mirrorGroup": "arms"
}
```

---

## 7.2. Part

Part — это видимая векторная часть, прикреплённая к кости.

```ts
type PartDefinition = {
  id: string;
  name: string;
  boneId: string;

  type: "path" | "procedural" | "mesh" | "svg";
  zIndex: number;

  fill: FillStyleDefinition;
  opacity?: number;

  pivot?: Vec2;
  local?: Transform2D;

  path?: PathShapeDefinition;
  procedural?: ProceduralShapeDefinition;
  mesh?: MeshShapeDefinition;
  svg?: SvgShapeDefinition;

  deformChannels?: DeformChannelDefinition[];
  tags?: string[];
};
```

Для одноцветного силуэта почти все части используют одинаковую заливку:

```json
{
  "fill": {
    "type": "solid",
    "color": "#050505"
  }
}
```

---

# 8. Vector path format

Нужно не хранить “сырые” PixiJS-команды как код. Нужно хранить нейтральную структуру, которую можно импортировать, экспортировать, валидировать и конвертировать в PixiJS.

## 8.1. Path commands

```ts
type PathCommand =
  | { cmd: "M"; x: number; y: number }
  | { cmd: "L"; x: number; y: number }
  | { cmd: "Q"; cpx: number; cpy: number; x: number; y: number }
  | { cmd: "C"; cp1x: number; cp1y: number; cp2x: number; cp2y: number; x: number; y: number }
  | { cmd: "Z" };
```

Пример tapered arm:

```json
{
  "id": "upperArmFrontShape",
  "closed": true,
  "commands": [
    { "cmd": "M", "x": 0, "y": -5 },
    { "cmd": "C", "cp1x": 10, "cp1y": -8, "cp2x": 22, "cp2y": -6, "x": 30, "y": -3 },
    { "cmd": "C", "cp1x": 34, "cp1y": -1, "cp2x": 34, "cp2y": 4, "x": 30, "y": 6 },
    { "cmd": "C", "cp1x": 18, "cp1y": 9, "cp2x": 8, "cp2y": 7, "x": 0, "y": 4 },
    { "cmd": "Z" }
  ]
}
```

---

# 9. Почему лучше свой path format, а не просто SVG string

SVG можно поддерживать как импорт, но внутренний формат лучше держать собственным.

Причина:

```txt
- проще валидировать;
- проще делать morph/deform;
- проще редактировать контрольные точки;
- проще делать timeline tracks на отдельные точки;
- проще компилировать в runtime format;
- проще мигрировать формат между версиями.
```

PixiJS действительно поддерживает SVG двумя способами: как текстуру и как Graphics. При использовании Graphics можно сохранить масштабируемость, а `GraphicsContext` помогает переиспользовать распарсенные данные и не парсить SVG многократно. Но сложные SVG могут быть дорогими на этапе парсинга, поэтому для runtime лучше не парсить тяжёлые SVG каждый кадр. ([PixiJS][5])

---

# 10. Shape types

## 10.1. `path`

Ручная форма из команд `M/L/Q/C/Z`.

Использовать для:

```txt
- головы;
- корпуса;
- рук;
- ног;
- ступней;
- кистей;
- рогов;
- капюшона.
```

## 10.2. `procedural`

Форма генерируется из параметров.

Пример:

```json
{
  "type": "taperedLimb",
  "length": 32,
  "startWidth": 9,
  "endWidth": 5,
  "bend": 0.18,
  "softness": 0.75
}
```

Использовать для быстрого создания:

```txt
- рук;
- ног;
- пальцев;
- хвоста;
- антенн;
- декоративных силуэтных элементов.
```

## 10.3. `mesh`

Форма с вершинами и треугольниками.

Использовать для:

```txt
- плаща;
- волос;
- ткани;
- шарфа;
- хвоста;
- мягких частей, которые должны деформироваться каждый кадр.
```

Для плаща лучше использовать не постоянный перерисованный `Graphics`, а mesh с обновлением вершин. Тогда форма может красиво “дышать”, догонять движение тела и реагировать на прыжок.

## 10.4. `svg`

Импортированный SVG path.

Использовать для:

```txt
- стартовых силуэтных форм;
- логотипоподобных деталей;
- декоративных частей;
- прототипирования.
```

После импорта SVG желательно конвертировать во внутренний `path` или `mesh`.

---

# 11. Editor UI

## 11.1. Главные режимы редактора

```txt
1. Rig Mode
   Создание костей, pivot points, иерархии, attach points.

2. Shape Mode
   Редактирование векторных частей персонажа.

3. Pose Mode
   Создание статических поз.

4. Timeline Mode
   Keyframe-анимация.

5. Curve Mode
   Точное редактирование easing и interpolation.

6. State Machine Mode
   Переходы между idle/walk/run/jump/fall/land.

7. Procedural Mode
   Настройка breathing, cloth, hair, squash/stretch, foot IK.

8. Preview Mode
   Проверка в платформерной сцене с joystick input и LDtk-уровнем.
```

---

## 11.2. Layout редактора

```txt
┌───────────────────────────────────────────────────────────────┐
│ Top Toolbar                                                    │
│ Play | Pause | Record | Auto Key | Snap | FPS | Export         │
├───────────────┬─────────────────────────────────┬─────────────┤
│ Hierarchy     │ Canvas / Pixi Preview            │ Inspector   │
│               │                                 │             │
│ root          │    character rig                 │ Transform   │
│ body          │    bones overlay                 │ Shape       │
│ head          │    onion skin                    │ Constraints │
│ armFront      │    light preview                 │ Curves      │
│ cloak         │                                 │ Procedural  │
├───────────────┴─────────────────────────────────┴─────────────┤
│ Timeline / Dopesheet / Graph Editor                            │
│ tracks, keys, curves, events, markers                           │
└───────────────────────────────────────────────────────────────┘
```

---

# 12. Rig Mode

В этом режиме создаётся скелет персонажа.

## Возможности

```txt
- добавить bone;
- удалить bone;
- переименовать bone;
- поменять parent;
- переместить pivot;
- показать local/world transform;
- включить mirror editing;
- назначить bone tags;
- настроить draw order;
- задать default pose;
- задать facing direction.
```

## Важное правило

Кость не обязана совпадать с анатомией идеально. Для красивого силуэта иногда лучше иметь дополнительные control bones:

```txt
cloakRoot
cloakTipA
cloakTipB
hairRoot
hairTip
hoodBack
chestSquash
pelvisSquash
```

---

# 13. Shape Mode

Этот режим отвечает за красоту персонажа.

## 13.1. Инструменты формы

```txt
- Pen tool;
- Bezier handles;
- Convert point: sharp / smooth;
- Simplify path;
- Smooth path;
- Mirror path;
- Normalize path direction;
- Set pivot from selection;
- Bind shape to bone;
- Preview fill;
- Show silhouette overlap;
- Boolean-like merge preview;
- Export selected part as reusable preset.
```

## 13.2. Принцип красивого силуэта

Нельзя делать руку как капсулу одинаковой толщины. Нужно делать органический taper:

```txt
плечо шире → локоть уже → кисть выразительная
бедро шире → голень уже → стопа чёткая и читаемая
корпус асимметричный → голова не идеальный круг → плащ даёт крупную форму
```

Силуэт должен читаться даже без внутренних деталей.

---

# 14. Pose Mode

Pose — это сохранённый набор трансформаций и деформаций.

Пример поз:

```txt
idle_neutral
idle_breath_in
idle_breath_out
walk_contact_left
walk_pass_left
walk_contact_right
jump_start
jump_peak
fall_fast
land_heavy
turn_left_to_right
wall_slide
ledge_grab
```

## Pose JSON

```ts
type PoseDefinition = {
  id: string;
  name: string;
  transforms: Record<string, Partial<Transform2D>>;
  deforms?: Record<string, DeformValue>;
  tags?: string[];
};
```

Пример:

```json
{
  "id": "jump_start",
  "name": "Jump Start",
  "transforms": {
    "root": { "scaleX": 1.08, "scaleY": 0.88 },
    "body": { "y": 3, "rotation": -0.06 },
    "head": { "y": 2, "rotation": 0.08 },
    "upperArmFront": { "rotation": -0.9 },
    "upperArmBack": { "rotation": -0.7 }
  }
}
```

---

# 15. Timeline system

Таймлайн — центральная часть инструмента.

## 15.1. AnimationClip

```ts
type AnimationClip = {
  id: string;
  name: string;

  duration: number;
  frameRate: number;
  loop: boolean;

  tracks: AnimationTrack[];
  events?: AnimationEvent[];
  markers?: TimelineMarker[];

  rootMotion?: RootMotionDefinition;
  tags?: string[];
};
```

Пример:

```json
{
  "id": "walk",
  "name": "Walk",
  "duration": 0.72,
  "frameRate": 60,
  "loop": true,
  "tracks": [],
  "events": [
    { "time": 0.08, "type": "footstep", "payload": { "foot": "front" } },
    { "time": 0.44, "type": "footstep", "payload": { "foot": "back" } }
  ]
}
```

---

## 15.2. Track types

```ts
type TrackTargetType =
  | "bone"
  | "part"
  | "pathPoint"
  | "deform"
  | "visibility"
  | "zIndex"
  | "event"
  | "proceduralParam"
  | "collider";
```

Примеры треков:

```txt
bone:body.rotation
bone:head.y
bone:upperArmFront.rotation
bone:shinBack.rotation
part:cloak.opacity
deform:cloak.wind
deform:hair.sway
visibility:dustEmitter.enabled
event:footstep
collider:attackBox.enabled
```

---

## 15.3. Keyframe

```ts
type Keyframe<T = number> = {
  time: number;
  value: T;
  interpolation: "linear" | "step" | "bezier" | "spring" | "hold";
  curve?: BezierCurveDefinition;
  tangentIn?: number;
  tangentOut?: number;
};
```

Для качества анимации обязательно нужен **Graph Editor**, не только dopesheet. Без редактирования кривых персонаж будет выглядеть механически.

---

# 16. Curve Editor

## 16.1. Нужные типы кривых

```txt
linear
easeIn
easeOut
easeInOut
cubicBezier
stepped
spring
overshoot
anticipation
custom
```

## 16.2. Почему это важно

Для хорошей анимации почти никогда не хватает линейной интерполяции. Например:

```txt
jump_start:
  быстрый squash → резкий stretch

fall:
  плавный переход рук назад

land:
  резкий удар вниз → мягкий возврат в idle

turn:
  тело поворачивается быстро → голова и плащ догоняют позже
```

---

# 17. Animation blending

Главная задача — чтобы персонаж не “щёлкал” между состояниями.

## 17.1. Runtime должен поддерживать

```txt
- crossfade между клипами;
- blend by parameter;
- additive layers;
- partial body masks;
- interrupt transitions;
- transition priorities;
- animation events;
- normalized time;
- phase matching для walk/run;
- procedural overlays.
```

---

## 17.2. Базовая формула blending

Для каждого animated property:

```txt
result = lerp(valueA, valueB, transitionWeight)
```

Для rotation:

```txt
resultRotation = shortestAngleLerp(rotationA, rotationB, weight)
```

Для scale:

```txt
resultScale = lerp(scaleA, scaleB, weight)
```

Для additive layer:

```txt
result = base + additive * additiveWeight
```

---

## 17.3. Layer model

```txt
Base Layer
  idle / walk / run / jump / fall / land

Additive Layer: Breathing
  small chest/head motion

Additive Layer: Cloth
  cloak/hair secondary motion

Additive Layer: Impact
  landing squash, damage reaction

Additive Layer: Look / Aim
  head/upper body orientation

IK Layer
  foot placement, hand placement
```

---

# 18. State machine

## 18.1. State definition

```ts
type AnimationState = {
  id: string;
  name: string;

  clipId?: string;
  blendTree?: BlendTreeDefinition;

  speed?: number;
  loop?: boolean;

  enterActions?: StateAction[];
  exitActions?: StateAction[];

  tags?: string[];
};
```

---

## 18.2. Transition definition

```ts
type AnimationTransition = {
  from: string;
  to: string;

  duration: number;
  easing: string;

  conditions: TransitionCondition[];
  priority?: number;

  canInterrupt?: boolean;
  syncMode?: "none" | "normalizedTime" | "phaseMatch";
};
```

Пример:

```json
{
  "from": "walk",
  "to": "run",
  "duration": 0.18,
  "easing": "easeOut",
  "syncMode": "phaseMatch",
  "conditions": [
    {
      "param": "speed",
      "op": ">",
      "value": 120
    }
  ]
}
```

---

## 18.3. Parameters

State machine должна читать параметры от платформерного контроллера:

```ts
type AnimationParameters = {
  speed: number;
  absSpeed: number;
  velocityX: number;
  velocityY: number;

  grounded: boolean;
  wasGrounded: boolean;
  landingImpact: number;

  joystickX: number;
  joystickY: number;
  joystickMagnitude: number;

  jumpPressed: boolean;
  attackPressed: boolean;

  facing: -1 | 1;
  wallContact: "left" | "right" | "none";

  timeInState: number;
};
```

---

# 19. Blend trees

Для движения нужен не просто `idle -> walk -> run`, а blend tree.

## 19.1. Locomotion blend tree

```txt
parameter: absSpeed

0      → idle
20     → slow_walk
80     → walk
150    → run
```

При изменении скорости персонаж не переключается резко, а плавно смешивает клипы.

```json
{
  "id": "locomotion",
  "type": "1D",
  "parameter": "absSpeed",
  "children": [
    { "clipId": "idle", "threshold": 0 },
    { "clipId": "walk", "threshold": 80 },
    { "clipId": "run", "threshold": 150 }
  ]
}
```

---

# 20. Procedural animation

Чтобы персонаж был живым, часть движения нужно делать не ключами, а процедурно.

## 20.1. Breathing

```txt
- грудь чуть расширяется;
- голова едва поднимается;
- плечи слегка смещаются;
- плащ очень медленно колышется.
```

Параметры:

```json
{
  "type": "breathing",
  "enabled": true,
  "frequency": 0.8,
  "amplitude": 1.0,
  "affectedBones": {
    "chest": { "scaleY": 0.025, "y": -0.8 },
    "head": { "y": -0.5 },
    "shoulderFront": { "rotation": 0.025 },
    "shoulderBack": { "rotation": -0.018 }
  }
}
```

---

## 20.2. Cloak / hair inertia

Плащ и волосы должны догонять движение тела с задержкой.

Параметры:

```json
{
  "type": "secondaryMotion",
  "target": "cloak",
  "stiffness": 0.22,
  "damping": 0.72,
  "velocityInfluence": 0.35,
  "gravityInfluence": 0.18,
  "windInfluence": 0.1,
  "maxOffset": 14
}
```

Принцип:

```txt
1. Runtime получает velocity игрока.
2. Плащ смещается в противоположную сторону.
3. При остановке плащ перелетает чуть дальше.
4. Damping возвращает его к базовой форме.
```

---

## 20.3. Squash / stretch

Используется в:

```txt
- jump_start;
- jump_peak;
- fall_fast;
- land_light;
- land_heavy;
- damage_hit;
- bounce.
```

Пример:

```json
{
  "type": "squashStretch",
  "targetBone": "root",
  "rules": [
    {
      "condition": "jumpStart",
      "scaleX": 0.92,
      "scaleY": 1.12,
      "duration": 0.08
    },
    {
      "condition": "landHeavy",
      "scaleX": 1.14,
      "scaleY": 0.82,
      "duration": 0.12
    }
  ]
}
```

---

## 20.4. Foot IK

Для платформера это очень важно, особенно если персонаж ходит по неровным поверхностям.

Система:

```txt
- raycast вниз от предполагаемой позиции стопы;
- найти поверхность;
- плавно подтянуть foot bone;
- немного повернуть стопу по normal поверхности;
- не ломать основную walk-анимацию;
- включать IK только когда grounded;
- отключать IK в прыжке.
```

Параметры:

```json
{
  "type": "footIK",
  "enabled": true,
  "feet": [
    {
      "footBone": "footFront",
      "shinBone": "shinFront",
      "thighBone": "thighFront",
      "raycastOffsetX": 4,
      "raycastHeight": 20,
      "maxCorrection": 8,
      "blend": 0.75
    }
  ]
}
```

---

# 21. Runtime execution order

Каждый frame:

```txt
1. Read platformer controller state
2. Update animation parameters
3. Evaluate state machine
4. Sample base animation clip / blend tree
5. Apply transition blending
6. Apply additive layers
7. Apply procedural layers
8. Apply IK / constraints
9. Resolve final local transforms
10. Update PixiJS Containers
11. Update deform meshes
12. Emit animation events
```

Пример runtime API:

```ts
const rig = await RigLoader.load("/characters/hero/hero.compiled.json");

const player = new RigInstance(rig, {
  renderer: "pixi",
  quality: "high"
});

world.addChild(player.container);

app.ticker.add((ticker) => {
  const dt = ticker.deltaMS / 1000;

  player.update(dt, {
    speed: controller.velocity.x,
    absSpeed: Math.abs(controller.velocity.x),
    velocityX: controller.velocity.x,
    velocityY: controller.velocity.y,
    grounded: controller.grounded,
    wasGrounded: controller.wasGrounded,
    landingImpact: controller.landingImpact,
    joystickX: input.joystick.x,
    joystickY: input.joystick.y,
    joystickMagnitude: input.joystick.magnitude,
    jumpPressed: input.jumpPressed,
    attackPressed: input.attackPressed,
    facing: controller.facing,
    wallContact: controller.wallContact,
    timeInState: 0
  });
});
```

---

# 22. PixiJS rendering strategy

## 22.1. Scene graph

Каждая кость — `Container`.

Каждая видимая часть — `Graphics` или `Mesh` внутри bone container.

```txt
rootContainer
  shadowContainer
  rigContainer
    rootBoneContainer
      pelvisBoneContainer
        bodyGraphics
        legBackBoneContainer
          thighBackGraphics
          shinBackGraphics
          footBackGraphics
      chestBoneContainer
        headBoneContainer
          headGraphics
        armFrontBoneContainer
          upperArmGraphics
          forearmGraphics
          handGraphics
      cloakContainer
        cloakMesh
```

---

## 22.2. GraphicsContext reuse

Для частей, которые не меняют форму, нужно создать `GraphicsContext` один раз и переиспользовать. PixiJS `GraphicsContext` хранит drawing commands/styles и может использоваться несколькими `Graphics` instances, что полезно для повторного использования одной геометрии. ([PixiJS][6])

Правило:

```txt
- limbs/body/head: GraphicsContext + transform animation;
- cloak/hair/scarf: Mesh deformation;
- rare morph: regenerate only when necessary;
- no SVG parsing during gameplay frame.
```

---

## 22.3. Почему нельзя перерисовывать всё каждый кадр

Плохой вариант:

```txt
каждый frame:
  clear graphics
  redraw all paths
  parse SVG
  rebuild all shapes
```

Хороший вариант:

```txt
on load:
  parse paths
  build GraphicsContext
  create Graphics objects

each frame:
  update transforms
  update only dynamic mesh vertices
```

---

# 23. Performance requirements

PixiJS сам по себе быстрый, но на mobile web легко испортить производительность большим количеством объектов, фильтров и динамических перерисовок. В официальных рекомендациях PixiJS отдельно отмечены сложность сцены, порядок отрисовки, влияние старых мобильных устройств, culling и использование spritesheets для снижения нагрузки. ([PixiJS][7])

## 23.1. Runtime rules

```txt
- 0 allocations per frame в hot path.
- Не создавать новые объекты Vec2/Transform каждый update.
- Использовать object pools для events.
- Хранить transforms в typed arrays.
- Предкомпилировать curves.
- Предкомпилировать track lookup.
- Не парсить JSON в середине игры.
- Не парсить SVG во время gameplay.
- Не использовать blur/filter на каждом part персонажа.
- Glow делать фоном, не фильтром на самом персонаже.
- Для врагов использовать LOD.
```

---

## 23.2. LOD system

```txt
LOD 0: Player
  full 60 fps animation
  procedural layers enabled
  cloth/hair enabled
  IK enabled

LOD 1: Nearby enemies
  30–60 fps animation
  simplified procedural layers
  limited IK

LOD 2: Far enemies
  baked pose interpolation
  no cloth simulation
  no IK

LOD 3: Offscreen
  animation paused or updated at low frequency
```

---

## 23.3. Render groups

PixiJS 8 поддерживает Render Groups: это отдельные группы scene graph, которые позволяют оптимизировать трансформации и управление большими частями сцены. Но их нельзя использовать везде подряд: официальные рекомендации прямо предупреждают, что слишком много render groups может ухудшить производительность, поэтому их нужно применять стратегически. ([PixiJS][8])

Рекомендация:

```txt
Да:
  worldContainer as render group
  hudContainer as render group
  static background group

Осторожно:
  отдельный render group на каждого персонажа

Нет:
  render group на каждую руку, ногу, голову, part
```

---

# 24. Mobile web optimization

Цель: персонаж должен работать в мобильном браузере.

## 24.1. Renderer settings

```ts
const app = new Application();

await app.init({
  resizeTo: window,
  backgroundAlpha: 0,
  antialias: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
  powerPreference: "high-performance"
});
```

Для слабых устройств можно иметь quality preset:

```ts
type QualityPreset = "low" | "medium" | "high";
```

```txt
low:
  antialias false
  resolution 1
  cloth fps 30
  no expensive filters

medium:
  resolution 1.5
  cloth fps 45
  limited particles

high:
  resolution 2
  full cloth
  full glow background
```

Официальные performance tips PixiJS отмечают, что на старых мобильных устройствах `useContextAlpha: false` и `antialias: false` могут помочь с производительностью, поэтому эти параметры лучше сделать частью quality settings, а не жёстко фиксировать один вариант для всех устройств. ([PixiJS][7])

---

# 25. Editor performance

Редактор может быть тяжелее runtime, но он тоже должен быть быстрым.

## 25.1. Editor-specific оптимизации

```txt
- canvas updates через requestAnimationFrame;
- состояние редактора отдельно от Pixi runtime state;
- undo/redo через command pattern;
- dirty flags для пересборки только изменённых parts;
- throttled autosave;
- virtualized timeline rows;
- lazy loading больших clip данных;
- preview quality switch;
- отключаемые overlays: bones, pivots, onion skin, handles.
```

---

# 26. Undo / redo system

Редактору обязательно нужен command pattern.

```ts
interface EditorCommand {
  id: string;
  label: string;
  do(): void;
  undo(): void;
}
```

Примеры команд:

```txt
MoveBoneCommand
RotateBoneCommand
EditPathPointCommand
AddKeyframeCommand
DeleteKeyframeCommand
ChangeCurveCommand
CreateTransitionCommand
RenameAnimationCommand
MirrorPoseCommand
```

Без хорошего undo/redo редактор анимации будет неудобным.

---

# 27. Timeline editor details

## 27.1. Dopesheet

Показывает ключи по времени.

```txt
body.rotation       ●────●────────●
head.y              ●──────●──────●
armFront.rotation   ●──●──────●───●
cloak.deform        ●───────●─────●
events.footstep       ◆        ◆
```

## 27.2. Graph editor

Показывает value curves.

```txt
rotation
  ^
  |       __
  |   ___/  \___
  |__/          \__
  +------------------> time
```

## 27.3. Обязательные операции

```txt
- add key;
- delete key;
- move key;
- scale selected keys;
- copy/paste keys;
- copy/paste pose;
- mirror pose;
- reverse animation;
- retime clip;
- snap to frame;
- set interpolation;
- edit bezier handles;
- normalize loop;
- preview transition from state A to state B.
```

---

# 28. Animation events

Events нужны для связи анимации и геймплея.

```ts
type AnimationEvent = {
  time: number;
  type: string;
  payload?: Record<string, unknown>;
};
```

Примеры:

```json
[
  {
    "time": 0.12,
    "type": "footstep",
    "payload": {
      "foot": "front",
      "intensity": 0.6
    }
  },
  {
    "time": 0.34,
    "type": "dust",
    "payload": {
      "preset": "softLanding"
    }
  },
  {
    "time": 0.48,
    "type": "attackWindowStart",
    "payload": {
      "hitbox": "slash"
    }
  }
]
```

---

# 29. Collision / gameplay helper tracks

Хотя редактор анимации не должен становиться полноценным игровым движком, в нём полезно редактировать helper-треки:

```txt
- footstep points;
- hurtbox preview;
- attack hitbox timing;
- ledge grab hand point;
- wall slide body pose;
- dust spawn point;
- cloak collision ignore zone.
```

Это экспортируется в JSON как gameplay metadata.

---

# 30. LDtk preview integration

Редактор не должен заменять LDtk. LDtk используется для уровней, а наш редактор — для персонажа.

Но внутри editor preview желательно иметь вкладку:

```txt
Preview Scene
  Load LDtk test level
  Spawn character
  Enable platformer controller
  Enable touch joystick simulator
  Test idle/walk/run/jump/fall/land/wall-slide
  Show collision debug
  Show animation state debug
```

## LDtk entities для preview

В LDtk можно завести entities:

```txt
PlayerSpawn
LightEmitter
MovingPlatform
DeathZone
WallJumpSurface
CameraZone
AnimationTestTrigger
```

Адаптер читает это и строит тестовую сцену.

---

# 31. State machine editor

Визуальный graph:

```txt
            ┌────────┐
            │  idle  │
            └───┬────┘
                │ speed > 10
                v
            ┌────────┐
      ┌────>│  walk  │────┐
      │     └───┬────┘    │
      │         │ speed > 120
      │         v         │
      │     ┌────────┐    │
      │     │  run   │<───┘
      │     └───┬────┘
      │         │ jumpPressed
      │         v
┌────────┐  ┌────────┐  velocityY > 0  ┌────────┐
│  land  │<-│  fall  │<────────────────│  jump  │
└────────┘  └────────┘                 └────────┘
```

## UI для transition

Для каждого перехода:

```txt
from state
to state
duration
easing
conditions
priority
can interrupt
sync mode
preview button
```

---

# 32. JSON export example

Ниже — сокращённый пример единого runtime JSON.

```json
{
  "schemaVersion": "1.0.0",
  "runtimeTarget": "pixi-v8",
  "name": "Shadow Hero",
  "defaultFrameRate": 60,

  "rig": {
    "bones": [
      {
        "id": "root",
        "parentId": null,
        "local": { "x": 0, "y": 0, "rotation": 0, "scaleX": 1, "scaleY": 1 }
      },
      {
        "id": "body",
        "parentId": "root",
        "local": { "x": 0, "y": -38, "rotation": 0, "scaleX": 1, "scaleY": 1 }
      },
      {
        "id": "head",
        "parentId": "body",
        "local": { "x": 0, "y": -34, "rotation": 0, "scaleX": 1, "scaleY": 1 }
      }
    ],

    "parts": [
      {
        "id": "bodyShape",
        "boneId": "body",
        "type": "path",
        "zIndex": 10,
        "fill": { "type": "solid", "color": "#050505" },
        "path": {
          "closed": true,
          "commands": [
            { "cmd": "M", "x": -14, "y": -24 },
            { "cmd": "C", "cp1x": -24, "cp1y": -8, "cp2x": -20, "cp2y": 18, "x": -8, "y": 28 },
            { "cmd": "C", "cp1x": 4, "cp1y": 36, "cp2x": 20, "cp2y": 20, "x": 18, "y": -6 },
            { "cmd": "C", "cp1x": 16, "cp1y": -22, "cp2x": 2, "cp2y": -32, "x": -14, "y": -24 },
            { "cmd": "Z" }
          ]
        }
      }
    ]
  },

  "animations": [
    {
      "id": "idle",
      "duration": 1.2,
      "loop": true,
      "tracks": [
        {
          "target": "body",
          "property": "scaleY",
          "keyframes": [
            { "time": 0, "value": 1, "interpolation": "bezier" },
            { "time": 0.6, "value": 1.025, "interpolation": "bezier" },
            { "time": 1.2, "value": 1, "interpolation": "bezier" }
          ]
        },
        {
          "target": "head",
          "property": "y",
          "keyframes": [
            { "time": 0, "value": -34, "interpolation": "bezier" },
            { "time": 0.6, "value": -35.2, "interpolation": "bezier" },
            { "time": 1.2, "value": -34, "interpolation": "bezier" }
          ]
        }
      ]
    }
  ],

  "stateMachine": {
    "initial": "idle",
    "parameters": {
      "absSpeed": 0,
      "grounded": true,
      "velocityY": 0,
      "jumpPressed": false
    },
    "states": [
      {
        "id": "idle",
        "clipId": "idle",
        "loop": true
      }
    ],
    "transitions": []
  }
}
```

---

# 33. Runtime TypeScript API

## 33.1. Loading

```ts
import { Assets } from "pixi.js";
import { RigInstance, compileRuntimeRig } from "@silhouette/runtime-pixi";

const rigJson = await Assets.load("/characters/hero/hero.compiled.json");
const hero = new RigInstance(rigJson);

world.addChild(hero.container);
```

## 33.2. Update

```ts
hero.update(dt, {
  absSpeed: Math.abs(player.velocity.x),
  speed: player.velocity.x,
  velocityX: player.velocity.x,
  velocityY: player.velocity.y,
  grounded: player.grounded,
  wasGrounded: player.wasGrounded,
  landingImpact: player.landingImpact,
  joystickX: input.joystick.x,
  joystickY: input.joystick.y,
  joystickMagnitude: input.joystick.magnitude,
  jumpPressed: input.jumpPressed,
  attackPressed: input.attackPressed,
  facing: player.facing,
  wallContact: player.wallContact
});
```

## 33.3. Listening to events

```ts
hero.on("animationEvent", (event) => {
  if (event.type === "footstep") {
    dust.spawnFootstep(event.payload);
  }

  if (event.type === "land") {
    camera.shake(event.payload.intensity);
  }
});
```

---

# 34. Runtime internals

```ts
class RigInstance {
  container: Container;

  private bones: BoneRuntime[];
  private parts: PartRuntime[];
  private mixer: AnimationMixer;
  private stateMachine: StateMachine;
  private procedural: ProceduralLayerStack;
  private constraints: ConstraintSolver;

  update(dt: number, params: AnimationParameters) {
    this.stateMachine.update(dt, params);
    this.mixer.sample(dt, this.stateMachine.activeAnimations);
    this.procedural.apply(dt, params);
    this.constraints.solve(dt, params);
    this.applyTransformsToPixi();
    this.updateDynamicMeshes(dt, params);
    this.emitQueuedEvents();
  }
}
```

---

# 35. Important animation states for first character

## Required v1 states

```txt
idle
walk
run
jump_start
jump_up
fall
land_light
land_heavy
turn
wall_slide
hurt
death
```

## Nice-to-have states

```txt
ledge_grab
ledge_climb
crouch
dash
attack_light
attack_heavy
interact
push
pull
swim
climb_ladder
```

---

# 36. Character quality checklist

Перед тем как считать персонажа готовым, нужно проверить:

```txt
Idle:
  - персонаж дышит;
  - нет механического стояния;
  - плащ/волосы живут отдельно;
  - силуэт читается на светлом и тёмном фоне.

Walk:
  - есть перенос веса;
  - стопы не скользят слишком заметно;
  - руки двигаются с задержкой;
  - голова не болтается механически;
  - плащ отстаёт от тела.

Run:
  - тело наклоняется;
  - шаг шире;
  - arms swing сильнее;
  - плащ вытягивается назад;
  - есть ощущение скорости.

Jump:
  - перед прыжком есть anticipation;
  - в воздухе тело вытягивается;
  - на пике есть маленькая задержка;
  - при падении руки/плащ реагируют.

Land:
  - есть squash;
  - колени/тело смягчают удар;
  - плащ догоняет после тела;
  - есть dust event.
```

---

# 37. Editor MVP

## MVP 1 — Rig + Shape

```txt
- PixiJS canvas.
- Bone hierarchy.
- Создание bones.
- Создание vector parts.
- Path editor с Bezier points.
- Fill color.
- Pivot editor.
- Draw order.
- Save/load source JSON.
```

## MVP 2 — Timeline

```txt
- Animation clips.
- Tracks.
- Keyframes.
- Auto-key.
- Play/pause.
- Loop preview.
- Basic interpolation.
- Copy/paste pose.
```

## MVP 3 — Curves + Blending

```txt
- Graph editor.
- Bezier easing.
- State machine.
- Crossfade transitions.
- Animation parameters.
- Locomotion blend tree.
```

## MVP 4 — Procedural life

```txt
- Breathing layer.
- Squash/stretch layer.
- Cloak/hair secondary motion.
- Foot IK prototype.
- Landing impact.
```

## MVP 5 — Game preview

```txt
- Platformer controller.
- Touch joystick simulator.
- LDtk test room import.
- Collision preview.
- Animation state debug overlay.
```

## MVP 6 — Production export

```txt
- JSON schema validation.
- Compiled JSON.
- Runtime package.
- Example PixiJS platformer integration.
- Performance profiler overlay.
```

---

# 38. Recommended implementation order

Самый правильный порядок:

```txt
1. Сделать runtime skeleton без редактора.
2. Захардкодить одного персонажа в JSON.
3. Научиться проигрывать idle/walk/jump.
4. Проверить PixiJS rendering performance.
5. Потом делать редактор rig/shape.
6. Потом timeline.
7. Потом state machine.
8. Потом procedural layers.
9. Потом LDtk preview.
10. Потом compiled export.
```

Почему так: если сначала сделать красивый редактор, но runtime окажется неудобным, придётся переделывать формат. Сначала надо доказать, что JSON → runtime → PixiJS работает красиво и быстро.

---

# 39. Минимальный первый технический прототип

Первый прототип должен быть очень маленьким:

```txt
Character:
  body
  head
  upperArmFront
  forearmFront
  handFront
  upperArmBack
  forearmBack
  handBack
  thighFront
  shinFront
  footFront
  thighBack
  shinBack
  footBack
  cloak

Animations:
  idle
  walk
  jump
  fall
  land

Runtime:
  load JSON
  render Pixi containers
  sample animation
  blend idle/walk
  transition jump/fall/land

Editor:
  только timeline для transform tracks
  без полного shape editor на первом шаге
```

На этом этапе уже можно понять, выглядит ли персонаж “дорого”.

---

# 40. Что не надо делать в первой версии

```txt
- Не делать полноценный аналог Spine.
- Не делать complex mesh skinning для всего тела.
- Не делать редактор уровней.
- Не делать сервер.
- Не делать marketplace ассетов.
- Не делать 50 типов constraints.
- Не делать сложные SVG filters.
- Не делать физику ткани уровня AAA.
- Не делать экспорт в 10 форматов.
```

Цель первой версии — **идеальный силуэтный персонаж для PixiJS-платформера**, а не универсальный анимационный комбайн.

---

# 41. Главный технический риск

Самый большой риск — перерисовка сложных векторных форм каждый кадр.

Поэтому стандарт должен быть таким:

```txt
Transform animation:
  дёшево, используется везде.

Path deformation:
  ограниченно, только там, где нужно.

Mesh deformation:
  для плаща/волос/ткани.

SVG parsing:
  только import/build time, не gameplay.

GraphicsContext:
  reuse wherever possible.

Compiled JSON:
  обязателен для игры.
```

---

# 42. Главный художественный риск

Самый большой художественный риск — получить “марионетку из частей”.

Чтобы этого избежать:

```txt
- части должны перекрываться;
- суставы не должны выглядеть как шарниры;
- руки и ноги должны быть органическими;
- тело должно squash/stretch;
- голова должна реагировать с задержкой;
- плащ/волосы должны иметь вторичную анимацию;
- переходы должны быть мягкими;
- idle должен быть живым;
- walk/run должны иметь перенос веса;
- silhouette должен читаться в 1 секунду.
```

---

# 43. Финальная рекомендуемая архитектура

```txt
Editor:
	Next.js 16
  React + TypeScript
  PixiJS 8 canvas viewport
  Zustand or similar state store
  Command pattern undo/redo
  JSON schema validation

Runtime:
  Pure TypeScript
  PixiJS 8 only
  No React dependency
  No DOM dependency
  No paid runtimes

Rendering:
  Container hierarchy
  GraphicsContext for static vector parts
  Mesh for cloth/hair deformation
  Minimal filters
  Background glow instead of expensive player filters

Animation:
  Keyframe timeline
  Graph editor
  State machine
  Blend trees
  Additive layers
  Procedural overlays
  IK pass

Data:
  source JSON for editor
  compiled JSON for runtime
  schemaVersion
  migrations
  strict validation
```

---

# 44. Итоговое решение

Для твоей игры этот инструмент должен быть не “редактором спрайтов”, а **редактором живого векторного силуэта**.

Ключевая формула:

```txt
Vector Rig
+ Timeline
+ Curves
+ State Machine
+ Procedural Layers
+ PixiJS Runtime
+ JSON Export
= reusable animation system for atmospheric mobile web platformers
```

Самое важное решение: **не пытаться заменить Spine полностью**. Нужно сделать более узкий, но идеально подходящий инструмент:

```txt
одноцветные художественные силуэты,
плавные формы,
платформерная анимация,
мобильный web,
PixiJS 8,
чистый JSON,
максимальный контроль.
```

Такой инструмент будет особенно сильным именно для твоего визуального направления: чёрный живой персонаж на фоне светящихся атмосферных сцен.

[1]: https://pixijs.com/8.x/guides/components/scene-objects/container "Container | PixiJS"
[2]: https://pixijs.com/8.x/guides/components/scene-objects/graphics "Graphics | PixiJS"
[3]: https://pixijs.com/8.x/guides/components/assets "Assets | PixiJS"
[4]: https://ldtk.io/json/ "JSON documentation – LDtk"
[5]: https://pixijs.com/8.x/guides/components/assets/svg "SVG's | PixiJS"
[6]: https://pixijs.download/dev/docs/scene-6.html "Graphics | pixi.js"
[7]: https://pixijs.com/8.x/guides/concepts/performance-tips "Performance Tips | PixiJS"
[8]: https://pixijs.com/8.x/guides/concepts/render-groups "Render Groups | PixiJS"
