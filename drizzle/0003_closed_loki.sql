CREATE TABLE `auditLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorAccountId` int NOT NULL,
	`action` varchar(96) NOT NULL,
	`entity` varchar(64) NOT NULL,
	`entitySyncId` varchar(64),
	`metadata` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `syncConflicts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entity` varchar(64) NOT NULL,
	`syncId` varchar(64) NOT NULL,
	`playerProfileId` int,
	`localPayload` text NOT NULL,
	`remotePayload` text NOT NULL,
	`syncConflictStatus` enum('PENDING','KEEP_LOCAL','KEEP_REMOTE','MERGED') NOT NULL DEFAULT 'PENDING',
	`detectedByAccountId` int NOT NULL,
	`resolvedByAccountId` int,
	`resolutionNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	CONSTRAINT `syncConflicts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `playerProfiles` ADD `revision` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `playerResults` ADD `revision` int DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX `audit_logs_actor_created_idx` ON `auditLogs` (`actorAccountId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_logs_entity_sync_idx` ON `auditLogs` (`entity`,`entitySyncId`);--> statement-breakpoint
CREATE INDEX `sync_conflicts_status_idx` ON `syncConflicts` (`syncConflictStatus`,`createdAt`);--> statement-breakpoint
CREATE INDEX `sync_conflicts_entity_sync_idx` ON `syncConflicts` (`entity`,`syncId`);