# ozon_manager

Сервис-аналог [wber_manager](../wber_manager/CLAUDE.md) для Ozon. Бэкенд для [ozon_client](../ozon_client/CLAUDE.md): перенос плана продаж, brand-monitor, выгрузка выплат, auth (JWT + users) + автоматизация поставок FBO через Ozon Seller API. Запускается через Gateway по `/api/ozon-manager/*`.

## Стек

- **Express 5** + Sequelize 6 (PostgreSQL `texmod`).
- **mysql2** для подключения к внешней БД с хранимой процедурой `adaptPlan`.
- `jsonwebtoken` 9 + `bcrypt` 6 для auth.
- `moment` для форматирования дат.
- `newmax-utils` (`bulkCreate`, `serviceInvoker`).
- Точка входа: [index.js](index.js); роуты: [routes/](routes/); сервисы: [services/](services/); middlewares (`verifyAccessToken`, `requireAdmin`): [middlewares/](middlewares/); внешний коннектор: [utils/externalPlanDb.js](utils/externalPlanDb.js).

## Запуск

- `npm start` → `node index.js`.
- Docker: контейнер `ozon-manager` в сети `texmod-net`. Dev port `DEV_OZON_MANAGER_PORT`, prod `OZON_MANAGER_PORT`.
- Через [Gateway](../Gateway/CLAUDE.md): `/api/ozon-manager/*`.

## Порты и env

| Переменная | Назначение |
|---|---|
| `OZON_MANAGER_PORT` / `DEV_OZON_MANAGER_PORT` | порт сервиса |
| `DB_*` / `DEV_DB_*` | PostgreSQL `texmod` |
| `OZON_PLAN_DB_HOST` | внешний MySQL с `CALL adaptPlan(date)` |
| `OZON_PLAN_DB_PORT` | порт MySQL (default 3306) |
| `OZON_PLAN_DB_USER`, `OZON_PLAN_DB_PASSWORD` | учётные |
| `OZON_PLAN_DB_NAME` | имя БД (`ozon`) |
| `OZON_JWT_SECRET` | подпись JWT (default `ozon-client-access-secret`) |
| `OZON_JWT_EXPIRES_IN` | TTL access-токена (default `24h`) |
| `OZON_DEFAULT_ADMIN_EMAIL`, `OZON_DEFAULT_ADMIN_PASSWORD`, `OZON_DEFAULT_ADMIN_USERNAME` | первичный администратор, создаётся при первом старте, если таблица `private.ozon_users` пустая |

## REST-эндпоинты

