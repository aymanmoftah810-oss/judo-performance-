CREATE TABLE `centralTestSessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`syncId` varchar(64) NOT NULL,
	`sourceLocalId` int,
	`testId` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`date` varchar(10) NOT NULL,
	`playerProfileIds` text NOT NULL,
	`batchSize` int NOT NULL,
	`currentBatch` int NOT NULL,
	`testSessionStatus` enum('draft','active','completed') NOT NULL,
	`snapshot` text,
	`createdByAccountId` int NOT NULL DEFAULT 0,
	`updatedByAccountId` int NOT NULL DEFAULT 0,
	`revision` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `centralTestSessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `central_test_sessions_sync_id_unique` UNIQUE(`syncId`)
);
--> statement-breakpoint
CREATE TABLE `playerAttendances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`syncId` varchar(64) NOT NULL,
	`playerProfileId` int NOT NULL,
	`sourceLocalId` int,
	`date` varchar(10) NOT NULL,
	`season` varchar(32) NOT NULL,
	`month` varchar(10) NOT NULL,
	`club` varchar(160) NOT NULL,
	`attendanceStatus` enum('present','absent','injured','excused') NOT NULL,
	`notes` text,
	`snapshot` text,
	`createdByAccountId` int NOT NULL DEFAULT 0,
	`updatedByAccountId` int NOT NULL DEFAULT 0,
	`revision` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `playerAttendances_id` PRIMARY KEY(`id`),
	CONSTRAINT `player_attendances_sync_id_unique` UNIQUE(`syncId`)
);
--> statement-breakpoint
CREATE INDEX `central_test_sessions_date_idx` ON `centralTestSessions` (`date`);--> statement-breakpoint
CREATE INDEX `player_attendances_profile_date_idx` ON `playerAttendances` (`playerProfileId`,`date`);
