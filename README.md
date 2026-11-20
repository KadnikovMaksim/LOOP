# Wandermap — Collaborative Travel Guide (Full-Stack)

Полноценное приложение «бэкенд + фронтенд»:
- **Бэкенд:** Node.js + Express + SQLite (`server/`)
- **Фронтенд:** React + TypeScript + Vite + Tailwind + Leaflet (`src/`)

## Структура

```
server/                 # Бэкенд
  server.js             # Express сервер + SQLite
  package.json
wandermap.db            # SQLite база (создаётся автоматически)
src/                    # Фронтенд
  lib/places.ts         # API-клиент (свой бэкенд или Supabase)
  ...
.env                    # Переменные окружения
package.json
```

## Быстрый старт (самый простой способ)

Двойной клик по **`start-all.bat`** в корне проекта — откроются два окна: бэкенд и фронтенд.
Затем открой в браузере `http://localhost:5173` и разреши доступ к геолокации.

Отдельно: `start-backend.bat` и `start-frontend.bat`.

## Быстрый старт (вручную)

### 1. Бэкенд

```bash
cd server
npm install
npm start
# или для разработки с авто-перезапуском:
# npm run dev
```

Бэкенд запустится на `http://localhost:4000`.
При первом запуске в папке `server/` создастся файл `wandermap.db` с базой SQLite и парой стартовых мест.

### 2. Фронтенд

```bash
# в корне проекта
npm install
npm run dev
```

Фронтенд запустится на `http://localhost:5173` (по умолчанию Vite).

### 3. Какой бэкенд используется?

Фронтенд всегда работает со своим бэкендом (Express + SQLite) по адресу из `.env`:

```
VITE_API_BASE_URL=http://localhost:4000
```

Если переменная отсутствует, используется тот же `http://localhost:4000`. Supabase больше не задействован.

## Заполнение базы реальными данными (Саратов)

Данные достопримечательностей не нужно вводить вручную — они скачиваются один раз
из OpenStreetMap и сохраняются локальным дампом:

```powershell
cd server

# 1) скачать сырой дамп из Overpass API (нужен только интернет, один раз)
npm run fetch-osm

# если Overpass недоступен, можно использовать уже сохранённый дамп:
# node fetch-osm.js --raw

# 2) загрузить дамп в SQLite
npm run import -- data/saratov.json

# 3) при повторной загрузке обновить существующие записи
npm run import -- data/saratov.json --replace
```

Что попадает в базу:

| Категория | Объекты OSM |
|-----------|-------------|
| `museum` | `tourism=museum`, `tourism=gallery` |
| `monument` | `historic=monument`, `historic=memorial` |
| `park` | `leisure=park`, `leisure=garden` |
| `scenic` | `tourism=viewpoint` |

Скрипт сам:
- берёт названия на русском (`name:ru`);
- подтягивает краткие описания из русской Википедии;
- берёт фото из Wikimedia Commons (Wikidata `P18`);
- собирает адрес из `addr:street` + `addr:housenumber`;
- сохраняет `osm_id`, поэтому повторный импорт **не создаёт дублей**.

Дамп лежит в `server/data/saratov.json` — его можно открыть, поправить описания
и импортировать снова. Чтобы добавить другой город, поменяй `BBOX` в
`server/fetch-osm.js` и имя файла.

### Вариант через готовый дамп (если Overpass перегружен)

Overpass часто отвечает 502/504. Тогда можно один раз скачать региональный PBF
с Geofabrik и вырезать город локально — без внешних утилит, только Node:

```powershell
cd server

# 1) скачать регион (Volga, ~743 МБ) — ссылка с датой в имени файла
curl.exe -L -o data/volga.osm.pbf `
  "https://download.geofabrik.de/russia/volga-fed-district/volga-fed-district-261119.osm.pbf"

# 2) вырезать объекты Саратова и нужные теги -> data/saratov-osm-raw.json
npm run pbf-to-raw

# 3) обогатить описаниями/фото -> data/saratov.json
node fetch-osm.js --raw

# 4) импортировать в SQLite
npm run import -- data/saratov.json
```

После импорта PBF-файл можно удалить — он нужен только для повторной вырезки.
Границы города задаются константами `SOUTH/WEST/NORTH/EAST` в `pbf-to-raw.js`.

## Геолокация

- При открытии карта определяет местоположение и центрируется на нём.
- Есть кнопка **«Моё местоположение»** в правом верхнем углу.
- Название города показывается рядом (OpenStreetMap Nominatim).
- Если GPS запрещён, используется приблизительное определение по IP (ipwho.is / ipapi.co) —
  карта всё равно откроется в твоём городе.
- Синяя точка «вы здесь» рисуется только при точном GPS-определении.

## API бэкенда

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/api/health` | Проверка работоспособности |
| `GET` | `/api/places` | Получить все места (отсортировано по дате) |
| `GET` | `/api/places/:id` | Получить место по ID |
| `POST` | `/api/places` | Создать новое место |
| `DELETE` | `/api/places/:id` | Удалить место |
| `DELETE` | `/api/places` | Удалить все места |

Тело `POST /api/places`:
```json
{
  "title": "Заголовок",
  "description": "Описание",
  "category": "monument",
  "lat": 50.0875,
  "lng": 14.4214,
  "image_url": null
}
```

## Команды

| Команда | Где | Что делает |
|---------|-----|------------|
| `npm start` | `server/` | Запуск бэкенда |
| `npm run dev` | `server/` | Бэкенд с авто-перезапуском |
| `npm run dev` | корень | Запуск фронтенда (Vite) |
| `npm run build` | корень | Сборка фронтенда |

## Примечание по изображениям

В этой версии `image_url` хранится как текстовая ссылка (загружается превью из локального файла через `URL.createObjectURL`). Для постоянного хранения картинок можно добавить в бэкенд endpoint загрузки файлов (например, через `multer`) и сохранять путь к файлу.
