PRAGMA foreign_keys = ON;

--> statement-breakpoint
CREATE TABLE `stores` (
  `id` text PRIMARY KEY NOT NULL,
  `slug` text NOT NULL UNIQUE,
  `name` text NOT NULL,
  `timezone` text NOT NULL DEFAULT 'America/Sao_Paulo',
  `ordering_enabled` integer NOT NULL DEFAULT 0 CHECK (`ordering_enabled` IN (0, 1)),
  `table_orders_enabled` integer NOT NULL DEFAULT 1 CHECK (`table_orders_enabled` IN (0, 1)),
  `pickup_orders_enabled` integer NOT NULL DEFAULT 1 CHECK (`pickup_orders_enabled` IN (0, 1)),
  `cash_open` integer NOT NULL DEFAULT 0 CHECK (`cash_open` IN (0, 1)),
  `catalog_version` integer NOT NULL DEFAULT 0,
  `last_heartbeat_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_stores_slug` ON `stores` (`slug`);

--> statement-breakpoint
CREATE TABLE `store_tables` (
  `id` text PRIMARY KEY NOT NULL,
  `store_id` text NOT NULL REFERENCES `stores`(`id`) ON DELETE CASCADE,
  `label` text NOT NULL,
  `public_token_hash` text NOT NULL,
  `enabled` integer NOT NULL DEFAULT 1 CHECK (`enabled` IN (0, 1)),
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_store_tables_store_label` ON `store_tables` (`store_id`, `label`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_store_tables_token` ON `store_tables` (`public_token_hash`);

--> statement-breakpoint
CREATE TABLE `catalog_categories` (
  `id` text PRIMARY KEY NOT NULL,
  `store_id` text NOT NULL REFERENCES `stores`(`id`) ON DELETE CASCADE,
  `source_key` text NOT NULL,
  `name` text NOT NULL,
  `sort_order` integer NOT NULL DEFAULT 0,
  `visible` integer NOT NULL DEFAULT 1 CHECK (`visible` IN (0, 1)),
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_categories_store_source` ON `catalog_categories` (`store_id`, `source_key`);

--> statement-breakpoint
CREATE TABLE `catalog_products` (
  `id` text PRIMARY KEY NOT NULL,
  `store_id` text NOT NULL REFERENCES `stores`(`id`) ON DELETE CASCADE,
  `source_product_id` text NOT NULL,
  `category_id` text REFERENCES `catalog_categories`(`id`),
  `name` text NOT NULL,
  `description` text NOT NULL DEFAULT '',
  `image_url` text,
  `emoji` text NOT NULL DEFAULT '🍔',
  `price_cents` integer NOT NULL CHECK (`price_cents` >= 0),
  `visible` integer NOT NULL DEFAULT 1 CHECK (`visible` IN (0, 1)),
  `available` integer NOT NULL DEFAULT 1 CHECK (`available` IN (0, 1)),
  `sort_order` integer NOT NULL DEFAULT 0,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_products_store_source` ON `catalog_products` (`store_id`, `source_product_id`);
--> statement-breakpoint
CREATE INDEX `idx_products_store_visible` ON `catalog_products` (`store_id`, `visible`, `available`, `sort_order`);

--> statement-breakpoint
CREATE TABLE `installations` (
  `id` text PRIMARY KEY NOT NULL,
  `store_id` text NOT NULL REFERENCES `stores`(`id`) ON DELETE CASCADE,
  `name` text NOT NULL,
  `enabled` integer NOT NULL DEFAULT 1 CHECK (`enabled` IN (0, 1)),
  `app_version` text,
  `local_revision` integer,
  `last_seen_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_installations_store_seen` ON `installations` (`store_id`, `enabled`, `last_seen_at`);

--> statement-breakpoint
CREATE TABLE `public_orders` (
  `order_number` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `id` text NOT NULL UNIQUE,
  `store_id` text NOT NULL REFERENCES `stores`(`id`),
  `status` text NOT NULL CHECK (`status` IN ('pending','accepted','preparing','ready','completed','rejected','cancelled','expired')),
  `version` integer NOT NULL DEFAULT 1 CHECK (`version` >= 1),
  `fulfillment_mode` text NOT NULL CHECK (`fulfillment_mode` IN ('table','pickup')),
  `table_id` text REFERENCES `store_tables`(`id`),
  `table_label_snapshot` text,
  `customer_name` text NOT NULL,
  `customer_note` text NOT NULL DEFAULT '',
  `payment_method` text NOT NULL CHECK (`payment_method` IN ('Pix','Dinheiro','Débito','Crédito')),
  `subtotal_cents` integer NOT NULL CHECK (`subtotal_cents` >= 0),
  `surcharge_rate_bps` integer NOT NULL DEFAULT 0 CHECK (`surcharge_rate_bps` BETWEEN 0 AND 10000),
  `surcharge_cents` integer NOT NULL DEFAULT 0 CHECK (`surcharge_cents` >= 0),
  `total_cents` integer NOT NULL CHECK (`total_cents` >= 0),
  `catalog_version` integer NOT NULL,
  `local_sale_id` text,
  `rejection_reason` text,
  `last_actor_id` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `expires_at` integer NOT NULL,
  CHECK ((`fulfillment_mode` = 'table' AND `table_id` IS NOT NULL) OR (`fulfillment_mode` = 'pickup' AND `table_id` IS NULL)),
  CHECK (`total_cents` = `subtotal_cents` + `surcharge_cents`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_public_orders_local_sale` ON `public_orders` (`local_sale_id`) WHERE `local_sale_id` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `idx_orders_store_status_created` ON `public_orders` (`store_id`, `status`, `created_at`);

--> statement-breakpoint
CREATE TABLE `public_order_items` (
  `id` text PRIMARY KEY NOT NULL,
  `order_id` text NOT NULL REFERENCES `public_orders`(`id`) ON DELETE CASCADE,
  `product_id` text NOT NULL REFERENCES `catalog_products`(`id`),
  `source_product_id` text NOT NULL,
  `name_snapshot` text NOT NULL,
  `unit_price_cents` integer NOT NULL CHECK (`unit_price_cents` >= 0),
  `quantity` integer NOT NULL CHECK (`quantity` BETWEEN 1 AND 20),
  `note` text NOT NULL DEFAULT '',
  `line_total_cents` integer NOT NULL CHECK (`line_total_cents` = `unit_price_cents` * `quantity`),
  `sort_order` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX `idx_order_items_order` ON `public_order_items` (`order_id`, `sort_order`);

--> statement-breakpoint
CREATE TABLE `order_events` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `store_id` text NOT NULL REFERENCES `stores`(`id`),
  `order_id` text NOT NULL REFERENCES `public_orders`(`id`) ON DELETE CASCADE,
  `order_version` integer NOT NULL,
  `event_type` text NOT NULL,
  `actor_type` text NOT NULL CHECK (`actor_type` IN ('customer','installation','system')),
  `actor_id` text,
  `payload_json` text NOT NULL DEFAULT '{}',
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_events_store_cursor` ON `order_events` (`store_id`, `id`);

--> statement-breakpoint
CREATE TABLE `request_idempotency` (
  `store_id` text NOT NULL REFERENCES `stores`(`id`) ON DELETE CASCADE,
  `key_hash` text NOT NULL,
  `request_hash` text NOT NULL,
  `order_id` text NOT NULL REFERENCES `public_orders`(`id`),
  `created_at` integer NOT NULL,
  `expires_at` integer NOT NULL,
  PRIMARY KEY (`store_id`, `key_hash`)
);
--> statement-breakpoint
CREATE INDEX `idx_request_idempotency_expiry` ON `request_idempotency` (`expires_at`);

--> statement-breakpoint
CREATE TABLE `installation_commands` (
  `installation_id` text NOT NULL REFERENCES `installations`(`id`) ON DELETE CASCADE,
  `mutation_id` text NOT NULL,
  `order_id` text NOT NULL REFERENCES `public_orders`(`id`),
  `request_hash` text NOT NULL,
  `resulting_version` integer NOT NULL,
  `created_at` integer NOT NULL,
  PRIMARY KEY (`installation_id`, `mutation_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_installation_commands_created` ON `installation_commands` (`created_at`);

--> statement-breakpoint
CREATE TABLE `catalog_publications` (
  `installation_id` text NOT NULL REFERENCES `installations`(`id`) ON DELETE CASCADE,
  `source_revision` integer NOT NULL,
  `request_hash` text NOT NULL,
  `catalog_version` integer NOT NULL,
  `created_at` integer NOT NULL,
  PRIMARY KEY (`installation_id`, `source_revision`)
);

--> statement-breakpoint
CREATE TABLE `rate_limit_events` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `store_id` text NOT NULL REFERENCES `stores`(`id`) ON DELETE CASCADE,
  `scope` text NOT NULL CHECK (`scope` IN ('ip','device')),
  `actor_hash` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rate_limit_lookup` ON `rate_limit_events` (`store_id`, `scope`, `actor_hash`, `created_at`);
--> statement-breakpoint
CREATE INDEX `idx_rate_limit_created` ON `rate_limit_events` (`created_at`);

--> statement-breakpoint
CREATE TRIGGER `trg_public_order_status_guard`
BEFORE UPDATE OF `status` ON `public_orders`
WHEN OLD.`status` <> NEW.`status` AND NOT (
  (OLD.`status` = 'pending' AND NEW.`status` IN ('accepted','rejected','expired')) OR
  (OLD.`status` = 'accepted' AND NEW.`status` IN ('preparing','cancelled')) OR
  (OLD.`status` = 'preparing' AND NEW.`status` IN ('ready','cancelled')) OR
  (OLD.`status` = 'ready' AND NEW.`status` IN ('completed','cancelled'))
)
BEGIN
  SELECT RAISE(ABORT, 'invalid_order_status_transition');
END;

--> statement-breakpoint
CREATE TRIGGER `trg_public_order_status_event`
AFTER UPDATE OF `status` ON `public_orders`
WHEN OLD.`status` <> NEW.`status`
BEGIN
  INSERT INTO `order_events` (
    `store_id`, `order_id`, `order_version`, `event_type`, `actor_type`,
    `actor_id`, `payload_json`, `created_at`
  ) VALUES (
    NEW.`store_id`, NEW.`id`, NEW.`version`, 'order.' || NEW.`status`,
    CASE WHEN NEW.`last_actor_id` = 'system' THEN 'system' ELSE 'installation' END,
    NEW.`last_actor_id`, '{}', NEW.`updated_at`
  );
END;
