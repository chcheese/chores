CREATE TABLE `api_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`last_used_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_token_hash_unique` ON `api_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `chores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`room` text DEFAULT '' NOT NULL,
	`icon` text DEFAULT '🧹' NOT NULL,
	`points` integer DEFAULT 10 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`schedule_type` text NOT NULL,
	`interval_value` integer DEFAULT 7 NOT NULL,
	`interval_unit` text DEFAULT 'day' NOT NULL,
	`rrule` text,
	`anchor_date` text,
	`tolerance_days` integer DEFAULT 2 NOT NULL,
	`next_due` text NOT NULL,
	`last_done` text,
	`assignment_mode` text DEFAULT 'anyone' NOT NULL,
	`assigned_user_id` integer,
	`rotation_user_ids` text DEFAULT '[]' NOT NULL,
	`rotation_index` integer DEFAULT 0 NOT NULL,
	`counter_target` integer,
	`counter_value` integer DEFAULT 0 NOT NULL,
	`counter_label` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`assigned_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `chores_next_due_idx` ON `chores` (`next_due`);--> statement-breakpoint
CREATE TABLE `completions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chore_id` integer NOT NULL,
	`user_id` integer,
	`kind` text DEFAULT 'done' NOT NULL,
	`done_at` text NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`prev_state` text NOT NULL,
	FOREIGN KEY (`chore_id`) REFERENCES `chores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `completions_chore_idx` ON `completions` (`chore_id`,`done_at`);--> statement-breakpoint
CREATE INDEX `completions_user_idx` ON `completions` (`user_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'adult' NOT NULL,
	`avatar` text DEFAULT '🙂' NOT NULL,
	`color` text DEFAULT '#5b8def' NOT NULL,
	`pin_hash` text,
	`points_total` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_name_unique` ON `users` (`name`);