# ШБЗ Школа — мобильное приложение

Нативное приложение (Expo / React Native, TypeScript) для платформы «ШБЗ Школа»: ученик, учитель, разработчик.
Сейчас работает на демо-данных (заглушках); контракт будущего серверного API — в `docs/spec/00-unified-contract.md`.

## Запуск

```bash
npm install
npx expo start
```

Отсканируйте QR-код приложением **Expo Go** (Android / iOS).

## Проверки

```bash
npm run typecheck
npm run lint
npm run test
```

Правила архитектуры — в `CLAUDE.md`, спецификация сайта — в `docs/spec/`.
