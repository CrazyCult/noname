CREATE TABLE `progression_observations` (
  `id` int AUTO_INCREMENT NOT NULL,
  `player_id` int NOT NULL,
  `interval` varchar(20) NOT NULL,
  `overall` int DEFAULT 0,
  `pace` int DEFAULT 0,
  `shooting` int DEFAULT 0,
  `passing` int DEFAULT 0,
  `dribbling` int DEFAULT 0,
  `defense` int DEFAULT 0,
  `physical` int DEFAULT 0,
  `observed_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `progression_observations_id` PRIMARY KEY(`id`),
  CONSTRAINT `progression_observations_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`)
);
--> statement-breakpoint
CREATE INDEX `progression_observation_player_interval_date_idx` ON `progression_observations` (`player_id`,`interval`,`observed_at`);
--> statement-breakpoint
CREATE TABLE `player_history_events` (
  `player_id` int NOT NULL,
  `event_date` timestamp(3) NOT NULL,
  `values` json NOT NULL,
  `fetched_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `player_history_events_player_id_event_date_pk` PRIMARY KEY(`player_id`,`event_date`),
  CONSTRAINT `player_history_events_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`)
);
--> statement-breakpoint
CREATE INDEX `history_event_date_idx` ON `player_history_events` (`event_date`);
--> statement-breakpoint
CREATE TABLE `player_predictions` (
  `player_id` int NOT NULL,
  `predicted_gain` int NOT NULL,
  `predicted_overall` int NOT NULL,
  `probability_gain_10` int NOT NULL,
  `probability_gain_15` int NOT NULL,
  `probability_gain_20` int NOT NULL,
  `probability_gain_25` int NOT NULL,
  `probability_gain_30` int NOT NULL,
  `sample_size` int NOT NULL,
  `confidence` int NOT NULL,
  `model_version` varchar(40) NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `player_predictions_player_id` PRIMARY KEY(`player_id`),
  CONSTRAINT `player_predictions_player_id_players_id_fk` FOREIGN KEY (`player_id`) REFERENCES `players`(`id`)
);
