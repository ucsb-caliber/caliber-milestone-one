# Database Migrations

This project uses [Alembic](https://alembic.sqlalchemy.org/) for database schema migrations.

## Quick Start

### Apply Migrations (Upgrade Database)

To apply all pending migrations to your database:

```bash
cd backend
alembic upgrade head
```

If you get a DUPLICATE COLUMN error, it just means our database already has the newest columns, and you just need to run:

```bash
alembic stamp <name of newest migration file>
alembic upgrade head
```
For example: 
```bash
alembic stamp 004_add_is_verified_to_question
alembic upgrade head
```

### Check Current Migration Status

```bash
alembic current
```

### View Migration History

```bash
alembic history --verbose
```

## Creating New Migrations

### Auto-generate Migration from Model Changes

When you modify models in `app/models.py`, Alembic can auto-generate a migration:

```bash
# After changing app/models.py
alembic revision --autogenerate -m "description of your changes"
```

**Important**: Always review auto-generated migrations! They may not capture everything correctly.

### Create Empty Migration (Manual)

For complex changes, create an empty migration and write it manually:

```bash
alembic revision -m "description of your changes"
```

Then edit the generated file in `alembic/versions/` to add your upgrade/downgrade logic.

## Common Migration Operations

### Adding a Column

```python
def upgrade():
    op.add_column('table_name', sa.Column('column_name', sa.String(), nullable=True))
    op.create_index('ix_table_name_column_name', 'table_name', ['column_name'])
```

### Removing a Column

```python
def upgrade():
    op.drop_index('ix_table_name_column_name', table_name='table_name')
    op.drop_column('table_name', 'column_name')
```

### Adding Foreign Key

```python
def upgrade():
    op.create_foreign_key(
        'fk_question_user_id',  # constraint name
        'question',  # source table
        'auth.users',  # target table (Supabase auth table)
        ['user_id'],  # source column
        ['id'],  # target column
        ondelete='CASCADE'  # optional: delete questions when user is deleted
    )
```

### Creating Index

```python
def upgrade():
    op.create_index('ix_question_created_at', 'question', ['created_at'])
```

## Rollback Migrations

### Rollback One Migration

```bash
alembic downgrade -1
```

### Rollback to Specific Revision

```bash
alembic downgrade <revision_id>
```

### Rollback All Migrations

```bash
alembic downgrade base
```

## Initial Setup (First Time)

If this is your first time running migrations on a new database:

1. Make sure your `.env` file has the correct `DATABASE_URL`
2. Run migrations:
   ```bash
   alembic upgrade head
   ```

## Migration Best Practices

1. **Always test migrations** on a development database first
2. **Review auto-generated migrations** - they're not always perfect
3. **Write downgrade logic** - always make migrations reversible when possible
4. **Use descriptive names** - make it clear what the migration does
5. **One logical change per migration** - don't combine unrelated changes
6. **Backup production data** before running migrations
7. **Test both upgrade and downgrade** paths

## Troubleshooting

### "column already exists" error

If you get this error, the column might already exist in your database but not in migration history:

```bash
# Option 1: Mark migration as applied without running it
alembic stamp head

# Option 2: Manually remove the column and re-run migration
# (Use SQL editor in Supabase)
```

### "revision not found" error

Your database might be out of sync with migrations:

```bash
# Check current revision
alembic current

# Check available revisions
alembic history
```

### Reset migration history (DANGER - data loss)

```bash
# This will drop all tables and re-run migrations from scratch
alembic downgrade base
alembic upgrade head
```

## Current Migrations

### 001_add_user_id
- **Purpose**: Add `user_id` column for per-user data isolation
- **Changes**:
  - Adds `user_id` column to `question` table
  - Creates index on `user_id` for query performance
  - Column is nullable to support existing data

## Supabase-Specific Notes

When working with Supabase:

- The database URL uses connection pooling: `pooler.supabase.com`
- Auth tables are in `auth` schema: `auth.users`
- Don't modify `auth` schema tables directly
- Use foreign keys to reference `auth.users(id)` for user relationships

## Example: Adding User Foreign Key

If you want to enforce referential integrity with Supabase auth users:

```bash
# Create new migration
alembic revision -m "add foreign key to auth users"
```

Then edit the migration file:

```python
def upgrade():
    op.create_foreign_key(
        'fk_question_user_id',
        'question',
        'users',  # In Supabase, just use 'users', schema is handled
        ['user_id'],
        ['id'],
        ondelete='CASCADE',
        schema_source=None,
        schema_target='auth'  # Specify auth schema for target
    )

def downgrade():
    op.drop_constraint('fk_question_user_id', 'question', type_='foreignkey')
```
