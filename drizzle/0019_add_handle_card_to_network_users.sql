ALTER TABLE `network_users` ADD `handle` text;--> statement-breakpoint
ALTER TABLE `network_users` ADD `card` text;--> statement-breakpoint
CREATE UNIQUE INDEX `network_users_handle_unique` ON `network_users` (`handle`);--> statement-breakpoint
CREATE INDEX `network_users_handle` ON `network_users` (`handle`);