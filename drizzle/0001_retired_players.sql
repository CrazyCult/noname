ALTER TABLE `players`
  ADD COLUMN `is_retired` boolean NOT NULL DEFAULT false AFTER `is_dev_center`,
  ADD COLUMN `last_seen_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `is_retired`;
--> statement-breakpoint
CREATE INDEX `is_retired_idx` ON `players` (`is_retired`);
--> statement-breakpoint
CREATE INDEX `last_seen_at_idx` ON `players` (`last_seen_at`);
