CREATE TABLE `news_briefs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`community_id` integer NOT NULL,
	`run_id` integer,
	`items` text DEFAULT '[]' NOT NULL,
	`tokens_in` integer DEFAULT 0 NOT NULL,
	`tokens_out` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `analysis_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `news_briefs_community` ON `news_briefs` (`community_id`);