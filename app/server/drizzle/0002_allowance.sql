ALTER TABLE `reward_claims` ADD `kind` text DEFAULT 'reward' NOT NULL;--> statement-breakpoint
ALTER TABLE `reward_claims` ADD `amount_rappen` integer;--> statement-breakpoint
ALTER TABLE `reward_claims` ADD `note` text DEFAULT '' NOT NULL;