ALTER TABLE `playerProfiles` ADD `updatedByAccountId` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `playerResults` ADD `createdByAccountId` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `playerResults` ADD `updatedByAccountId` int NOT NULL DEFAULT 0;
