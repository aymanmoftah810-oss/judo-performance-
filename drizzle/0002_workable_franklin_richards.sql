CREATE TABLE `coachPlayerAssignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`coachAccountId` int NOT NULL,
	`playerProfileId` int NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`assignedByAccountId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `coachPlayerAssignments_id` PRIMARY KEY(`id`),
	CONSTRAINT `coach_player_assignment_unique` UNIQUE(`coachAccountId`,`playerProfileId`)
);
--> statement-breakpoint
CREATE TABLE `playerProfiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`syncId` varchar(64) NOT NULL,
	`sourceDeviceId` varchar(128),
	`sourceLocalId` int,
	`name` varchar(160) NOT NULL,
	`gender` enum('ذكر','أنثى') NOT NULL,
	`birthYear` int NOT NULL,
	`snapshot` text NOT NULL,
	`createdByAccountId` int NOT NULL,
	`archivedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `playerProfiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `player_profiles_sync_id_unique` UNIQUE(`syncId`)
);
--> statement-breakpoint
CREATE TABLE `playerResults` (
	`id` int AUTO_INCREMENT NOT NULL,
	`syncId` varchar(64) NOT NULL,
	`playerProfileId` int NOT NULL,
	`sourceLocalId` int,
	`testId` int NOT NULL,
	`value` double NOT NULL,
	`score` double,
	`rating` varchar(32),
	`date` varchar(10) NOT NULL,
	`notes` text,
	`snapshot` text,
	`deletedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `playerResults_id` PRIMARY KEY(`id`),
	CONSTRAINT `player_results_sync_id_unique` UNIQUE(`syncId`)
);
--> statement-breakpoint
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_player_id_unique` UNIQUE(`playerId`);--> statement-breakpoint
CREATE INDEX `coach_player_assignment_profile_idx` ON `coachPlayerAssignments` (`playerProfileId`);--> statement-breakpoint
CREATE INDEX `player_profiles_created_by_idx` ON `playerProfiles` (`createdByAccountId`);--> statement-breakpoint
CREATE INDEX `player_results_profile_date_idx` ON `playerResults` (`playerProfileId`,`date`);