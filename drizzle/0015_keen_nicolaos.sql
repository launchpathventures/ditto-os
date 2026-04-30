ALTER TABLE `projects` ADD `kind` text DEFAULT 'build' NOT NULL;--> statement-breakpoint
CREATE INDEX `projects_kind_idx` ON `projects` (`kind`);