| Путь | Метод | Описание |
|---|---|---|
| `/auth/sign-in` | POST | `{ email, password }` → `{ user, accessToken }`. |
| `/auth/me` | GET | по `Authorization: Bearer <token>` возвращает текущего пользователя. |
| `/auth/sign-out` | GET | no-op (фронт чистит localStorage). |
| `/users` (admin) | GET / POST | список / создание пользователей. |
| `/users/:id` (admin) | PATCH / DELETE | редактирование / удаление. |
| `/plan/set.selling` | POST | принимает `{ date }`, тянет `CALL adaptPlan(date)`, фильтрует по существующим `ozon.ozon_cards_goods.nmid`, пишет в `ozon_plan.selling`. |
| `/brand-monitor/run` | POST | сканирует Ozon-каталог по нашим брендам через Gologin (`ozon-dolg`), классифицирует карточки (свои / suspicious / паразиты), пишет в Google Sheets. Опц. `{ brand?: "OIRO" }` — прогнать один бренд из конфига. |
| `/invoices/push.sheet` | GET/POST | читает `ozon_report.invoices`, строит таблицу как в LK Ozon (Тип выплаты / Сумма / Статус / Период / Номер документа) и переписывает лист в Google Sheets. Cron 04:30. |
| `/supply/dashboard` | GET (auth) | очередь `onec_supply.ozon_supplies_queue` (последние 200). |
| `/supply/boxes` | GET (auth) | `?order_id=` — состав по коробам из `onec_supply.ozon_supply_boxes`. |
| `/supply/draft.info` | GET (auth) | `?account=&draft_id=` — `/v2/draft/create/info` (кластеры, склады, ранги). |
| `/supply/timeslots` | POST (auth) | `/v2/draft/timeslot/info` для выбранного склада. |
| `/supply/create.drafts` | GET (auth) | batch: для строк без `draft_id` — `/v1/draft/direct/create`. |
| `/supply/create.supplies` | POST (auth) | batch: с `draft_id` без `order_id` — auto-select WH (best rank) + first available timeslot → `/v2/draft/supply/create` → poll status → `/v1/supply-order/details` → сохраняет `order_id`, `supply_id`, `order_number`, `data_filling_deadline_utc`. Опц. `{dateFrom, dateTo}`. |
| `/supply/create.cargoes` | GET (auth) | batch: для `OzonBoxesModel` без `cargo_id` — `/v1/cargoes/create` (по `supply_id`) → poll `/v2/cargoes/create/info` → сохраняет `cargo_id` на короб. |
| `/supply/create.labels` | GET (auth) | batch: для коробов с `cargo_id` без этикетки — `/v1/cargoes-label/create` → `/v1/cargoes-label/get` → сохраняет `label_file_url` + `label_file_guid`. |
| `/supply/label.file` | GET (auth) | `?account=&file_guid=` — проксирует PDF из `/v1/cargoes-label/file/{file_guid}`. |
| `/supply/refresh.statuses` | GET (auth) | для всех строк с `order_id` — `/v1/supply-order/details` → обновляет `state`. |
| `/supply/set.pass` | POST (auth) | `{doc_number, account, supply_order_id?, vehicle: {driver_name, driver_phone, vehicle_model, vehicle_number}}` — `/v1/supply-order/pass/create` + poll `/pass/status`. Отдельная кнопка из UI. |
| `/health` | GET | health-check |
| `/metrics` | GET | Prometheus метрики |

## Sequelize-модели

| Модель | Схема.таблица | PK | Источник |
|---|---|---|---|
| CardsModel | `ozon.ozon_cards_goods` | `nmid` | наполняется [ozon_parser](../ozon_parser/CLAUDE.md), читаем `nmid` + `company` + `vendor_code` |
| SellingModel | `ozon_plan.selling` | composite (`art_group`, `nmid`, `company`, `date`) | пишем здесь |
| InvoicesModel | `ozon_report.invoices` | composite (`company`, `id`) | наполняется [ozon_parser](../ozon_parser/CLAUDE.md), читаем для выгрузки в Google Sheet |
| UserModel | `private.ozon_users` | `id` | `username`, `email` (unique), `password` (bcrypt), `is_admin`. Создаётся через `sync()` при первом обращении; первичный админ заводится автоматически по env-переменным. |
| OzonAccountModel | `private.ozon_accounts` | `id` | `client_id`, `apikey`, `cookie`, `go_login_id`. Читаем (наполняет [account_manager](../account_manager/CLAUDE.md), он же шифрует), расшифровка через `SECRET_KEY` (utils/crypto.js). |
| OzonQueueModel | `onec_supply.ozon_supplies_queue` | composite (`doc_number`, `order_numbers`, `account`) | очередь поставок: `items` (JSONB), `macrolocal_cluster_id`, цепочка `draft_id → order_id → supply_id`, `order_number`, `data_filling_deadline_utc`, `timeslot_from/to`, `state`, `is_error/error_text`, `is_for_push` (флаг для 1С). Sync при старте. |
| OzonBoxesModel | `onec_supply.ozon_supply_boxes` | composite (`order_id`, `box_index`) | короба: `box_key`, `cargo_id`, `cargo_type` (BOX/PALLET), `items` (JSONB: `barcode/offer_id/quant/quantity/expires_at`), `label_file_guid`, `label_file_url`, `ozon_status`. Sync при старте. |

