# Fieldwork Database

This package contains the database migrations and schema definitions for the Fieldwork application.

## Structure

```
packages/database/
├── migrations/          # SQL migration files
│   └── 001_initial_schema.sql
├── package.json         # Package configuration
└── README.md           # This file
```

## Migrations

The database uses PostgreSQL and migrations are handled automatically by SST during deployment.

### Current Schema

The database contains three main tables:

1. **plots** - Stores field plot information including geometry and metadata
2. **settings** - Application configuration settings
3. **plot_images** - Stores image data associated with plots

### Migration Files

- `001_initial_schema.sql` - Initial database setup with all tables and indexes

### Adding New Migrations

To add a new migration:

1. Create a new SQL file in the `migrations/` directory
2. Use the naming convention: `XXX_description.sql` (where XXX is a sequential number)
3. The migration will be automatically applied during the next SST deployment

### Schema Compatibility

The database schema is designed to be compatible with the Zero database schema defined in `src/schema.ts`. The SQL schema matches the TypeScript definitions for seamless integration.

## Development

For local development, you can run PostgreSQL locally and configure the SST dev environment to connect to it. See the main SST configuration for details. 