# Browser visual smoke для editor

Дата: 2026-06-22

## Автоматический запуск

Предусловия:

- editor dev server запущен на `http://localhost:3000/`;
- в окружении CI доступен `playwright`.

Команда:

```bash
pnpm smoke:editor-browser
```

Опционально:

```bash
EDITOR_URL=http://localhost:3000/ pnpm smoke:editor-browser
```

Скрипт возвращает JSON с полями:

- `identity` - виден editor shell;
- `nonblank` - есть canvas/svg viewport;
- `noFrameworkOverlay` - нет Next/framework overlay;
- `scenarios` - проходят `idle`, `walk`, `jump`, `fall`, `land`;
- `graph` - виден State Machine Graph;
- `export` - export собирает `7 files ready`, включая `hero.compiled.json` и `hero.release-manifest.json`;
- `layout.desktopPanelsVisible` - на 1440x900 видны Hierarchy, Inspector, Timeline и canvas viewport;
- `layout.timelineExpandedCanvasStable` - после увеличения нижней панели canvas остается видимым и не схлопывается;
- `layout.timelineCollapsedControlsClear` - после сворачивания timeline controls не пересекаются;
- `layout.inspectorScroll` - right inspector умеет доскроллить export artifacts;
- `layout.toolbarControlsClear` - toolbar controls не пересекаются;
- `responsive` - editor остается видимым на mobile viewport;
- `console.summary` - классификация browser warn/error;
- `console.appIssues` / `consoleErrors` пустые;
- `console.extensionNoise` может содержать шум расширений Chrome и не фейлит smoke;
- `pageErrors` пустые.

Console classifier:

- `chrome-extension://...` warn/error считается extension noise;
- `localhost`, `127.0.0.1`, `webpack-internal`, `/_next/` warn/error считается app issue;
- любой `SchemaValidationError` считается app issue и фейлит smoke.

Если Playwright не установлен, скрипт завершится с JSON `missingDependency: "playwright"`. Это не меняет production bundle; зависимость можно добавить только в CI/dev toolchain.

## Manual fallback

1. Открыть `http://localhost:3000/`.
2. Проверить, что видны `Bones`, mode tabs, Hierarchy, Inspector, Timeline.
3. Убедиться, что нет framework overlay и console app issues; extension noise отдельно игнорируется.
4. В `Rig` проверить один визуальный skeleton overlay поверх персонажа.
5. В `Preview` нажать `idle`, `walk`, `jump`, `fall`, `land`; debug scenario должен меняться.
6. В `State Machine` проверить видимость `State Machine Graph`.
7. В `Timeline` перетащить keyframe; точка должна двигаться без layout jump.
8. Увеличить и уменьшить нижнюю панель; персонаж/canvas не должен сплющиваться или исчезать, controls не должны налезать.
9. Нажать `Export`; ожидаемый результат - `7 files ready`, `hero.compiled.json`, `hero.release-manifest.json`, `hero.compiled.json.gz`.
10. Изменить ширину окна до mobile-like размера; панели должны оставаться видимыми, без framework overlay.

Успех: все пункты проходят, export не содержит SVG в source/compiled runtime artifact, preview остается видимым после export, `SchemaValidationError` отсутствует.
