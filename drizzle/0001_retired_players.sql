ALTER TABLE `players`
  ADD COLUMN `is_retired` boolean NOT NULL DEFAULT false AFTER `is_dev_center`;
--> statement-breakpoint
CREATE INDEX `is_retired_idx` ON `players` (`is_retired`);