`ozon_plan.selling` зеркалит `wber_plan.selling`: поля `month, art_group, sales_qty, sales_amount, order_qty, order_amount, profit_amount, nmid, company, date`.

Лукап `nmid` + `company`: [utils/createGroupData.js](utils/createGroupData.js) собирает `groupData[(company + vendor_code).replace(/\s/g, "")] → { nmid, company, vendor_code }` из `ozon.ozon_cards_goods`. В сервисе ключ — `item.fk_nom_id.replace("OZON", "")` из внешней БД, `art_group` берётся из `item.supArt`.

## Внешний MySQL

`mysql2/promise` pool в [utils/externalPlanDb.js](utils/externalPlanDb.js). Хранимая процедура `adaptPlan(date)` собирает агрегаты в исходной БД `ozon`. Возвращает строки с полями: `month`, `fk_nom_id` (с префиксом `OZON`), `supArt`, `sales_qty`, `sales_amount`, `order_qty`, `order_amount`, `profit`.

## Brand-monitor

- Конфиг брендов и spreadsheetId — [configs/brandMonitor.config.js](configs/brandMonitor.config.js): `BRANDS[]`, `OWN_SELLER_IDS`, `SPREADSHEET_ID`, `CABINET=DOLG`.
- Оркестратор [services/BrandMonitor.service.js](services/BrandMonitor.service.js): для каждого бренда из конфига строит URL'ы → `POST http://dispatcher:41000/gologin/DOLG/ozon/brand-monitor/scan` → агрегирует карточки → пишет 5 листов через [utils/brandMonitorSheets.js](utils/brandMonitorSheets.js) (`google-spreadsheet` 4.x, JWT-auth из `GOOGLE_KEY*`).
- Воркер ([gologin_service](../../Gologin/gologin_service/CLAUDE.md)) на стороне `ozon-dolg`: `withPageRaw` (без auth-check), перехват `entrypoint-api.bx` через `ResponseSniffer`, скролл с детектором стабильности, классификация (`OWN_BRAND_OFFICIAL` / `SUSPICIOUS_NO_BADGE` / `NAMING_PARASITE` / `OTHER`), enrichment sellerId через PDP (≤100 запросов, пауза 1.5–3 сек), возврат JSON.
- Листы: «Ozon — свои», «Ozon — паразиты», «Ozon — сводка по продавцам», «Ozon — история» (append + `run_id`), «Ozon — лог».

## Cron (`node-cron`, только в production)

| Время (MSK) | Задача |
|---|---|
| 04:30 | `Invoices.pushToSheet` — выгрузка `ozon_report.invoices` в Google Sheet (после `setInvoices` парсера в 04:00) |

## Invoices (выплаты Ozon)

