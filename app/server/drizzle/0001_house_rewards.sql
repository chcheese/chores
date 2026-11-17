CREATE TABLE `reward_claims` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reward_id` integer,
	`title` text NOT NULL,
	`icon` text NOT NULL,
	`cost` integer NOT NULL,
	`user_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`decided_at` text,
	`decided_by` integer,
	FOREIGN KEY (`reward_id`) REFERENCES `rewards`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `reward_claims_user_idx` ON `reward_claims` (`user_id`);--> statement-breakpoint
CREATE INDEX `reward_claims_status_idx` ON `reward_claims` (`status`);--> statement-breakpoint
CREATE TABLE `rewards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`icon` text DEFAULT '🎁' NOT NULL,
	`cost` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `chores` ADD `duration_minutes` integer;--> statement-breakpoint
ALTER TABLE `chores` ADD `active_months` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
-- Backfill estimated durations for chores created from the 0.1 template catalogue.
UPDATE `chores` SET `duration_minutes` = 20 WHERE `title` = 'Betten frisch beziehen' AND `duration_minutes` IS NULL;--> statement-breakpoint
UPDATE `chores` SET `duration_minutes` = 30 WHERE `title` = 'Boden saugen' AND `duration_minutes` IS NULL;--> statement-breakpoint
UPDATE `chores` SET `duration_minutes` = 30 WHERE `title` = 'Boden wischen' AND `duration_minutes` IS NULL;--> statement-breakpoint
UPDATE `chores` SET `duration_minutes` = 30 WHERE `title` = 'Bäder / WC putzen' AND `duration_minutes` IS NULL;--> statement-breakpoint
UPDATE `chores` SET `duration_minutes` = 5 WHERE `title` = 'Geschirrspüler-Sieb ausspülen' AND `duration_minutes` IS NULL;--> statement-breakpoint
UPDATE `chores` SET `duration_minutes` = 15 WHERE `title` = 'Geschirrspüler Filter + Sprüharme reinigen' AND `duration_minutes` IS NULL;--> statement-breakpoint
UPDATE `chores` SET `duration_minutes` = 15 WHERE `title` = 'Waschmaschine reinigen' AND `duration_minutes` IS NULL;--> statement-breakpoint
UPDATE `chores` SET `duration_minutes` = 20 WHERE `title` = 'Kühlschrank auswischen' AND `duration_minutes` IS NULL;--> statement-breakpoint
UPDATE `chores` SET `duration_minutes` = 40 WHERE `title` = 'Backofen reinigen' AND `duration_minutes` IS NULL;--> statement-breakpoint
UPDATE `chores` SET `duration_minutes` = 10 WHERE `title` = 'Dampfabzug-Fettfilter reinigen' AND `duration_minutes` IS NULL;--> statement-breakpoint
UPDATE `chores` SET `duration_minutes` = 15 WHERE `title` = 'Entkalken' AND `duration_minutes` IS NULL;--> statement-breakpoint
UPDATE `chores` SET `duration_minutes` = 90 WHERE `title` = 'Fenster putzen' AND `duration_minutes` IS NULL;--> statement-breakpoint
UPDATE `chores` SET `duration_minutes` = 10 WHERE `title` = 'Matratzen drehen/wenden' AND `duration_minutes` IS NULL;--> statement-breakpoint
UPDATE `chores` SET `duration_minutes` = 10 WHERE `title` = 'Rauchmelder testen' AND `duration_minutes` IS NULL;--> statement-breakpoint
UPDATE `chores` SET `duration_minutes` = 60 WHERE `title` = 'Tiefkühler abtauen' AND `duration_minutes` IS NULL;
