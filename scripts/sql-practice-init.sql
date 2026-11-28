-- Песочница SQL-тренажёра: роль и база для запросов учеников.
-- Запускается автоматически при первом старте контейнера postgres.
create role sql_practice login password 'sql_practice';
create database sql_practice owner sql_practice;
