-- Migration: add simulation_date column to transactions
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS simulation_date DATE;