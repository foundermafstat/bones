# Майлстоуны доработки editor-сценария

Дата: 2026-06-22

Основание:

- `docs/editor-scenario-browser-audit.ru.md`
- `doc.md`, раздел `37. Editor MVP`
- `implementation-milestones.md`, этапы editor/runtime/export

Цель: довести пользовательский сценарий до состояния, где в браузере можно с нуля создать rig, привязать SVG к костям, перекодировать SVG в path, создать animation clip/keyframes, настроить curves/transitions и экспортировать compact runtime JSON.

## Общие правила выполнения

- Делать майлстоуны строго по порядку.
- В каждом майлстоуне менять только указанные зоны.
- Не проводить общий рефакторинг UI или state model без прямой необходимости.
- После каждого майлстоуна запускать только указанные targeted проверки.
- Browser-проверка обязательна для майлстоунов, которые меняют UI.
- Если локальный `pnpm` сломан, использовать доступный bundled Node/pnpm только без установки зависимостей; не запускать install без подтверждения.

## Milestone 0 — Синхронизация dev server и фактического UI

### Цель

Убедиться, что `http://localhost:3000/` показывает текущий код из рабочего дерева, а не stale `.next` bundle или другой процесс.

### Технический промт

Проверь, почему Chrome на `http://localhost:3000/` не показывает элементы, которые есть в текущих исходниках `apps/editor/app/page.tsx`: `Vectorize`, `Parent Root`, `Parent Body`, `Export Bundle`, `Import Clipboard`.

Нужно:

1. Найти процесс, обслуживающий порт `3000`.
2. Проверить, из какого cwd он запущен.
3. Если это stale server текущего repo, перезапустить его безопасно.
4. Если это другой checkout/process, явно зафиксировать это и запустить правильный editor server для `/Users/irine/Desktop/bones`.
5. Проверить, что браузер после reload видит актуальные элементы.
6. Не менять код, если причина только в dev server.

### Зоны проверки

- `apps/editor/app/page.tsx`
- `apps/editor/package.json`
- порт `3000`
- Chrome `http://localhost:3000/`

### Критерии готовности

- Chrome показывает актуальный UI из текущего source.
- `Vectorize` виден при выбранном SVG part.
- `Project -> Export Bundle` виден.
- `Project -> Import Clipboard` виден.
- Metadata buttons в inspector видны или осознанно удалены из source.

### Как проверить

```bash
lsof -i :3000
```

В Chrome:

```txt
open http://localhost:3000/
reload
check text: Vectorize
open Project menu
check menu items: Export Bundle, Import Clipboard
```

Ожидаемый результат:

```txt
page title: Bones Editor
no framework overlay
Vectorize visible
Export Bundle visible
Import Clipboard visible
```

## Milestone 1 — Project start flow: New / Sample / Reset

### Цель

Сделать настоящий старт сценария: пользователь может начать с пустого проекта, загрузить sample или сбросить draft.

### Технический промт

Реализуй в `apps/editor` стартовый project flow без backend:

1. Добавь в `Project` menu действия:
   - `New Project`;
   - `Load Sample`;
   - `Reset Draft`.
2. `New Project` должен создавать минимальный валидный `EditorProjectState`:
   - project name;
   - `root` bone;
   - пустые `parts`;
   - пустые/минимальные `animations`;
   - пустая state machine или один idle state без клипа, если schema требует.
3. `Load Sample` должен восстанавливать `initialEditorProject`.
4. `Reset Draft` должен удалить `EDITOR_DRAFT_KEY` из localStorage и загрузить sample либо empty project.
5. Добавь видимый project origin/status:
   - `empty`;
   - `sample`;
   - `draft`;
   - `imported`.
6. Все изменения должны проходить через существующий editor state flow, без нового state framework.

### Зоны изменения

- `apps/editor/app/editorState.ts`
- `apps/editor/app/projectIo.ts`
- `apps/editor/app/page.tsx`
- targeted editor tests, если есть подходящее место

