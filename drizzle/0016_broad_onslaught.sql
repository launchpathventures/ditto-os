ALTER TABLE `memories` ADD `applied_project_ids` text;--> statement-breakpoint
CREATE INDEX `activities_entity_action_idx` ON `activities` (`entity_type`,`entity_id`,`action`);