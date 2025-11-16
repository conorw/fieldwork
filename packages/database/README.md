# Fieldwork Database

This directory contains the database migrations and schema definitions for the Fieldwork application.

## Structure

```
packages/database/
├── migrations/          # SQL migration files
│   └── 001_initial_schema.sql
└── README.md           # This file
```

## Migrations

The database uses PostgreSQL (via Supabase) and PowerSync for local-first data synchronization.

### Current Schema

The database contains the following tables:

1. **plots** - Stores field plot information including geometry and metadata
2. **settings** - Application configuration settings
3. **plot_images** - Stores image data associated with plots
4. **persons** - Stores information about deceased individuals linked to burial plots
5. **person_images** - Stores images associated with persons
6. **locations** - Stores saved map locations with extent and PMTiles URLs

### Migration Files

- `001_initial_schema.sql` - Initial database setup with all tables, indexes, and foreign key constraints

### Adding New Migrations

To add a new migration:

1. Create a new SQL file in the `migrations/` directory
2. Use the naming convention: `XXX_description.sql` (where XXX is a sequential number)
3. Apply the migration to your Supabase database manually or through your deployment process

### Schema Compatibility

The database schema is designed to work with PowerSync for local-first data synchronization. The SQL schema matches the PowerSync schema definitions in `src/powersync-schema.ts` for seamless integration. 