### Критерии готовности

- Пользователь может начать с пустого rig.
- Пользователь может вернуть sample.
- Draft можно очистить из UI.
- Project status виден.
- Empty project можно сохранить/скопировать без runtime exception.

### Как проверить

Targeted:

```bash
node --test apps/editor/tests/editorState.test.mjs
```

Browser:

```txt
Project -> New Project
Hierarchy shows only root
Project status shows empty
Project -> Load Sample
Hierarchy returns body/head/arms/legs
Project -> Reset Draft
reload page
draft does not restore previous dirty state
```

## Milestone 2 — Canonical source JSON in UI

### Цель

Убрать разрыв, где `Copy JSON` копирует editor-wrapper вместо canonical `RigProject`.

### Технический промт

Приведи UI export/copy к canonical source JSON contract:

1. `Copy JSON` должен копировать результат `serializeEditorProject(project)`, то есть canonical `RigProject`, а не `{ schemaVersion, savedAt, project }`.
2. `Save Draft` может продолжать хранить draft wrapper, если это нужно, но UI должен явно различать:
   - `Save Draft`;
   - `Copy Source JSON`.
3. `parseImportedProject()` должен принимать оба формата:
   - canonical `RigProject`;
   - legacy draft wrapper.
4. Добавь UI status после copy/import:
   - success;
   - validation error;
   - copied bytes/files count.
5. Не ломай `toSourceProject()` / `fromSourceProject()`.

### Зоны изменения

- `apps/editor/app/projectIo.ts`
- `apps/editor/app/editorSourceProject.ts`
- `apps/editor/app/page.tsx`
- `apps/editor/tests/editorState.test.mjs` или новый targeted тест для project IO

### Критерии готовности

- Clipboard после `Copy Source JSON` содержит top-level:
  - `schemaVersion`;
  - `runtimeTarget`;
  - `id`;
  - `rigs`;
  - `animations`;
  - `stateMachines`.
- Clipboard не содержит top-level `project`, если пользователь выбрал source JSON.
- Legacy draft load продолжает работать.

### Как проверить

Browser:

```txt
Project -> Copy Source JSON
read clipboard
JSON.parse
assert runtimeTarget === "pixi-v8"
assert Array.isArray(rigs)
assert !("project" in json)
```

Targeted:

```bash
node --test apps/editor/tests/editorState.test.mjs
```

## Milestone 3 — Export Bundle UI and compiled JSON

### Цель

Сценарий должен завершаться получением `hero.compiled.json` из браузера.

### Технический промт

Реализуй production-минимум export flow:

1. Top-level `Export` должен открывать export modal/drawer или выполнять тот же flow, что `Project -> Export Bundle`.
2. `Project` menu должен содержать:
   - `Copy Source JSON`;
   - `Export Bundle`;
   - `Import Clipboard`.
3. `Export Bundle` должен использовать `createProjectExportBundle(project)`.
4. UI должен показывать:
   - validation status;
   - список файлов;
   - размер каждого файла;
   - errors/warnings.
5. Добавь действия:
   - copy all files as JSON object;
   - copy `hero.source.rig.json`;
   - copy `hero.compiled.json`;
   - download selected file, если уже есть простая утилита без новых зависимостей.
6. Если compile падает, показать ошибки в UI, не молча писать пустой clipboard.
7. Добавить warning, если в source остаются `type: "svg"` parts перед production export.

### Зоны изменения

- `apps/editor/app/page.tsx`
- `apps/editor/app/projectIo.ts`
- `packages/compiler` только если текущий compile error требует contract fix

### Критерии готовности

- `Export Bundle` виден и работает.
- Clipboard/export object содержит:
  - `hero.source.rig.json`;
  - `hero.rig.json`;
  - `hero.animations.json`;
  - `hero.state-machine.json`;
  - `hero.compiled.json`.
- `hero.compiled.json` содержит:
  - `compiledFormatVersion`;
  - numeric ids;
  - `lookups`.
- UI показывает compile errors вместо silent failure.

