CREATE TABLE `analysis_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`stage` text DEFAULT 'A' NOT NULL,
	`progress` text,
	`params` text NOT NULL,
	`community_pulse` text,
	`error` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `chunks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`group_id` integer NOT NULL,
	`seq` integer NOT NULL,
	`from_ts` integer NOT NULL,
	`to_ts` integer NOT NULL,
	`message_count` integer NOT NULL,
	`token_estimate` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`result` text,
	`tokens_in` integer DEFAULT 0 NOT NULL,
	`tokens_out` integer DEFAULT 0 NOT NULL,
	`cache_read` integer DEFAULT 0 NOT NULL,
	`error` text,
	FOREIGN KEY (`run_id`) REFERENCES `analysis_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `chunks_run` ON `chunks` (`run_id`);--> statement-breakpoint
CREATE TABLE `communities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`goals` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `group_members` (
	`group_id` integer NOT NULL,
	`member_id` text NOT NULL,
	`message_count` integer DEFAULT 0 NOT NULL,
	`first_ts` integer,
	`last_ts` integer,
	PRIMARY KEY(`group_id`, `member_id`),
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL,
	`name` text NOT NULL,
	`purpose` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'general' NOT NULL,
	`is_announcement` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `groups_community_name` ON `groups` (`community_id`,`name`);--> statement-breakpoint
CREATE TABLE `member_profiles` (
	`member_id` text NOT NULL,
	`run_id` integer NOT NULL,
	`one_liner` text DEFAULT '' NOT NULL,
	`interests` text DEFAULT '[]' NOT NULL,
	`expertise` text DEFAULT '[]' NOT NULL,
	`asks` text DEFAULT '[]' NOT NULL,
	`offers` text DEFAULT '[]' NOT NULL,
	`projects` text DEFAULT '[]' NOT NULL,
	`role_signals` text DEFAULT '[]' NOT NULL,
	`group_ids` text DEFAULT '[]' NOT NULL,
	`richness` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	PRIMARY KEY(`run_id`, `member_id`),
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `analysis_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` integer NOT NULL,
	`first_seen` integer,
	`last_seen` integer,
	`message_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_id` integer NOT NULL,
	`member_id` text,
	`ts` integer NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'text' NOT NULL,
	`upload_id` integer,
	`dedupe_hash` text NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`upload_id`) REFERENCES `uploads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_group_dedupe` ON `messages` (`group_id`,`dedupe_hash`);--> statement-breakpoint
CREATE INDEX `messages_group_ts` ON `messages` (`group_id`,`ts`);--> statement-breakpoint
CREATE INDEX `messages_member` ON `messages` (`member_id`);--> statement-breakpoint
CREATE TABLE `recommendations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`community_id` integer NOT NULL,
	`rank` integer NOT NULL,
	`type` text NOT NULL,
	`tier` text NOT NULL,
	`title` text NOT NULL,
	`why` text NOT NULL,
	`why_now` text NOT NULL,
	`evidence` text DEFAULT '[]' NOT NULL,
	`people` text DEFAULT '[]' NOT NULL,
	`where_group_id` integer,
	`action` text NOT NULL,
	`ready_message` text NOT NULL,
	`extras` text,
	`confidence` text DEFAULT 'medium' NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`feedback_note` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `analysis_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`where_group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `recommendations_run` ON `recommendations` (`run_id`);--> statement-breakpoint
CREATE TABLE `threads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`group_id` integer NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`member_ids` text DEFAULT '[]' NOT NULL,
	`message_ids` text DEFAULT '[]' NOT NULL,
	`ts` integer,
	FOREIGN KEY (`run_id`) REFERENCES `analysis_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `threads_run` ON `threads` (`run_id`);--> statement-breakpoint
CREATE TABLE `topics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`name` text NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`member_ids` text DEFAULT '[]' NOT NULL,
	`message_ids` text DEFAULT '[]' NOT NULL,
	`group_ids` text DEFAULT '[]' NOT NULL,
	`momentum` text DEFAULT 'steady' NOT NULL,
	`workshop_potential` text DEFAULT 'low' NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `analysis_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `topics_run` ON `topics` (`run_id`);--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_id` integer NOT NULL,
	`filename` text NOT NULL,
	`format` text NOT NULL,
	`sha256` text NOT NULL,
	`message_count` integer NOT NULL,
	`inserted_count` integer NOT NULL,
	`first_ts` integer,
	`last_ts` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
