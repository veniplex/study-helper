#!/bin/sh
set -e

echo "Running database migrations..."
node node_modules/drizzle-kit/bin.cjs migrate

echo "Starting StudyHelper..."
exec node server.js
