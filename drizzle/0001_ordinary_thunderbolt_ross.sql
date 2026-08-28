CREATE TABLE `accountSettings` (
	`key` varchar(128) NOT NULL,
	`value` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `accountSettings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(64) NOT NULL,
	`displayName` varchar(160) NOT NULL,
	`passwordHash` varchar(512) NOT NULL,
	`accountRole` enum('ADMIN','COACH','PLAYER') NOT NULL,
	`playerId` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`mustChangePassword` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp,
	CONSTRAINT `accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `accounts_username_unique` UNIQUE(`username`)
);