### Как проверить

Browser:

```txt
Project -> Export Bundle
copy all
read clipboard
JSON.parse clipboard
assert files["hero.compiled.json"]
JSON.parse(files["hero.compiled.json"]).compiledFormatVersion === "1.0.0"
```

Runtime smoke:

```bash
node scripts/rc-smoke.mjs
```

## Milestone 4 — SVG parts panel and SVG import/bind

### Цель

Пользователь может добавить SVG asset и привязать его к кости без редактирования кода.

### Технический промт

Добавь в Shape mode полноценный `Parts` panel:

1. Список всех parts:
   - id;
   - type;
   - bound bone;
   - draw order;
   - visible/opacity, если уже поддержано моделью;
   - asset path/source.
2. Выбор part должен быть независим от выбора bone, но при выборе bone нужно подсвечивать bound parts.
3. Добавь `Add SVG Part`:
   - id input;
   - SVG source input: path/url/text paste;
   - bone selector;
   - draw order;
   - pivot defaults.
4. Добавь `Bind to Bone`:
   - select current part;
   - select target bone;
   - update `boneId`;
   - preserve local/pivot fields.
5. Добавь `Unbind` или explicit rebind flow, если unbound parts разрешены.
6. Все операции должны идти через command system.

### Зоны изменения

- `apps/editor/app/editorState.ts`
- `apps/editor/app/page.tsx`
- `apps/editor/app/editorSourceProject.ts`
- `apps/editor/tests/editorState.test.mjs`

### Критерии готовности

- Можно добавить новый SVG part через UI.
- Можно привязать part к `head`/`body`/любой bone.
- Inspector показывает выбранный part, а не только первый part у selected bone.
- Source JSON содержит `parts[].svg.source` и корректный `boneId`.

### Как проверить

Browser:

```txt
Shape mode
Add SVG Part
id: testSvgShape
source: existing /assets/...svg
bone: head
Save/Copy Source JSON
assert part exists with type svg and boneId head
```

Targeted:

```bash
node --test apps/editor/tests/editorState.test.mjs
```

## Milestone 5 — SVG to path vectorization UI

### Цель

Пользователь может перекодировать SVG в editable path прямо в браузере.

### Технический промт

Сделай `Vectorize` first-class action для SVG parts:

1. Кнопка `Vectorize` должна быть видна:
   - в Shape toolbar;
   - в selected part inspector;
   - только когда `selectedPart.type === "svg"`.
2. При клике использовать `vectorizeSvgPart()`.
3. После успеха:
   - `type` меняется `svg -> path`;
   - `pathCommands` заполнены;
   - `points.length > 0`;
   - `svgViewBox` сохранен, если есть.
4. UI должен показать summary:
   - commands count;
   - points count;
   - viewBox;
   - warning: multiple SVG paths collapsed/first path only, если importer пока ограничен.
5. Ошибки vectorize должны показываться в UI:
   - fetch failed;
   - no path;
   - invalid path data.
6. Добавь targeted test для successful vectorization и no-path error.

### Зоны изменения

- `apps/editor/app/editorVectorImport.ts`
- `apps/editor/app/editorState.ts`
- `apps/editor/app/page.tsx`
- `packages/vector-core/src/svg.ts`, только если нужен небольшой parser fix

### Критерии готовности

- В Chrome `Vectorize` виден для `bodyShape`.
- После клика `Type` становится `path`.
- `Points` становится больше `0`.
- `Copy Source JSON` содержит `path.commands` для part.
- Unsupported SVG дает понятное сообщение.

### Как проверить

Browser:

```txt
select body/bodyShape
Shape -> Vectorize
assert Type path
assert Points > 0
Copy Source JSON
assert rigs[0].parts[].path.commands.length > 0
```

Targeted:

```bash
node --test apps/editor/tests/editorState.test.mjs
node --test packages/vector-core/tests/path.test.mjs
```

## Milestone 6 — Rig inspector and hierarchy production controls

### Цель