- Конфиг: [configs/invoices.config.js](configs/invoices.config.js) — `SPREADSHEET_ID`, `SHEET_TITLE`, маппинги `PAYMENT_TYPE_LABELS` (docTypeSysName → "Оплата реализации" / "Выплата по товарным компенсациям" / "Оплата выкупов маркетплейсом") и `STATUS_LABELS` (`WaitingForPayment` → "Ожидает выплаты", `Paid` → "Выплачена").
- Маппинг кабинета → организация — [enum/inn.js](enum/inn.js) (`enumOrganization`, перенесён из onec-setter).
- Сервис [services/Invoices.service.js](services/Invoices.service.js): читает все строки `ozon_report.invoices` (sort by `schedule_payment_date DESC`), форматирует даты `DD.MM.YYYY`, период `from – to`, сумму `1 234,56`, документ `№<num> от <дата>`. Использует [utils/brandMonitorSheets.js](utils/brandMonitorSheets.js#L33) (`replaceRows` — clear + setHeaderRow + addRows).

## Связи

- **[ozon_client](../ozon_client/CLAUDE.md)** — фронт, ходит по `/api/ozon-manager/*` (через Gateway). JWT, выданный `/auth/sign-in`, идёт в `Authorization: Bearer`.
- **[ozon_parser](../ozon_parser/CLAUDE.md)** — общие таблицы `ozon.ozon_cards_goods` и `ozon_report.invoices` (наполняются парсером, читаются здесь).
- **[Gologin Dispatcher](../../Gologin/gologin_service/CLAUDE.md)** — `POST /gologin/DOLG/ozon/brand-monitor/scan` для brand-monitor.
- **Внешний MySQL `ozon`** — источник плана.
- **Google Sheets** (spreadsheetId в конфиге) — таргет brand-monitor.

## Supply (FBO Direct через Seller API)

Пайплайн полностью на API (без браузерных кабинетов как у WB):

1. **Draft** — `/v1/draft/direct/create` → `draft_id` (TTL черновика 30 минут).
2. **Draft info** — `/v2/draft/create/info` → кластеры + склады с рангом/рейтингом → `selectBestWarehouse` (по `total_rank`, потом `total_score`, только `availability_status.state === "AVAILABLE"`).
3. **Timeslots** — `/v2/draft/timeslot/info` → `selectFirstAvailableTimeslot` (первый из `drop_off_warehouse_timeslots.days`).
4. **Supply create** — `/v2/draft/supply/create` → `/v2/draft/supply/create/status` (poll до SUCCESS) → `order_id`.
5. **Details** — `/v1/supply-order/details` → достаём `supply_id` из `supplies[0]`, `order_number`, `data_filling_deadline_utc`.
6. **Cargoes** — `/v1/cargoes/create` (с `supply_id`) → poll `/v2/cargoes/create/info` → `cargo_id` на короб.
7. **Labels** — `/v1/cargoes-label/create` → `/v1/cargoes-label/get` → `file_url` (готовый PDF на Ozon CDN) + `file_guid`. Скачка через `/supply/label.file?file_guid=` (back-proxy).
8. **Pass** — `/v1/supply-order/pass/create` + poll `/pass/status`. Отдельная кнопка из UI (`PassModal`).

**Важно:** `order_id` (заявка) ≠ `supply_id` (поставка). Для cargoes/labels нужен `supply_id`. Одна заявка может содержать несколько поставок (multi-cluster) — сейчас берём `supplies[0]`.

Структура:
- API-клиенты ([api/](api/)): `draft.js`, `cargo.js`, `pass.js`, `supplyOrder.js`, `supply.js` (catalog/clusters/warehouses).
- Базовый axios ([utils/baseAxios.js](utils/baseAxios.js)) + Ozon-обёртка ([utils/apiAxios.js](utils/apiAxios.js), `Client-Id`/`Api-Key`, retry на 429 с X-Ratelimit-Retry).
- Сервисы ([services/supply/](services/supply/)): `Draft`, `Booking`, `SupplyOrder`, `Cargo`, `Pass` — каждый достаёт креды через `OzonAccounts.getById` (расшифровка из `private.ozon_accounts`).
- Контроллер [Controllers/Supply.controller.js](Controllers/Supply.controller.js) + роутер [routes/supply.router.js](routes/supply.router.js) (защищён `verifyAccessToken`).

**TODO:**
- 1С пишет в `ozon_supplies_queue` (через onec-setter — отдельная задача).
- Pending-slot UI (если нужен ручной выбор склада/слота вместо auto).
- Re-create draft при 30-минутном TTL.
- Multi-cluster support (сейчас `supplies[0]`).
- Cron `createDrafts/refreshStatuses` после стабилизации (по образцу [wber_manager flows/](../wber_manager/flows/)).

## Что обычно меняют

- Новые источники плана / поля → расширить `Plan.service` + модель `ozon_plan.selling`.
- Новые эндпоинты Ozon manager → новые роуты в [routes/](routes/) + сервисы по схеме wber_manager.
- Новый этап Ozon supply → метод в соответствующем `api/*.js` + расширение сервиса в `services/supply/*` + роут.
