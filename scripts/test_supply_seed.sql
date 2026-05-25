-- Тестовые записи для отладки supply-пайплайна ozon_manager.
-- Таблицы создаёт Sequelize при старте (см. index.js → OzonQueueModel.sync()).
-- Перед запуском убедись, что ozon-manager уже стартанул хотя бы раз.

-- ───────────────────────── 1. Доступные аккаунты Ozon ─────────────────────────
-- Кабинеты приходят из private.ozon_accounts (наполняет account_manager,
-- credentials зашифрованы AES-256-CBC по SECRET_KEY). Сначала глянь, какие есть:
SELECT id FROM private.ozon_accounts ORDER BY id;

-- ──────────────────── 2. Минимальная строка для create.drafts ─────────────────
-- Что обязательно:
--   items[] с реальными Ozon SKU из кабинета (иначе /v1/draft/direct/create
--   вернёт ошибку);
--   macrolocal_cluster_id — id кластера, куда хотим поставку. Узнать можно через
--   /v1/cluster/list или взять из существующей поставки в ЛК.

INSERT INTO onec_supply.ozon_supplies_queue (
    doc_number,
    order_numbers,
    account,
    items,
    macrolocal_cluster_id,
    is_error,
    is_for_push,
    created_at,
    updated_at
) VALUES (
    'TEST-001',
    '1;2;3',
    'TMOD',            -- ← поменяй на реальный id из шага 1
    '[
        {"sku": 1234567890, "quantity": 5},
        {"sku": 9876543210, "quantity": 2}
    ]'::jsonb,
    24,                -- ← реальный macrolocal_cluster_id (Москва ≈ 24, точно — через /v1/cluster/list)
    false,
    false,
    now(),
    now()
);

-- ─────────────────── 3. Несколько строк сразу (разные ЛК) ─────────────────────
-- Удобно для проверки batch-обработки. Раскомментируй при необходимости.
/*
INSERT INTO onec_supply.ozon_supplies_queue (
    doc_number, order_numbers, account, items, macrolocal_cluster_id,
    is_error, is_for_push, created_at, updated_at
) VALUES
    ('TEST-002', '10;11', 'SMRZ',
     '[{"sku": 1111111111, "quantity": 1}]'::jsonb, 24,
     false, false, now(), now()),
    ('TEST-003', '20',    'MUNI',
     '[{"sku": 2222222222, "quantity": 10}]'::jsonb, 24,
     false, false, now(), now());
*/

-- ─────────────────────── 4. Проверить состояние очереди ───────────────────────
SELECT
    doc_number,
    account,
    macrolocal_cluster_id,
    draft_id,
    order_id,
    supply_id,
    state,
    is_error,
    error_text,
    updated_at
FROM onec_supply.ozon_supplies_queue
ORDER BY updated_at DESC
LIMIT 20;

-- ─────────────── 5. Состав по коробам (запускать после create.supplies) ───────
-- box_index уникален в пределах одной заявки. items — JSONB со штрихкодами и
-- offer_id (артикул продавца). 1С обычно знает barcode → offer_id маппинг.
-- order_id и supply_id берёшь из шага 4, после успешного /supply/create.supplies.
/*
INSERT INTO onec_supply.ozon_supply_boxes (
    order_id,
    box_index,
    box_key,
    cargo_type,
    items,
    created_at,
    updated_at
) VALUES
    (
        <ORDER_ID_FROM_QUEUE>,
        1,
        'TEST-001-box-1',
        'BOX',
        '[
            {"barcode": "4607021391122", "offer_id": "TMOD-001", "quantity": 5}
        ]'::jsonb,
        now(),
        now()
    ),
    (
        <ORDER_ID_FROM_QUEUE>,
        2,
        'TEST-001-box-2',
        'BOX',
        '[
            {"barcode": "4607021391139", "offer_id": "TMOD-002", "quantity": 2}
        ]'::jsonb,
        now(),
        now()
    );
*/

-- ────────────────────────── 6. Очистка тестовых данных ────────────────────────
/*
DELETE FROM onec_supply.ozon_supply_boxes
 WHERE order_id IN (
     SELECT order_id FROM onec_supply.ozon_supplies_queue
      WHERE doc_number LIKE 'TEST-%'
 );

DELETE FROM onec_supply.ozon_supplies_queue
 WHERE doc_number LIKE 'TEST-%';
*/

-- ─────────────────────── 7. Сбросить состояние одной строки ───────────────────
-- Если хочешь повторно прогнать create.drafts по уже обработанной записи:
/*
UPDATE onec_supply.ozon_supplies_queue
   SET draft_id = NULL,
       order_id = NULL,
       order_number = NULL,
       supply_id = NULL,
       data_filling_deadline_utc = NULL,
       storage_warehouse_id = NULL,
       bundle_id = NULL,
       timeslot_from = NULL,
       timeslot_to = NULL,
       state = NULL,
       is_error = false,
       error_text = NULL,
       updated_at = now()
 WHERE doc_number = 'TEST-001' AND account = 'TMOD';
*/