Заменить demo-действия skeleton на редактируемый Rig Mode.

### Технический промт

Реализуй production-minimum Rig Mode:

1. Inspector fields должны быть editable:
   - bone id;
   - parent;
   - local x/y;
   - rotation;
   - scaleX/scaleY;
   - length, если есть в state;
   - tags;
   - mirrorGroup;
   - hidden;
   - locked;
   - facing.
2. `Add Bone` должен открывать form/popover:
   - id;
   - parent defaults to selected bone;
   - transform defaults.
3. `Rename` должен принимать user input и обновлять references:
   - parents;
   - part boneId;
   - poses;
   - animation track ids;
   - state/procedural refs, если применимо.
4. `Delete` должен показывать impact:
   - child bones;
   - bound parts;
   - animation tracks.
5. Добавь parent selector.
6. Сохрани command-based undo/redo.
7. Не добавляй новый drag-and-drop framework на этом этапе.

### Зоны изменения

- `apps/editor/app/editorState.ts`
- `apps/editor/app/page.tsx`
- `apps/editor/app/editorSourceProject.ts`
- tests for rename/delete/reference updates

### Критерии готовности

- Можно создать bone с заданным id.
- Можно переименовать `body` в пользовательское имя и refs обновятся.
- Можно изменить x/y/rotation вручную.
- Можно сменить parent через UI.
- Undo/redo возвращает изменения.

### Как проверить

Browser:

```txt
Rig mode
Add Bone id armTest parent body
edit x/y/rotation
rename armTest -> armCustom
Copy Source JSON
assert bone id armCustom exists
assert no stale armTest references
Undo
assert previous state restored
```

Targeted:

```bash
node --test apps/editor/tests/editorState.test.mjs
```

## Milestone 7 — Shape path editor MVP

### Цель

После vectorize пользователь может редактировать path, pivot и draw order.

### Технический промт

Сделай Shape Mode рабочим path editor минимум-уровня:

1. Для selected path part показать:
   - points list;
   - selected point index;
   - point x/y editable fields;
   - command type `M/L/Q/C/Z`;
   - close/open state.
2. Реализовать canvas point selection и drag для endpoint points.
3. `Pen` должен добавлять point в выбранный path не шаблонно, а через текущую canvas позицию или form.
4. `Mirror` должен применять mirror к selected part и показывать preview count.
5. `Pivot` должен иметь editable x/y и `Set Pivot From Selection`.
6. `Layer +` / draw order должен быть видимым и editable.
7. Изменения сохраняются в source JSON path commands.

### Зоны изменения

- `apps/editor/app/page.tsx`
- `apps/editor/app/editorState.ts`
- `apps/editor/app/editorSourceProject.ts`
- `packages/vector-core`, только для missing helper

### Критерии готовности

- Можно выбрать point у path part.
- Можно поменять координаты point.
- Canvas обновляет silhouette.
- Source JSON после copy содержит измененный path command.
- Pivot/drawOrder сохраняются.

### Как проверить

Browser:

```txt
Vectorize bodyShape
select first editable point
change x/y
set pivot
Layer +
Copy Source JSON
assert path.commands changed
assert drawOrder changed
```

## Milestone 8 — Timeline MVP: clips, tracks, keyframes

### Цель

Сделать создание анимации реальным workflow, а не preset-командой.

### Технический промт

Реализуй Timeline Mode MVP:

1. В центральной рабочей зоне Timeline mode показать:
   - clips panel;
   - tracks list;
   - dope sheet grid;
   - playhead/current time;
   - selected key inspector.
2. Clip actions:
   - create;
   - duplicate;
   - delete;
   - edit duration/fps/loop/tags.
3. Track actions:
   - add track;
   - target kind;
   - target id;
   - property.
4. Keyframe actions:
   - add at current time;
   - edit time/value;
   - delete;
   - copy/paste;
   - move by direct numeric input.
5. Auto-key:
   - visible toggle;
   - when enabled, transform edit creates/updates key for current clip/time.
