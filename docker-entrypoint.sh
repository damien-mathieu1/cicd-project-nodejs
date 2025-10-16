#!/bin/sh

# Run migrations with force flag for production
echo "Running database migrations..."
yes | node ace migration:run

# # Run seeds with force flag for production
# echo "Running database seeds..."
# yes | node ace db:seed

# Start the server
echo "Starting the server..."
exec "$@"
