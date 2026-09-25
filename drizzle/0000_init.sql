CREATE TABLE `app_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `easystaff_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `google_account` (
	`id` integer PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`refresh_token_enc` text NOT NULL,
	`scopes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'ok' NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lesson_snapshot` (
	`config_id` text NOT NULL,
	`source_id` text NOT NULL,
	`google_event_id` text NOT NULL,
	`content_hash` text NOT NULL,
	`event_hash` text NOT NULL,
	`status` text NOT NULL,
	`lesson_json` text NOT NULL,
	`cancelled_at` text,
	`removed_at` text,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`last_synced_at` text NOT NULL,
	PRIMARY KEY(`config_id`, `source_id`),
	FOREIGN KEY (`config_id`) REFERENCES `sync_config`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `lock` (
	`name` text PRIMARY KEY NOT NULL,
	`holder` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_config` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`aa` text NOT NULL,
	`aa_label` text NOT NULL,
	`course_code` text NOT NULL,
	`course_label` text NOT NULL,
	`curricula` text NOT NULL,
	`selected_courses` text NOT NULL,
	`excluded_courses` text NOT NULL,
	`pending_courses` text DEFAULT '[]' NOT NULL,
	`seen_courses` text DEFAULT '[]' NOT NULL,
	`surname_initial` text DEFAULT '' NOT NULL,
	`calendar_id` text,
	`calendar_name` text,
	`calendar_color` text,
	`options` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`pause_reason` text,
	`consecutive_anomalies` integer DEFAULT 0 NOT NULL,
	`last_anomaly` text,
	`last_run_at` text,
	`last_success_at` text,
	`last_error` text,
	`file_date` text,
	`window_start` text,
	`window_end` text,
	`periods` text,
	`last_response_count` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`config_id` text,
	`run_id` integer,
	`at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`level` text NOT NULL,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`lesson_start` text,
	`details` text,
	FOREIGN KEY (`config_id`) REFERENCES `sync_config`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sync_log_config_idx` ON `sync_log` (`config_id`,`id`);--> statement-breakpoint
CREATE TABLE `sync_run` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`config_id` text NOT NULL,
	`trigger` text NOT NULL,
	`dry_run` integer DEFAULT false NOT NULL,
	`status` text NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`done` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`counts` text,
	`error` text,
	`started_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`config_id`) REFERENCES `sync_config`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sync_run_config_idx` ON `sync_run` (`config_id`,`id`);