6. Existing preset menu can remain, but must not be the only creation path.

### Зоны изменения

- `apps/editor/app/page.tsx`
- `apps/editor/app/editorState.ts`
- `apps/editor/app/editorSourceProject.ts`
- tests for clip/track/key operations

### Критерии готовности

- Можно создать `testWalk` clip.
- Можно добавить track `body.scaleY`.
- Можно добавить keyframes at `0`, `0.5`, `1.0`.
- Можно edit value/time.
- Source JSON содержит expected animation track.

### Как проверить

Browser:

```txt
Timeline mode
Create Clip testWalk duration 1 loop true
Add Track body transform.scaleY
Add keys 0=1, 0.5=1.1, 1=1
Play preview
Copy Source JSON
assert animations[].id === testWalk
assert track target body/property transform.scaleY
```

Targeted:

```bash
node --test apps/editor/tests/editorState.test.mjs
```

## Milestone 9 — Curve editor MVP

### Цель

Дать пользователю управлять interpolation/curve, а не только применять preset.

### Технический промт

Реализуй Curve Mode MVP:

1. Центральная зона Curve mode должна показывать graph для selected key/track.
2. Selected key inspector:
   - interpolation dropdown;
   - curve preset dropdown;
   - cubic bezier numeric inputs `[x1,y1,x2,y2]`;
   - tangent fields, если они уже есть в state.
3. Presets:
   - linear;
   - step;
   - hold;
   - bezier;
   - spring;
   - anticipation;
   - overshoot.
4. Graph должен хотя бы статически рисовать кривую и handles.
5. Изменение curve должно обновлять keyframe и preview.

### Зоны изменения

- `apps/editor/app/page.tsx`
- `apps/editor/app/editorState.ts`
- `apps/editor/app/editorSourceProject.ts`

### Критерии готовности

- Можно выбрать keyframe.
- Можно поменять interpolation на `bezier`.
- Можно поменять curve numbers.
- Source JSON содержит `curve`.
- Runtime preview отражает изменение при playback.

### Как проверить

Browser:

```txt
Timeline: select key
Curve mode
set interpolation bezier
set curve [0.2,0.8,0.2,1]
Copy Source JSON
assert keyframe.curve equals values
```

## Milestone 10 — State Machine editor MVP

### Цель

Сделать transitions/conditions настраиваемыми через UI.

### Технический промт

Реализуй State Machine Mode MVP:

1. Центральная зона должна показывать states и transitions:
   - list или simple graph без сложной graph library;
   - selected state;
   - selected transition.
2. State actions:
   - create state;
   - rename state;
   - select clip;
   - set initial.
3. Transition actions:
   - create transition from/to;
   - edit duration;
   - easing;
   - priority;
   - canInterrupt;
   - syncMode.
4. Condition editor:
   - parameter dropdown;
   - operator dropdown;
   - value input.
5. Parameter panel:
   - create/edit/delete parameter;
   - type;
   - default value.
6. Preview panel:
   - simulated params;
   - active state;
   - active transition;
   - transition weight.

### Зоны изменения

- `apps/editor/app/page.tsx`
- `apps/editor/app/editorState.ts`
- `apps/editor/app/editorSourceProject.ts`
- runtime only if current preview cannot expose needed state

### Критерии готовности

- Можно создать transition `idle -> jump`.
- Можно добавить condition `jumpPressed == true`.
- Можно изменить duration/easing.
- Source JSON и compiled JSON содержат transition.
- Preview показывает active transition when params match.

### Как проверить

Browser:

```txt
State Machine mode
Create Transition idle -> jump
condition jumpPressed == true
duration 0.12 easing anticipation syncMode none
Export Bundle
assert source stateMachines[0].transitions includes transition
assert compiled stateMachines[0].transitions includes numeric transition
```

Targeted:

```bash
node --test packages/runtime-pixi/tests/RuntimeStateMachine.test.mjs
```

## Milestone 11 — Procedural Mode MVP

### Цель

