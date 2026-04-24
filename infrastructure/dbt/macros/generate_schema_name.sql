{# Creator Hub — override dbt's default schema concatenation.

   Default dbt behavior is `{{ target.schema }}_{{ custom_schema_name }}`,
   which would materialize marts into `public_marts` and staging into
   `public_staging`. We want marts in `marts` and staging in `staging` so:
     - supabase/migrations/0004_mart_views.sql can reference
       `marts.mart_*` without a `public_` prefix
     - ad-hoc `select * from marts.mart_post_performance` works from psql
   When no custom schema is set on a model, fall back to target.schema
   (i.e. `public`) — this preserves the default behavior for unmanaged models.
#}
{% macro generate_schema_name(custom_schema_name, node) -%}
    {%- if custom_schema_name is none -%}
        {{ target.schema | trim }}
    {%- else -%}
        {{ custom_schema_name | trim }}
    {%- endif -%}
{%- endmacro %}