Сделать procedural layers настраиваемыми и сохраняемыми из UI.

### Технический промт

Реализуй Procedural Mode MVP:

1. Центральная зона Procedural mode должна показывать panels:
   - Breathing;
   - Secondary Motion;
   - Squash/Stretch;
   - Foot IK.
2. Breathing:
   - enabled;
   - frequency;
   - amplitude;
   - affected bones multiselect.
3. Secondary Motion:
   - target part/bone;
   - stiffness;
   - damping;
   - velocityInfluence;
   - gravity/wind influence;
   - maxOffset.
4. Squash/Stretch:
   - target bone;
   - condition;
   - scaleX/scaleY;
   - duration.
5. Foot IK:
   - enabled;
   - feet list;
   - thigh/shin/foot chain;
   - maxCorrection;
   - blend.
6. Changes must save to source JSON procedural presets and affect preview.

### Зоны изменения

- `apps/editor/app/page.tsx`
- `apps/editor/app/editorState.ts`
- `apps/editor/app/editorSourceProject.ts`
- `packages/runtime-pixi/src/ProceduralLayers.ts`, only if source->runtime mapping requires it

### Критерии готовности

- UI edits breathing values.
- UI edits cloak secondary motion.
- UI enables Foot IK.
- `Copy Source JSON` contains procedural preset data.
- Preview visibly changes or debug values change.

### Как проверить

Browser:

```txt
Procedural mode
enable Breathing amplitude 1.5
enable Foot IK feet footFront, footBack
Copy Source JSON
assert proceduralPresets contains breathing and footIK config
```

## Milestone 12 — Preview Mode and LDtk/gameplay simulator

### Цель

Preview mode должен проверять поведение персонажа в игровом контексте, а не только проигрывать clip.

### Технический промт

Реализуй Preview Mode MVP:

1. Центральная зона Preview mode должна переключаться в gameplay preview:
   - platformer controller params;
   - sample LDtk room;
   - collision debug overlay;
   - animation state debug overlay.
2. Использовать существующие:
   - `@bones/ldtk-adapter`;
   - `@bones/platformer-preview`;
   - `RigInstance.update(dt, params)`.
3. Controls:
   - keyboard movement;
   - touch joystick simulator placeholder;
   - toggles for grounded/jump/fall/land if keyboard is too much for MVP.
4. Debug overlay:
   - active state;
   - active clip;
   - transition weight;
   - params;
   - events.

### Зоны изменения

- `apps/editor/app/page.tsx`
- `apps/editor/app/PixiPreview.tsx`
- `packages/platformer-preview`, only for missing helper

### Критерии готовности

- Preview mode changes central surface.
- User can trigger idle/walk/jump/fall/land through params/controls.
- State debug updates.
- Collision debug from sample room visible.

### Как проверить

Browser:

```txt
Preview mode
press/play walk input or set absSpeed
active state becomes locomotion/walk
trigger jump
active state becomes jump/fall/land sequence
debug overlay updates
```

## Milestone 13 — Layout and active-mode toolbar polish

### Цель

Убрать UX-блокеры, которые мешают сценарию даже при наличии функций.

### Технический промт

Улучшить layout без смены дизайн-системы:

1. Inspector:
   - увеличить width или сделать resizable;
   - убрать обрезание значений;
   - long ids показывать с tooltip/copy;
   - read-only values не должны выглядеть как disabled broken inputs.
2. Active mode toolbar:
   - вместо скрытия основных операций в dropdown показывать постоянные buttons для текущего режима.
3. Workspace:
   - каждый mode должен иметь явный title и surface;
   - если mode еще не реализован, показывать structured empty state с disabled actions, а не summary cards.
4. Dirty/status:
   - last command;
   - validation status;
   - autosave/draft status.

### Зоны изменения

- `apps/editor/app/page.tsx`
- `apps/editor/app/globals.css`
- existing UI components only

### Критерии готовности

- No clipped inspector values at desktop viewport.
- Active mode controls visible without opening dropdown.
- Mode tabs visibly change workspace.
- Dirty/status understandable.

### Как проверить

Browser desktop:

```txt
viewport ~1430x756
select long bone id
inspect fields
no clipped critical values
switch each mode
workspace changes
```

Browser mobile/tablet optional:

```txt
viewport ~390x844
no overlapping toolbar/inspector
```

## Milestone 14 — Import Clipboard and migration guardrails

### Цель

Пользователь может импортировать source JSON и legacy draft без ручного кода.

### Технический промт

Реализуй import flow:

1. `Project -> Import Clipboard` visible.
2. При клике:
   - read clipboard;
   - detect canonical source JSON vs legacy draft wrapper;
   - validate;
   - show import preview summary.
3. Before replacing current project:
   - if dirty, show confirmation/modal.
4. Import errors:
   - schema validation errors with paths;
   - unsupported schemaVersion;
   - malformed JSON.
5. После import:
   - project state updates;
   - source can be copied/exported;
   - preview compiles or shows compile errors.

### Зоны изменения

- `apps/editor/app/projectIo.ts`
- `apps/editor/app/page.tsx`
- `packages/schema`, only if error paths need improvement

### Критерии готовности

- Can import canonical `examples/shadow-hero/source.json` through clipboard.
- Can import legacy wrapper.
- Invalid JSON shows error.
- Dirty project prompts before replace.

### Как проверить

Browser:

```txt
copy examples/shadow-hero/source.json content
Project -> Import Clipboard
confirm import
Hierarchy updates
Export Bundle works
```

## Milestone 15 — Browser scenario smoke test

### Цель

Зафиксировать весь сценарий как повторяемую проверку, чтобы не ломать его дальше.

### Технический промт

Добавь неинвазивный browser smoke workflow для editor-сценария:

1. Если в проекте уже есть browser/e2e setup, используй его.
2. Если нет, добавь простой script outside production bundle или documented manual smoke, не вводя тяжелые зависимости без согласования.
3. Smoke должен проверять:
   - app loads;
   - no framework overlay;
   - New Project;
   - Add Bone with id;
   - Add SVG Part;
   - Vectorize;
   - Add Clip/Track/Key;
   - Add Transition;
   - Export Bundle;
   - compiled JSON parses.
4. Сохрани сценарий в docs и, если есть test runner, автоматизируй happy path.

### Зоны изменения

- `docs/`
- `scripts/`, если без новых зависимостей
- optional test config only with approval

### Критерии готовности

- Есть один canonical smoke checklist.
- Smoke можно пройти вручную за 5-10 минут.
- При наличии automation script он не требует install и не меняет данные.

### Как проверить

Manual:

```txt
follow docs/editor-scenario-smoke.ru.md
all pass
```

Optional script:

```bash
node scripts/editor-scenario-smoke.mjs
```

## Финальный acceptance criteria

Сценарий считается закрытым, когда в Chrome на актуальном dev server можно выполнить:

1. `Project -> New Project`.
2. `Rig -> Add Bone` с пользовательским id.
3. Изменить transform через inspector.
4. `Shape -> Add SVG Part`.
5. Привязать SVG к bone.
6. `Vectorize` SVG в path.
7. Увидеть `type: path` и `points > 0`.
8. `Timeline -> Create Clip`.
9. `Timeline -> Add Track`.
10. `Timeline -> Add Keyframes`.
11. `Curve -> Edit Bezier`.
12. `State Machine -> Add Transition`.
13. `Preview -> Play`.
14. `Export -> Export Bundle`.
15. Получить валидный `hero.compiled.json`.

Минимальные проверки:

```bash
node --test apps/editor/tests/editorState.test.mjs
node --test packages/runtime-pixi/tests/*.test.mjs
node scripts/rc-smoke.mjs
```

Browser acceptance:

```txt
page title: Bones Editor
no framework overlay
Vectorize visible and works
Export Bundle visible and works
compiled JSON parses and contains numeric ids/lookups
```
